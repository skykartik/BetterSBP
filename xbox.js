// Xbox / Microsoft sign-in (device-code, like signing in on a console) + Xbox friends, using Xbox Live's own web services.
// No Steam, no browser: the user enters a short code (or scans the QR) on their phone. Only Microsoft's refresh token is kept (encrypted by the OS keystore).
const fs = require('fs'), path = require('path');

const tfetch = (url, opt, ms) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 12000); return fetch(url, { ...(opt || {}), signal: ac.signal }).finally(() => clearTimeout(t)); };
module.exports = function createXbox({ app, safeStorage, getCfg, saveCfg, notify, QR, openLogin }) {
  // Public client id used by community launchers for Xbox Live device sign-in. Can be replaced in config.json ("xboxClientId").
  const WEBCLIENT = () => getCfg().xboxWebClientId || '00000000402b5328', REDIR = 'https://login.live.com/oauth20_desktop.srf';
  let tokClient = null;
  const CLIENT = () => tokClient || getCfg().xboxClientId || '00000000441cc96b', SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
  let state = 'out', err = '', dev = null, qrImg = '', pollT = null, gen = 0, me = null, xsts = null, friendsC = null, friendsT = 0, refreshTok = null;
  const tokFile = () => path.join(app.getPath('userData'), 'xbox-token.bin');
  const save = (t, c) => { try { const v = JSON.stringify({ c: c || tokClient || null, t }); fs.writeFileSync(tokFile(), safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(v) : Buffer.from(v)); } catch {} };
  const load = () => { try { const b = fs.readFileSync(tokFile()), raw = safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString(); try { const o = JSON.parse(raw); if (o && o.t) { tokClient = o.c || tokClient; return o.t; } } catch {} return raw; } catch { return null; } };
  const status = () => ({ state, err, hasToken: !!(refreshTok || load()), me, code: dev ? dev.user_code : '', url: dev ? dev.verification_uri : '', qr: qrImg });
  const send = () => notify('xbox:state', status());
  const form = o => new URLSearchParams(o).toString();
  const post = async (url, body, json, headers) => {
    const r = await tfetch(url, { method: 'POST', headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded', Accept: 'application/json', ...(headers || {}) }, body: json ? JSON.stringify(body) : form(body) });
    const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, j };
  };

  async function xboxAuth(msaAccess) {
    const a = await post('https://user.auth.xboxlive.com/user/authenticate', { Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 't=' + msaAccess }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' }, true, { 'x-xbl-contract-version': '1' });
    if (!a.ok || !a.j.Token) throw new Error('Xbox Live did not accept the sign-in (' + a.status + ').');
    const x = await post('https://xsts.auth.xboxlive.com/xsts/authorize', { Properties: { SandboxId: 'RETAIL', UserTokens: [a.j.Token] }, RelyingParty: 'http://xboxlive.com', TokenType: 'JWT' }, true, { 'x-xbl-contract-version': '1' });
    if (!x.ok || !x.j.Token) throw new Error(x.j.XErr === 2148916233 ? 'This Microsoft account has no Xbox profile yet. Create one at xbox.com first.' : x.j.XErr === 2148916238 ? 'This is a child account. An adult must add it to a family first.' : 'Xbox Live refused the sign-in (' + (x.j.XErr || x.status) + ').');
    const c = (x.j.DisplayClaims.xui || [])[0] || {}; xsts = { auth: `XBL3.0 x=${c.uhs};${x.j.Token}`, exp: Date.now() + 10 * 3600e3, uhs: c.uhs }; return c;
  }
  async function refresh() {
    const t = refreshTok || load(); if (!t) throw new Error('Not signed in.');
    const r = await post('https://login.live.com/oauth20_token.srf', { client_id: CLIENT(), grant_type: 'refresh_token', refresh_token: t, scope: SCOPE });
    if (!r.ok || !r.j.access_token) { if (r.j.error === 'invalid_grant') { try { fs.unlinkSync(tokFile()); } catch {} refreshTok = null; } throw new Error('Microsoft sign-in expired. Please sign in again.'); }
    refreshTok = r.j.refresh_token || t; if (r.j.refresh_token) save(r.j.refresh_token, CLIENT()); return r.j.access_token;
  }
  async function ensure() { if (xsts && xsts.exp > Date.now() + 60000) return; const tk = await refresh(); await xboxAuth(tk); }
  async function api(url, ver) { await ensure(); const r = await tfetch(url, { headers: { Authorization: xsts.auth, 'x-xbl-contract-version': String(ver || 3), Accept: 'application/json', 'Accept-Language': 'en-US' } }); if (!r.ok) throw new Error('Xbox answered ' + r.status); return r.json(); }
  // new-message notifications: Xbox Live has no push channel here, so the inbox is checked every half minute while signed in
  let inboxT = null; const seenMsg = new Map(); let inboxFirst = true;
  async function pollInbox() {
    if (state !== 'in') return;
    try {
      await ensure(); const r = await tfetch('https://xblmessaging.xboxlive.com/network/Xbox/users/me/inbox', { headers: { Authorization: xsts.auth, 'x-xbl-contract-version': '1', Accept: 'application/json', 'Accept-Language': 'en-US' } }, 15000);
      if (!r.ok) return; const j = await r.json(), mine = String(me && me.xuid || '');
      for (const f of [j.primary, j.secondary, j]) for (const c of ((f && f.conversations) || [])) {
        const m = c.lastMessage; if (!m) continue; const t = Date.parse(m.timestamp || c.timestamp) || 0, key = c.conversationId || '', sender = String(m.senderXuid || (m.header && m.header.sender) || '');
        const prev = seenMsg.get(key); seenMsg.set(key, t);
        if (inboxFirst || prev === undefined && c.isRead !== false || !prev || t <= prev || sender === mine || c.isRead === true || c.muted) continue;
        const cpl = m.contentPayload || {}, parts = (cpl.content && cpl.content.parts) || cpl.parts || [], text = (Array.isArray(parts) ? parts : [parts]).map(p => (p && p.text) || '').join(' ').trim() || 'sent you something';
        const fr = (friendsC || []).find(q => String(q.id) === sender); notify('popup', { kind: 'xbox', title: (fr && fr.name) || 'Xbox message', body: text.slice(0, 140), icon: fr && fr.avatar });
      }
      inboxFirst = false;
    } catch {}
  }
  const startInbox = () => { clearInterval(inboxT); inboxFirst = true; seenMsg.clear(); setTimeout(pollInbox, 4000); inboxT = setInterval(pollInbox, 30000); };
  async function loadMe() { const j = await api('https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag,GameDisplayPicRaw', 3), s = {}; ((j.profileUsers || [])[0] || { settings: [] }).settings.forEach(x => { s[x.id] = x.value; }); me = { xuid: ((j.profileUsers || [])[0] || {}).id || '', name: s.Gamertag || 'Xbox', avatar: s.GameDisplayPicRaw || '' }; }

  return {
    status,
    async resume() { if (!load()) return; state = 'connecting'; send(); try { await ensure(); await loadMe(); state = 'in'; err = ''; startInbox(); } catch (e) { state = 'out'; err = e.message; } send(); },
    async connect() {
      const g = ++gen; clearTimeout(pollT); state = 'code'; err = ''; dev = null; qrImg = ''; send();
      try {
        const r = await post('https://login.live.com/oauth20_connect.srf', { client_id: CLIENT(), scope: SCOPE, response_type: 'device_code' });
        if (!r.ok || !r.j.device_code) throw new Error('Microsoft did not start the sign-in (' + (r.j.error_description || r.status) + ').');
        dev = r.j; const link = r.j.verification_uri_complete || (r.j.verification_uri + '?otc=' + r.j.user_code);
        try { qrImg = QR ? await QR.toDataURL(link, { margin: 1, width: 360 }) : ''; } catch {} send();
        const iv = Math.max(3, +r.j.interval || 5) * 1000, until = Date.now() + (+r.j.expires_in || 900) * 1000;
        const tick = async () => {
          if (g !== gen) return; if (Date.now() > until) { state = 'out'; err = 'The code expired. Try again.'; dev = null; send(); return; }
          try {
            const t = await post('https://login.live.com/oauth20_token.srf', { client_id: CLIENT(), grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: r.j.device_code });
            if (t.j.access_token) { refreshTok = t.j.refresh_token; if (refreshTok) save(refreshTok, CLIENT()); dev = null; qrImg = ''; state = 'connecting'; send(); await xboxAuth(t.j.access_token); await loadMe(); state = 'in'; startInbox(); send(); return; }
            if (t.j.error && !/pending|slow/i.test(t.j.error)) { state = 'out'; err = t.j.error === 'authorization_declined' ? 'Sign-in was declined.' : (t.j.error_description || t.j.error); dev = null; send(); return; }
          } catch (e) { if (g === gen) { state = 'out'; err = e.message; dev = null; send(); } return; }
          pollT = setTimeout(tick, iv);
        };
        pollT = setTimeout(tick, iv);
      } catch (e) { if (g === gen) { state = 'out'; err = e.message; send(); } }
    },
    // Sign in inside betterSBP with Microsoft's own page. The same browser session is shared with Xbox Cloud Gaming, so that app is signed in too.
    async webConnect() {
      if (!openLogin) return this.connect();
      const g = ++gen; clearTimeout(pollT); state = 'connecting'; err = ''; dev = null; qrImg = ''; send();
      try {
        const url = 'https://login.live.com/oauth20_authorize.srf?' + form({ client_id: WEBCLIENT(), response_type: 'code', scope: SCOPE, redirect_uri: REDIR, display: 'touch' });
        const code = await openLogin(url, REDIR); if (g !== gen) return;
        if (!code) { state = 'out'; err = 'Sign-in was closed before it finished.'; send(); return; }
        const t = await post('https://login.live.com/oauth20_token.srf', { client_id: WEBCLIENT(), grant_type: 'authorization_code', code, redirect_uri: REDIR, scope: SCOPE });
        if (!t.j.access_token) throw new Error(t.j.error_description || 'Microsoft did not accept the sign-in.');
        tokClient = WEBCLIENT(); refreshTok = t.j.refresh_token; if (refreshTok) save(refreshTok, tokClient);
        await xboxAuth(t.j.access_token); await loadMe(); state = 'in'; err = ''; startInbox(); send();
      } catch (e) { if (g === gen) { state = 'out'; err = e.message; send(); } }
    },
    cancel() { gen++; clearTimeout(pollT); dev = null; qrImg = ''; if (state === 'code') state = 'out'; send(); },
    signout() { gen++; clearTimeout(pollT); clearInterval(inboxT); tokClient = null; try { fs.unlinkSync(tokFile()); } catch {} refreshTok = null; xsts = null; me = null; friendsC = null; dev = null; state = 'out'; send(); },
    // a friend's profile card, recent games, and message thread - all through Xbox Live's own services
    async profile(xuid) {
      const ids = 'Gamertag,GameDisplayPicRaw,Gamerscore,AccountTier,XboxOneRep,RealName,Bio,Location';
      const j = await api(`https://profile.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/profile/settings?settings=${ids}`, 3), s = {};
      ((j.profileUsers || [])[0] || { settings: [] }).settings.forEach(q => { s[q.id] = q.value; });
      let games = []; try { const t = await api(`https://titlehub.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/titles/titlehistory/decoration/detail`, 2); games = (t.titles || []).slice(0, 12).map(g => ({ id: g.titleId, name: g.name, img: g.displayImage || '', last: g.titleHistory && g.titleHistory.lastTimePlayed || '' })); } catch {}
      const f = (friendsC || []).find(q => q.id === String(xuid)) || {};
      return { id: String(xuid), name: s.Gamertag || f.name, avatar: s.GameDisplayPicRaw || f.avatar || '', score: s.Gamerscore || '', tier: s.AccountTier || '', rep: s.XboxOneRep || '', realName: s.RealName || '', bio: s.Bio || '', location: s.Location || '', online: !!f.state, status: f.game ? 'Playing ' + f.game : f.state ? (f.text || 'Online') : 'Offline', games };
    },
    // Messaging: Xbox Live keeps one conversation per friend. Try the direct-by-user route first, then find it in the inbox.
    async messages(xuid) {
      await ensure(); const H = { Authorization: xsts.auth, 'x-xbl-contract-version': '1', Accept: 'application/json', 'Accept-Language': 'en-US' };
      let j = null, last = 0;
      for (const u of [`https://xblmessaging.xboxlive.com/network/xbox/users/me/conversations/users/xuid(${xuid})?maxItems=60`, `https://xblmessaging.xboxlive.com/network/Xbox/users/me/conversations/users/xuid(${xuid})?maxItems=60`]) {
        try { const r = await tfetch(u, { headers: H }); last = r.status; if (r.status === 404) return []; if (r.ok) { j = await r.json(); break; } } catch (e) { last = e.name === 'AbortError' ? 'timeout' : 'network'; }
      }
      if (!j) throw new Error(last === 'timeout' ? 'Xbox did not answer in time. Try again in a moment.' : last === 403 || last === 401 ? 'Xbox blocked reading messages for this account (' + last + ').' : 'Xbox messages are not available (' + last + ').');
      const mine = String(me && me.xuid || '');
      return (j.messages || []).map(m => { const cpl = m.contentPayload || {}; let parts = (cpl.content && cpl.content.parts) || cpl.parts || []; if (!Array.isArray(parts)) parts = [parts]; const text = parts.map(p => (p && (p.text || p.value || p.caption)) || '').join(' ').trim(); const kind = parts.map(p => p && p.contentType).find(Boolean) || ''; const sender = String((m.header && m.header.sender) || ''); return { text: text || (/image|photo/i.test(kind) ? '[Photo]' : /voice|audio/i.test(kind) ? '[Voice message]' : /video|clip/i.test(kind) ? '[Video]' : /gif/i.test(kind) ? '[GIF]' : '[Attachment]'), me: mine ? sender.includes(mine) : sender !== String(xuid), t: Date.parse(m.timestamp) || 0 }; }).sort((a, b) => a.t - b.t);
    },
    async send(xuid, text) {
      await ensure(); const body = JSON.stringify({ parts: [{ contentType: 'text', version: 0, text: String(text).slice(0, 256) }] });
      let last = 0;
      for (const u of [`https://xblmessaging.xboxlive.com/network/xbox/users/me/conversations/users/xuid(${xuid})`, `https://xblmessaging.xboxlive.com/network/Xbox/users/me/conversations/users/xuid(${xuid})`]) {
        try { const r = await tfetch(u, { method: 'POST', headers: { Authorization: xsts.auth, 'x-xbl-contract-version': '1', 'Content-Type': 'application/json', Accept: 'application/json' }, body }); last = r.status; if (r.ok) return true; } catch (e) { last = e.name === 'AbortError' ? 'timeout' : 'network'; }
      }
      throw new Error('Xbox did not accept the message (' + last + ').');
    },
    async addFriend(tag) {
      tag = String(tag || '').trim(); if (!tag) return { ok: false, msg: 'Enter a gamertag.' };
      const j = await api(`https://profile.xboxlive.com/users/gt(${encodeURIComponent(tag)})/profile/settings?settings=Gamertag`, 3).catch(() => null);
      const id = j && (j.profileUsers || [])[0] && j.profileUsers[0].id; if (!id) return { ok: false, msg: 'No Xbox profile found for "' + tag + '".' };
      await ensure(); const r = await tfetch(`https://social.xboxlive.com/users/me/people/xuid(${id})`, { method: 'PUT', headers: { Authorization: xsts.auth, 'x-xbl-contract-version': '2', Accept: 'application/json' } });
      if (!r.ok) return { ok: false, msg: 'Xbox did not add them (' + r.status + ').' }; friendsC = null; return { ok: true, msg: 'Added ' + tag + ' on Xbox.' };
    },
    async friends() {
      if (state !== 'in') return null; if (friendsC && friendsC.length && Date.now() - friendsT < 30000) return friendsC;
      let list = [];
      try {
        const j = await api('https://peoplehub.xboxlive.com/users/me/people/social/decoration/detail,preferredColor,presenceDetail,multiplayerSummary', 5);
        list = (j.people || []).filter(p => p.isFollowedByCaller !== false).map(p => { const on = /online|away/i.test(p.presenceState || ''), d = (p.presenceDetails || []).find(q => q.IsGame) || (p.presenceDetails || [])[0]; return { id: p.xuid, name: p.displayName || p.gamertag, tag: p.gamertag, avatar: p.displayPicRaw || '', state: on ? 1 : 0, game: on && d && d.IsGame ? (d.PresenceText || d.TitleName || 'a game') : '', text: p.presenceText || '' }; });
      } catch (e) { list = []; }
      if (!list.length) list = await this.friendsFallback().catch(() => []);
      list.sort((a, b) => (b.state - a.state) || String(a.name).localeCompare(String(b.name))); friendsC = list; friendsT = Date.now(); return list;
    },
    // older social services: list of xuids, then profile + presence in batches
    async friendsFallback() {
      await ensure(); const H = v => ({ Authorization: xsts.auth, 'x-xbl-contract-version': String(v), Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Language': 'en-US' });
      const r = await tfetch('https://social.xboxlive.com/users/me/people', { headers: H(1) }); if (!r.ok) return [];
      const ids = ((await r.json()).people || []).map(p => String(p.xuid)).slice(0, 300); if (!ids.length) return [];
      const prof = await tfetch('https://profile.xboxlive.com/users/batch/profile/settings', { method: 'POST', headers: H(2), body: JSON.stringify({ userIds: ids, settings: ['Gamertag', 'GameDisplayPicRaw', 'RealName'] }) });
      const pres = await tfetch('https://userpresence.xboxlive.com/users/batch', { method: 'POST', headers: H(3), body: JSON.stringify({ users: ids, level: 'user' }) }).catch(() => null);
      const pj = prof.ok ? await prof.json() : { profileUsers: [] }, prj = pres && pres.ok ? await pres.json() : [];
      const pm = new Map((Array.isArray(prj) ? prj : []).map(q => [String(q.xuid), q]));
      return (pj.profileUsers || []).map(u => { const s = {}; (u.settings || []).forEach(q => { s[q.id] = q.value; }); const p = pm.get(String(u.id)) || {}, on = /online/i.test(p.state || ''), t = on && (p.devices || []).flatMap(d => d.titles || []).find(q => q.placement !== 'Background' && q.name && q.name !== 'Home'); return { id: String(u.id), name: s.Gamertag || String(u.id), tag: s.Gamertag, avatar: s.GameDisplayPicRaw || '', state: on ? 1 : 0, game: t ? t.name : '', text: on ? 'Online' : '' }; });
    },
  };
};
