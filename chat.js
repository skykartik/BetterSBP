// Steam sign-in + friends + chat inside betterSBP, using the Steam network directly (npm "steam-user").
// No Steam client needs to be running. The password is never stored; only Steam's refresh token is kept
// (encrypted with the OS keystore via Electron safeStorage when available).
const fs = require('fs'), path = require('path');

const histTried = new Map(), histDone = new Set();
module.exports = function createChat({ app, safeStorage, getCfg, saveCfg, notify }) {
  let SU = null, SS = null, QR = null, err = null, qrSess = null, qrT = null, qrImg = '', qrGen = 0, qrScanned = false;
  try { SS = require('steam-session'); QR = require('qrcode'); } catch {}
  try { SU = require('steam-user'); } catch (e) { err = 'The "steam-user" package is missing. Run "npm install" in the betterSBP folder.'; }

  // the Steam password is kept (encrypted by the OS keystore) only so SteamCMD downloads can reuse the one in-app login; Settings > Downloads can switch it off
  const pwFile = () => require('path').join(app.getPath('userData'), 'steam-pw.bin');
  const savePw = p => { const fs = require('fs'); try { if (!p || (getCfg().prefs || {}).dlSavePass === false) { fs.rmSync(pwFile(), { force: true }); return; } if (safeStorage && safeStorage.isEncryptionAvailable()) fs.writeFileSync(pwFile(), safeStorage.encryptString(String(p))); } catch {} };
  const loadPw = () => { try { if ((getCfg().prefs || {}).dlSavePass === false) return null; return safeStorage.decryptString(require('fs').readFileSync(pwFile())); } catch { return null; } };
  let tokC = null, loggedAt = 0, wasToken = false, usedPw = false, retries = 0, retryT = null, cl = null, state = 'out', name = '', me = null, pending = null, lastErr = '', pass = null;
  const personas = new Map(), msgs = new Map(), unread = new Map();   // id -> persona / [{me,text,t}] / count
  const tokFile = () => path.join(app.getPath('userData'), 'steam-token.bin');
  let remember = true;
  const saveTok = t => { if (!remember) return; try { fs.writeFileSync(tokFile(), safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t)); } catch {} };
  const loadTok = () => { try { const b = fs.readFileSync(tokFile()); return safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString(); } catch { return null; } };
  const send = () => notify('chat:state', status());
  const status = () => ({ hasToken: !!(loadTok() && getCfg().steamLogin), avatar: (personas.get(me) || {}).avatar || '', persona: (personas.get(me) || {}).name || '', available: !!SU, qrOk: !!(SS && QR), qr: qrImg, qrScanned, error: err, state, name, me, lastErr, guard: pending ? { domain: pending.domain, wrong: pending.wrong, device: pending.device } : null, unread: [...unread.values()].reduce((a, b) => a + b, 0) });
  const sid = s => (s && s.getSteamID64 ? s.getSteamID64() : String(s));

  function persona(id, u) {
    const p = personas.get(id) || { id };
    if (u) {
      p.name = u.player_name || p.name; p.state = u.persona_state != null ? u.persona_state : p.state;
      p.game = u.game_name || (u.gameid && u.gameid !== '0' ? 'a game' : '');
      p.avatar = u.avatar_url_full || u.avatar_url_medium || p.avatar;
    }
    personas.set(id, p); return p;
  }

  function hook(c) {
    c.on('loggedOn', () => {
      state = 'in'; loggedAt = Date.now(); lastErr = ''; pending = null; retries = 0; clearTimeout(retryT); me = sid(c.steamID); try { c.setPersona(SU.EPersonaState.Online); } catch {}
      const cfg = getCfg(); cfg.steamLogin = name; saveCfg(); send();
      try { c.getPersonas(Object.keys(c.myFriends || {}).concat([me])).catch(() => {}); } catch {}
    });
    c.on('refreshToken', t => saveTok(t));
    c.on('steamGuard', (domain, cb, wrong) => { pending = { cb, domain, wrong: !!wrong }; state = 'guard'; send(); });
    c.on('user', (s, u) => {
      const id = sid(s), old = personas.get(id), pS = old ? old.state : undefined, pG = old ? old.game : undefined;
      persona(id, u); const p = personas.get(id); notify('chat:persona', p); if (id === me) send();
      // corner pop-ups: a friend came online / started a game (ignored for the first seconds after sign-in so the initial list doesn't spam)
      if (id !== me && Date.now() - loggedAt > 20000 && cl && cl.myFriends && cl.myFriends[id] === SU.EFriendRelationship.Friend && getCfg().prefs && getCfg().prefs.popups !== false) {
        const PP = getCfg().prefs || {};
        if ((!pS || pS === 0) && p.state > 0 && pS !== undefined && PP.popOnline !== false) notify('popup', { kind: 'steam', title: p.name, body: 'is now online', icon: p.avatar });
        else if (p.game && p.game !== pG && pS !== undefined && PP.popGame !== false) notify('popup', { kind: 'steam', title: p.name, body: 'is playing ' + p.game, icon: p.avatar });
      }
    });
    c.on('friendMessage', (s, text) => {
      const id = sid(s), l = msgs.get(id) || []; l.push({ me: false, text, t: Date.now() }); msgs.set(id, l);
      unread.set(id, (unread.get(id) || 0) + 1); notify('chat:msg', { id, text, me: false, t: Date.now() }); send();
      if ((getCfg().prefs || {}).popMsg !== false) { const p = personas.get(id) || {}; notify('popup', { kind: 'steam', title: p.name || 'Steam message', body: text, icon: p.avatar }); }
    });
    c.on('friendMessageEcho', (s, text) => { const id = sid(s), l = msgs.get(id) || []; l.push({ me: true, text, t: Date.now() }); msgs.set(id, l); notify('chat:msg', { id, text, me: true, t: Date.now() }); });
    c.on('error', e => {
      const m = String(e && e.message || e); pending = null;
      // Only a refresh token Steam explicitly rejects (twice in a row) counts as signed out. Network drops / Steam busy / rate limits keep the token and retry.
      const bad = /Expired|AccessDenied|InvalidPassword|Revoked/i.test(m);
      if (usedPw) { if (/InvalidPassword/i.test(m)) savePw(null); state = 'out'; lastErr = /InvalidPassword/i.test(m) ? 'Wrong account name or password.' : /RateLimit/i.test(m) ? 'Too many attempts. Try again later.' : m; send(); return; }
      if (bad && retries >= 1) { state = 'out'; try { fs.unlinkSync(tokFile()); } catch {} lastErr = 'Your Steam session was revoked. Please sign in again.'; send(); return; }
      state = 'connecting'; lastErr = ''; send(); scheduleRetry();
    });
    c.on('disconnected', () => { if (state === 'in') { state = 'connecting'; send(); } });
    c.on('loggedOn', () => { try { const t = c.refreshToken; if (t) saveTok(t); } catch {} });
  }

  function scheduleRetry() {
    clearTimeout(retryT); const t = loadTok(); if (!t || !getCfg().steamLogin) return;
    retries++; const wait = Math.min(300000, 4000 * Math.pow(2, Math.min(retries, 6)));
    retryT = setTimeout(() => { if (state === 'in') return; name = getCfg().steamLogin; start({ refreshToken: loadTok() || t }, true); }, wait);
  }
  let ownedP = null, ownedCache = null;
  function hookOwn(c) { ownedP = new Promise(res => { c.once('appOwnershipCached', () => res(true)); setTimeout(() => res(false), 20000); }); ownedCache = null; }
  function start(opts, isRetry) {
    wasToken = !!opts.refreshToken; usedPw = !!opts.accountName && !opts.refreshToken; if (!isRetry) retries = 0; clearTimeout(retryT);
    if (!SU) { lastErr = err; send(); return false; }
    try { cl && cl.logOff(); } catch {}
    cl = new SU({ autoRelogin: true, dataDirectory: path.join(app.getPath('userData'), 'steam-user'), renewRefreshTokens: true, enablePicsCache: true });
    hook(cl); hookOwn(cl); state = 'connecting'; lastErr = ''; send();
    try { cl.logOn(opts); } catch (e) { state = 'out'; lastErr = e.message; send(); }
    return true;
  }

  return {
    status,
    // Sign in by scanning a QR code with the Steam mobile app (no password typed on the TV)
    // Both QR and password sign-in go through steam-session, which we control (generous time limits, Steam Guard by phone approval or code)
    _finish(s) { remember = remember !== false; clearInterval(qrT); name = s.accountName || name; saveTok(s.refreshToken); qrSess = null; qrImg = ''; qrScanned = false; pending = null; start({ refreshToken: s.refreshToken }); },
    async loginQR() {
      if (!SS || !QR) { lastErr = 'QR sign-in needs the "steam-session" and "qrcode" packages. Run "npm install".'; send(); return false; }
      this.cancelQR(); state = 'qr'; lastErr = ''; qrImg = ''; send();
      const gen = ++qrGen, dead = () => gen !== qrGen;
      try {
        const s = qrSess = new SS.LoginSession(SS.EAuthTokenPlatformType.SteamClient); s.loginTimeout = 600000;   // default is 30 s: the code "expired" while it was being scanned
        s.on('remoteInteraction', () => { if (!dead()) { qrScanned = true; send(); } });
        s.on('authenticated', () => { if (!dead()) { remember = true; this._finish(s); } });
        s.on('timeout', () => { clearInterval(qrT); if (!dead() && state === 'qr') this.loginQR(); });
        s.on('error', e => { clearInterval(qrT); if (dead()) return; qrScanned = false; state = 'out'; lastErr = String(e && e.message || e); qrImg = ''; send(); });
        const r = await Promise.race([s.startWithQR(), new Promise((_, rej) => setTimeout(() => rej(new Error('Steam did not answer. Check your connection and press "Show QR code".')), 20000))]);
        if (dead()) return false;
        let lastUrl = '';
        const draw = async () => { const u = s.qrChallengeUrl || r.qrChallengeUrl; if (u && u !== lastUrl && !dead()) { lastUrl = u; qrImg = await QR.toDataURL(u, { margin: 1, width: 360, color: { dark: '#0b0e16', light: '#ffffff' } }); send(); } };
        await draw(); qrT = setInterval(() => draw().catch(() => {}), 2000);
        return true;
      } catch (e) { if (gen === qrGen) { state = 'out'; lastErr = String(e && e.message || e); qrImg = ''; send(); } return false; }
    },
    cancelQR() { qrGen++; qrScanned = false; clearInterval(qrT); try { qrSess && qrSess.cancelLoginAttempt(); } catch {} qrSess = null; qrImg = ''; if (state === 'qr' || state === 'guard' && pending && pending.sess) { pending = null; state = 'out'; send(); } },
    // user + password are only kept in memory (so a SteamCMD download can reuse the password this session)
    async login(user, password, rem) {
      remember = rem !== false; this.cancelQR(); name = String(user || '').trim(); pass = password; lastErr = ''; if (password) savePw(password);
      if (!SS) return start({ accountName: name, password: String(password || '') });
      state = 'connecting'; send(); const gen = ++qrGen, dead = () => gen !== qrGen;
      try {
        const s = qrSess = new SS.LoginSession(SS.EAuthTokenPlatformType.SteamClient); s.loginTimeout = 600000;
        s.on('authenticated', () => { if (!dead()) this._finish(s); });
        s.on('timeout', () => { if (!dead()) { qrSess = null; pending = null; state = 'out'; lastErr = 'Sign-in took too long. Please try again.'; send(); } });
        s.on('error', e => { if (dead()) return; qrSess = null; pending = null; state = 'out'; lastErr = this._msg(e); send(); });
        const r = await s.startWithCredentials({ accountName: name, password: String(password || '') });
        if (dead()) return false;
        if (r.actionRequired) {
          const T = SS.EAuthSessionGuardType, acts = r.validActions || [], email = acts.find(x => x.type === T.EmailCode), dev = acts.find(x => x.type === T.DeviceCode || x.type === T.DeviceConfirmation);
          pending = { sess: true, domain: email && !dev ? (email.detail || 'your email') : '', device: !!dev, wrong: false, cb: code => s.submitSteamGuardCode(code) }; state = 'guard'; send();
        }
        return true;
      } catch (e) { if (gen === qrGen) { qrSess = null; pending = null; state = 'out'; lastErr = this._msg(e); send(); } return false; }
    },
    _msg(e) { const m = String(e && e.message || e); return /InvalidPassword/i.test(m) ? 'Wrong account name or password.' : /RateLimit/i.test(m) ? 'Too many attempts. Try again in a while.' : /AccountLogin|Denied/i.test(m) ? 'Steam refused this sign-in: ' + m : m; },
    guard(code) {
      if (!pending) return; const p = pending; pending = null; state = 'connecting'; send();
      if (p.sess) Promise.resolve(p.cb(String(code || '').trim())).catch(() => { pending = { ...p, wrong: true }; state = 'guard'; send(); });
      else p.cb(String(code || '').trim());
    },
    resume() { const t = loadTok(), n = getCfg().steamLogin; if (SU && t && n) { name = n; start({ refreshToken: t }); } },
    logout() { savePw(null); tokC = null; clearTimeout(retryT); try { cl && cl.logOff(); } catch {} cl = null; state = 'out'; me = null; pass = null; personas.clear(); try { fs.unlinkSync(tokFile()); } catch {} send(); },
    password: () => pass || loadPw(),
    savePw(p) { savePw(p); },
    setState(n) { try { cl && state === 'in' && cl.setPersona(+n); } catch {} },
    friends() {
      if (!cl || state !== 'in') return null;
      const R = SU.EFriendRelationship, out = [];
      for (const id of Object.keys(cl.myFriends || {})) if (cl.myFriends[id] === R.Friend) { const p = personas.get(id) || persona(id); out.push({ id, name: p.name || id, state: p.state || 0, game: p.game || '', avatar: p.avatar || '', unread: unread.get(id) || 0 }); }
      return out;
    },
    requests() {
      if (!cl || state !== 'in') return [];
      const R = SU.EFriendRelationship, out = [];
      for (const id of Object.keys(cl.myFriends || {})) if (cl.myFriends[id] === R.RequestRecipient) { const p = personas.get(id) || persona(id); out.push({ id, name: p.name || id, avatar: p.avatar || '' }); }
      return out;
    },
    respond(id, accept) { try { if (accept) cl.addFriend(id); else cl.removeFriend(id); return true; } catch { return false; } },
    // add by SteamID64, profile link (/profiles/ID or /id/name), custom URL name or friend code
    async addFriend(input) {
      if (!cl || state !== 'in') return { ok: false, msg: 'Sign in to Steam first.' };
      let s = String(input || '').trim(), id = null, m;
      if ((m = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(s))) id = m[1];
      else if (/^\d{17}$/.test(s)) id = s;
      else if (/^\d{1,10}$/.test(s)) id = String(BigInt(s) + 76561197960265728n);       // friend code = account id
      else { const name = (/steamcommunity\.com\/id\/([^/?#]+)/i.exec(s) || [, s.replace(/[^A-Za-z0-9_-]/g, '')])[1]; if (!name) return { ok: false, msg: 'Enter a friend code, profile link or SteamID.' }; try { const r = await fetch('https://steamcommunity.com/id/' + encodeURIComponent(name) + '/?xml=1'); const t = await r.text(); const x = /<steamID64>(\d{17})<\/steamID64>/.exec(t); if (x) id = x[1]; } catch {} }
      if (!id) return { ok: false, msg: 'No Steam profile found for that.' };
      if (id === sid(cl.steamID)) return { ok: false, msg: 'That is your own account.' };
      return new Promise(res => { let done = false; const t = setTimeout(() => { if (!done) { done = true; res({ ok: true, msg: 'Friend request sent.' }); } }, 6000); try { cl.addFriend(id, (err, name) => { if (done) return; done = true; clearTimeout(t); res(err ? { ok: false, msg: /Blocked|Ignored/i.test(String(err.message)) ? 'This person has blocked requests.' : /DuplicateName|AlreadyFriends/i.test(String(err.message)) ? 'You are already friends.' : String(err.message || err) } : { ok: true, msg: 'Friend request sent' + (name ? ' to ' + name : '') + '.' }); }); } catch (e) { done = true; clearTimeout(t); res({ ok: false, msg: String(e.message || e) }); } });
    },
    resetOwned() { ownedCache = null; },
    async history(id) {
      let l = msgs.get(id), tried = histTried.get(id) || 0;
      if ((!l || (!l.length && tried < 3) || !histDone.has(id)) && cl && state === 'in') {
        let got = null;
        try { const r = await cl.chat.getFriendMessageHistory(id, { maxCount: 60, wantBbcode: false }); got = (r.messages || []).map(m => ({ me: sid(m.sender) === me, text: String(m.message || ''), t: m.server_timestamp && m.server_timestamp.getTime ? m.server_timestamp.getTime() : Date.now() })); } catch { histTried.set(id, tried + 1); }
        if (got) { histDone.add(id); const live = (l || []).filter(m => !got.some(g => g.text === m.text && Math.abs(g.t - m.t) < 60000)); l = got.concat(live).sort((x, y) => x.t - y.t); msgs.set(id, l); }
      }
      unread.delete(id); send(); return l || [];
    },
    async say(id, text) {
      if (!cl || state !== 'in') throw new Error('Not signed in');
      await cl.chat.sendFriendMessage(id, String(text).slice(0, 2000));
      const l = msgs.get(id) || []; l.push({ me: true, text, t: Date.now() }); msgs.set(id, l); return true;
    },
    // call when the OS wakes from sleep or the network returns
    nudge() { if (state !== 'in' && loadTok() && getCfg().steamLogin) { retries = 0; name = getCfg().steamLogin; start({ refreshToken: loadTok() }); } },
    owns(ids) { try { return (ids || []).filter(i => cl && cl.ownsApp && cl.ownsApp(Number(i))).map(String); } catch { return []; } },
    // every game the signed-in account owns (no Web API key needed)
    async owned() {
      if (!cl || state !== 'in') return null; if (ownedCache) return ownedCache;
      try {
        await ownedP; const ids = cl.getOwnedApps ? cl.getOwnedApps({ excludeShared: getCfg().familyShare === false }) : []; const out = [];
        for (let i = 0; i < ids.length; i += 150) {
          const r = await cl.getProductInfo(ids.slice(i, i + 150), [], true);
          for (const id of ids.slice(i, i + 150)) { const a = r.apps && r.apps[id], cm = a && a.appinfo && a.appinfo.common; if (cm && /^game$/i.test(cm.type || '') && cm.name) out.push({ id: String(id), name: cm.name }); }
        }
        return (ownedCache = out);
      } catch { return null; }
    },
    // the game's own launch entries from Steam's app info (executable + arguments for Windows)
    async launchInfo(id) {
      if (!cl || state !== 'in') return null;
      try {
        const r = await cl.getProductInfo([+id], [], true), a = r.apps && r.apps[id], L = a && a.appinfo && a.appinfo.config && a.appinfo.config.launch; if (!L) return null;
        const c = Object.keys(L).sort((x, y) => x - y).map(k => L[k]).filter(e => e && e.executable && (!e.config || ((!e.config.oslist || /windows/i.test(e.config.oslist)) && !e.config.betakey && !e.config.ownsdlc)) && !/vr|server|editor|tool/i.test(String(e.type || '')));
        const e = c.find(x => !x.type || /default|none|launcher/i.test(x.type)) || c[0]; return e ? { exe: String(e.executable).replace(/\//g, '\\'), args: e.arguments || '', wd: e.workingdir || '' } : null;
      } catch { return null; }
    },
    // changes to the signed-in account's public profile (name / about), using the web session Steam gives us
    me() { return { id: me, name: (personas.get(me) || {}).name || name, avatar: (personas.get(me) || {}).avatar || '', account: name, state }; },
    cookies() { return new Promise(res => { if (!cl || state !== 'in') return res(null); let done = false; const t = setTimeout(() => !done && res(null), 8000); cl.once('webSession', (sid, ck) => { done = true; clearTimeout(t); res({ sid, cookies: ck }); }); try { cl.webLogOn(); } catch { res(null); } }); },
    // ---- native profile editing through Steam's web session (name, about, picture)
    async _web() {
      const w = await this.cookies(); if (!w) throw new Error('Not signed in to Steam.');
      const ck = (w.cookies || []).map(c => String(c).split(';')[0]).join('; '), sess = ((w.cookies || []).map(c => String(c).split(';')[0]).find(c => /^sessionid=/i.test(c)) || '').split('=')[1] || w.sid;
      return { ck: ck.includes('sessionid=') ? ck : ck + '; sessionid=' + sess, sess };
    },
    async webGet(url) { let ck = ''; try { ck = (await this._web()).ck; } catch {} const r = await fetch(url, { headers: { Cookie: ck, 'User-Agent': 'Mozilla/5.0 betterSBP' } }); return r.text(); },
    // ---- Steam web API through the signed-in session (profile items you own, equipping, privacy, cart)
    async _tok() {
      if (tokC && Date.now() - tokC.t < 15 * 60e3) return tokC.v;
      const j = JSON.parse(await this.webGet('https://steamcommunity.com/pointssummary/ajaxgetasyncconfig')), v = j && j.data && j.data.webapi_token;
      if (!v) throw new Error('Steam did not give this session web access. Try signing in again.'); tokC = { v, t: Date.now() }; return v;
    },
    async svc(iface, method, ver, params, post) {
      const t = await Promise.race([this._tok(), new Promise((_, rj) => setTimeout(() => rj(new Error('sign-in token timed out')), 12000))]), q = new URLSearchParams({ access_token: t, ...(post ? {} : (params || {})) }).toString();
      const r = await fetch(`https://api.steampowered.com/${iface}/${method}/v${ver}/?${q}`, post ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params || {}), signal: AbortSignal.timeout(15000) } : { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error('Steam answered ' + r.status); const j = await r.json().catch(() => ({})); return j.response || {};
    },
    async family() {
      if (!cl || state !== 'in') return { ok: false, msg: 'Sign in to Steam to see your family.' };
      const mine = sid(cl.steamID);
      let g; try { g = await this.svc('IFamilyGroupsService', 'GetFamilyGroupForUser', 1, { steamid: mine }); } catch (e) { return { ok: false, msg: 'Steam did not return your family (' + e.message + ').' }; }
      if (!g || !g.family_groupid || g.family_groupid === '0') return { ok: true, none: true };
      let fg = {}; try { fg = await this.svc('IFamilyGroupsService', 'GetFamilyGroup', 1, { family_groupid: g.family_groupid }); } catch {}
      const mem = (fg.members || []).map(m => ({ id: String(m.steamid), role: m.role, joined: (m.time_joined || 0) * 1000, cooldown: m.cooldown_seconds_remaining || 0 }));
      try { await Promise.race([cl.getPersonas(mem.map(m => m.id)), new Promise(r => setTimeout(r, 5000))]); } catch {}
      mem.forEach(m => { const p = personas.get(m.id) || persona(m.id); m.name = p.name || m.id; m.avatar = p.avatar || ''; m.me = m.id === mine; });
      let shared = null; try { const s = await this.svc('IFamilyGroupsService', 'GetSharedLibraryApps', 1, { family_groupid: g.family_groupid, include_own: false, include_excluded: false, steamid: mine }); shared = (s.apps || []).length; } catch {}
      let fv = null; try { const p = await this.svc('IParentalService', 'GetParentalSettings', 1, { steamid: mine }); const st = p.settings || {}; fv = { on: !!st.is_enabled, locked: !!st.is_locked || !!st.locked }; } catch {}
      return { ok: true, name: fg.name || 'Family', members: mem, free: fg.free_spots, shared, fv };
    },
    async items() {
      const IMG = 'https://cdn.fastly.steamstatic.com/steamcommunity/public/images/', map = l => (l || []).map(x => ({ id: String(x.communityitemid), name: x.item_title || x.name || '', desc: x.item_description || '', img: x.image_large ? IMG + x.image_large : (x.image_small ? IMG + x.image_small : ''), small: x.image_small ? IMG + x.image_small : '', app: x.appid }));
      const [o, e] = await Promise.all([this.svc('IPlayerService', 'GetProfileItemsOwned', 1, { language: 'english' }), this.svc('IPlayerService', 'GetProfileItemsEquipped', 1, { steamid: me, language: 'english' }).catch(() => ({}))]);
      const eq = k => e[k] && e[k].communityitemid ? String(e[k].communityitemid) : '';
      return { frames: map(o.avatar_frames), avatars: map(o.animated_avatars), backgrounds: map(o.profile_backgrounds), minibgs: map(o.mini_profile_backgrounds), equipped: { frame: eq('avatar_frame'), avatar: eq('animated_avatar'), background: eq('profile_background'), minibg: eq('mini_profile_background') } };
    },
    async equip(kind, id) {
      const M = { frame: 'SetAvatarFrame', avatar: 'SetAnimatedAvatar', background: 'SetProfileBackground', minibg: 'SetMiniProfileBackground' }[kind]; if (!M) throw new Error('Unknown item type.');
      await this.svc('IPlayerService', M, 1, { communityitemid: id || '0' }, true); return true;
    },
    async privacyGet() {
      const t = await this.webGet('https://steamcommunity.com/profiles/' + me + '/edit/settings'), m = /data-privacysettings="([^"]+)"/.exec(t) || /data-privacy-settings="([^"]+)"/.exec(t);
      if (!m) throw new Error('Could not read your privacy settings.');
      const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')), p = j.PrivacySettings || j; return { profile: p.PrivacyProfile, inventory: p.PrivacyInventory, gifts: p.PrivacyInventoryGifts, games: p.PrivacyOwnedGames, playtime: p.PrivacyPlaytime, friends: p.PrivacyFriendsList, comments: j.eCommentPermission != null ? j.eCommentPermission : (j.ECommentPermission || 1) };
    },
    async privacySave(patch) {
      const { ck, sess } = await this._web(), cur = await this.privacyGet(), n = { ...cur, ...patch };
      const body = new URLSearchParams({ sessionid: sess, Privacy: JSON.stringify({ PrivacyProfile: n.profile, PrivacyInventory: n.inventory, PrivacyInventoryGifts: n.gifts, PrivacyOwnedGames: n.games, PrivacyPlaytime: n.playtime, PrivacyFriendsList: n.friends }), eCommentPermission: String(n.comments) });
      const r = await fetch('https://steamcommunity.com/profiles/' + me + '/ajaxsetprivacy/', { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://steamcommunity.com/profiles/' + me + '/edit/settings', 'User-Agent': 'Mozilla/5.0 betterSBP' }, body }), j = await r.json().catch(() => ({}));
      if (j.success !== 1 && j.success !== true) throw new Error('Steam did not accept the privacy change.'); return true;
    },
    async storePost(url, params) {
      const { ck, sess } = await this._web(), r = await fetch(url, { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://store.steampowered.com', Referer: 'https://store.steampowered.com/', 'User-Agent': 'Mozilla/5.0 betterSBP' }, body: new URLSearchParams({ sessionid: sess, ...params }) });
      const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t, ok: r.ok }; }
    },
    async profileGet() {
      const { ck } = await this._web();
      const r = await fetch('https://steamcommunity.com/profiles/' + me + '/edit/info', { headers: { Cookie: ck, 'User-Agent': 'Mozilla/5.0 betterSBP' } }), t = await r.text();
      const m = /data-profile-edit="([^"]+)"/.exec(t) || /data-profileedit="([^"]+)"/.exec(t); if (!m) throw new Error('Could not read your profile.');
      const j = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
      return { name: j.strPersonaName || '', real: j.strRealName || '', summary: j.strSummary || '', custom: j.strCustomURL || '', loc: j.LocationData || {} };
    },
    async profileSave(patch) {
      const { ck, sess } = await this._web(), cur = await this.profileGet(), loc = cur.loc || {};
      const f = new URLSearchParams({ sessionID: sess, type: 'profileSave', personaName: patch.name != null ? patch.name : cur.name, real_name: patch.real != null ? patch.real : cur.real, customURL: patch.custom != null ? patch.custom : cur.custom, country: loc.locCountryCode || '', state: loc.locStateCode || '', city: loc.locCityCode || '', summary: patch.summary != null ? patch.summary : cur.summary, json: '1' });
      const r = await fetch('https://steamcommunity.com/profiles/' + me + '/edit/', { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://steamcommunity.com/profiles/' + me + '/edit/info', 'User-Agent': 'Mozilla/5.0 betterSBP' }, body: f }), j = await r.json().catch(() => ({}));
      if (j.success !== 1 && j.success !== true) throw new Error(j.errmsg || 'Steam did not accept the change.');
      if (patch.name) { const p = personas.get(me); if (p) p.name = patch.name; send(); }
      return true;
    },
    async avatar(file) {
      const { ck, sess } = await this._web(), buf = fs.readFileSync(file), fd = new FormData();
      fd.append('MAX_FILE_SIZE', '1048576'); fd.append('type', 'player_avatar_image'); fd.append('sId', me); fd.append('sessionid', sess); fd.append('doSub', '1'); fd.append('json', '1');
      fd.append('avatar', new Blob([buf], { type: /png$/i.test(file) ? 'image/png' : 'image/jpeg' }), path.basename(file));
      const r = await fetch('https://steamcommunity.com/actions/FileUploader/', { method: 'POST', headers: { Cookie: ck, 'User-Agent': 'Mozilla/5.0 betterSBP' }, body: fd }), j = await r.json().catch(() => ({}));
      if (!j.success) throw new Error(j.message || 'Steam did not accept the picture (use a square PNG/JPG under 1 MB).');
      return true;
    },
    stop() { try { cl && cl.logOff(); } catch {} },
  };
};
