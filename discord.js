// Discord inside betterSBP's own UI.
// Login happens once on discord.com (email / password / QR) in the embedded page; afterwards the session is read
// and servers, channels, DMs and messages are shown with betterSBP's own screens. Voice runs through a hidden
// Discord client that betterSBP drives (join / mute / deafen / leave).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SP = Buffer.from(JSON.stringify({ os: 'Windows', browser: 'Chrome', device: '', system_locale: 'en-US', browser_user_agent: UA, browser_version: '124.0.0.0', os_version: '10', referrer: '', referrer_domain: '', release_channel: 'stable', client_build_number: 300000, client_event_source: null })).toString('base64');
const API = 'https://discord.com/api/v9';
const GRAB = `(() => { try {
  let t = null; const wp = window.webpackChunkdiscord_app; if (wp) { wp.push([[Math.random()], {}, r => { for (const m of Object.values(r.c || {})) { try { const x = m.exports; const f = x && (x.default && x.default.getToken ? x.default : (x.getToken ? x : null)); if (f) { const k = f.getToken(); if (typeof k === 'string' && k.length > 20) { t = k; return; } } } catch {} } }]); wp.pop(); }
  if (!t) { const i = document.createElement('iframe'); document.body.appendChild(i); const k = i.contentWindow.localStorage.getItem('token'); if (k) t = JSON.parse(k); i.remove(); }
  return t; } catch (e) { return null; } })()`;

module.exports = function createDiscord({ session, BrowserWindow, getCfg, saveCfg, safeStorage, onChange, onMessage }) {
  const PART = 'persist:discord';
  let tok = null, me = null, hw = null, voice = null, bad = false;
  const cfg = () => getCfg();
  const enc = t => { try { return safeStorage && safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(t).toString('base64') : 'p:' + Buffer.from(t).toString('base64'); } catch { return 'p:' + Buffer.from(t).toString('base64'); } };
  const dec = s => { try { if (!s) return null; return s.startsWith('e:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : Buffer.from(s.slice(2), 'base64').toString(); } catch { return null; } };
  const load = () => { if (!tok) tok = dec(cfg().discordTok); return tok; };
  const set = t => { tok = t; cfg().discordTok = t ? enc(t) : undefined; if (!t) delete cfg().discordTok; saveCfg(); };

  async function call(method, p, body) {
    if (!load()) throw new Error('Not signed in to Discord');
    const r = await fetch(API + p, { method, headers: { Authorization: tok, 'User-Agent': UA, 'X-Super-Properties': SP, 'X-Discord-Locale': 'en-US', 'Content-Type': 'application/json', Origin: 'https://discord.com', Referer: 'https://discord.com/channels/@me' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    if (r.status === 401) { bad = true; set(null); onChange(); throw new Error('Discord session expired. Log in again.'); }
    if (r.status === 429) { const j = await r.json().catch(() => ({})); throw new Error('Discord says slow down (' + Math.ceil(j.retry_after || 1) + ' s).'); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || ('Discord error ' + r.status)); }
    return r.status === 204 ? null : r.json();
  }
  const avatar = (u, size = 64) => !u ? '' : u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=${size}` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`;
  const uname = u => (u && (u.global_name || u.username)) || 'Unknown';

  // read the session token out of a loaded Discord page
  async function grab(wc) { for (let i = 0; i < 24; i++) { try { const t = await wc.executeJavaScript(GRAB); if (t) return t; } catch {} await new Promise(r => setTimeout(r, 1000)); } return null; }
  async function fromPage(wc) { const t = await grab(wc); if (t) { bad = false; set(t); me = null; await this_me().catch(() => {}); onChange(); } return !!t; }
  async function this_me() { const u = await call('GET', '/users/@me'); me = { id: u.id, name: uname(u), tag: u.username, avatar: avatar(u, 128) }; return me; }
  // already logged in with an older build (no token saved yet): load Discord invisibly once and read it
  let ensuring = null;
  function ensure() {
    if (load() || !cfg().discordIn || bad) return Promise.resolve(!!tok);
    if (ensuring) return ensuring;
    ensuring = (async () => {
      let w; try { w = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { partition: PART, backgroundThrottling: false } }); w.webContents.setUserAgent(UA); await w.loadURL('https://discord.com/app'); await fromPage(w.webContents); } catch {} try { w && w.destroy(); } catch {}
      ensuring = null; return !!tok;
    })();
    return ensuring;
  }


  // ---- presence (who is online / playing) through Discord's gateway; read-only, the connection is only used to learn friends' status
  const pres = new Map(); let sock = null, hb = null, seq = null, gwOn = false, gwRetry = 0;
  const WS = (() => { try { return require('ws'); } catch { return globalThis.WebSocket || null; } })();
  const setPres = (id, st, acts) => { const g = (acts || []).find(a => a.type === 0 || a.type === 1); pres.set(String(id), { status: st || 'offline', game: g ? g.name : '' }); };
  function gwStop() { gwOn = false; clearInterval(hb); try { sock && (sock.close ? sock.close() : sock.terminate()); } catch {} sock = null; }
  function gwStart() {
    if (gwOn || !WS || !load()) return; gwOn = true;
    const open = () => {
      if (!gwOn) return; let s; try { s = new WS('wss://gateway.discord.gg/?v=9&encoding=json'); } catch { gwOn = false; return; } sock = s;
      const tx = o => { try { s.send(JSON.stringify(o)); } catch {} };
      const onMsg = raw => {
        let m; try { m = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; } if (m.s != null) seq = m.s;
        if (m.op === 10) { clearInterval(hb); hb = setInterval(() => tx({ op: 1, d: seq }), m.d.heartbeat_interval); tx({ op: 2, d: { token: tok, capabilities: 16381, properties: { os: 'Windows', browser: 'Chrome', device: '', system_locale: 'en-US', browser_user_agent: UA, browser_version: '124.0.0.0', os_version: '10', release_channel: 'stable', client_build_number: 300000 }, presence: { status: 'online', since: 0, activities: [], afk: false }, compress: false, client_state: { guild_versions: {} } } }); }
        else if (m.op === 0) {
          if (m.t === 'READY') { gwRetry = 0; const d = m.d || {}; (d.presences || []).forEach(p => setPres(p.user_id || (p.user && p.user.id), p.status, p.activities)); ((d.merged_presences || {}).friends || []).forEach(p => setPres(p.user_id, p.status, p.activities)); onChange(); }
          else if (m.t === 'MESSAGE_CREATE') { const d = m.d || {}; if (!d.guild_id && me && d.author && d.author.id !== me.id && onMessage) { const n = new Map((d.mentions || []).map(u => [u.id, uname(u)])); onMessage({ name: uname(d.author), avatar: avatar(d.author), text: String(d.content || (d.attachments && d.attachments.length ? '[attachment]' : '')).replace(/<@!?(\d+)>/g, (x, i) => '@' + (n.get(i) || 'user')).slice(0, 140), channel: d.channel_id }); } }
          else if (m.t === 'PRESENCE_UPDATE') { const d = m.d || {}; if (!d.guild_id || pres.has(String(d.user && d.user.id))) { setPres(d.user && d.user.id, d.status, d.activities); onChange(); } }
        } else if (m.op === 9 || m.op === 7) { try { s.close(); } catch {} }
      };
      if (s.on) { s.on('message', onMsg); s.on('close', onClose); s.on('error', () => {}); } else { s.onmessage = e => onMsg(e.data); s.onclose = onClose; s.onerror = () => {}; }
      function onClose() { clearInterval(hb); if (!gwOn || sock !== s) return; setTimeout(open, Math.min(60000, 3000 * (++gwRetry))); }
    };
    open();
  }
  const pr = id => pres.get(String(id)) || null;

  const api = {
    attach: fromPage,
    state() { return { available: true, state: load() ? 'on' : (cfg().discordIn && !bad ? 'connecting' : 'off'), me, voice }; },
    async status() { if (!load()) await ensure(); if (tok && !me) await this_me().catch(() => {}); if (tok) gwStart(); return api.state(); },
    async logout() { try { await api.vleave(); } catch {} gwStop(); pres.clear(); set(null); me = null; try { await session.fromPartition(PART).clearStorageData(); } catch {} cfg().discordIn = false; saveCfg(); onChange(); },
    async guilds() { const l = await call('GET', '/users/@me/guilds'); return l.map(g => ({ id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` : '' })); },
    async channels(gid) {
      const l = await call('GET', `/guilds/${gid}/channels`), cat = new Map(l.filter(c => c.type === 4).map(c => [c.id, c]));
      return l.filter(c => c.type === 0 || c.type === 2 || c.type === 5 || c.type === 13).sort((a, b) => (cat.get(a.parent_id) || { position: -1 }).position - (cat.get(b.parent_id) || { position: -1 }).position || a.position - b.position)
        .map(c => ({ id: c.id, name: c.name, voice: c.type === 2 || c.type === 13, cat: (cat.get(c.parent_id) || {}).name || '' }));
    },
    async dms() { const l = await call('GET', '/users/@me/channels'); const lm = c => { try { return BigInt(c.last_message_id || 0); } catch { return 0n; } }; return l.filter(c => c.type === 1 || c.type === 3).sort((a, b) => (lm(b) > lm(a) ? 1 : lm(b) < lm(a) ? -1 : 0)).slice(0, 80)
      .map(c => ({ id: c.id, group: c.type === 3, name: c.type === 3 ? (c.name || c.recipients.map(uname).join(', ')) : uname(c.recipients[0]), avatar: c.type === 3 ? '' : avatar(c.recipients[0]), uid: c.type === 3 ? '' : c.recipients[0].id, ...(c.type === 3 ? {} : (() => { const p = pr(c.recipients[0].id); return { st: p ? p.status : 'offline', game: p ? p.game : '' }; })()) })); },
    async friends() { const l = await call('GET', '/users/@me/relationships'); return l.filter(r => r.type === 1).map(r => ({ id: r.id, name: uname(r.user), avatar: avatar(r.user), st: (pr(r.id) || {}).status || 'offline', game: (pr(r.id) || {}).game || '' })).sort((a, b) => (b.st !== 'offline') - (a.st !== 'offline') || a.name.localeCompare(b.name)); },
    async openDm(uid) { const c = await call('POST', '/users/@me/channels', { recipient_id: uid }); return c.id; },
    async msgs(cid) {
      const l = await call('GET', `/channels/${cid}/messages?limit=50`);
      return l.reverse().map(m => {
        const names = new Map((m.mentions || []).map(u => [u.id, uname(u)]));
        const text = String(m.content || '').replace(/<@!?(\d+)>/g, (x, i) => '@' + (names.get(i) || 'user')).replace(/<a?:(\w+):\d+>/g, ':$1:').replace(/<#\d+>/g, '#channel').replace(/<@&\d+>/g, '@role');
        return { id: m.id, me: me && m.author.id === me.id, name: uname(m.author), avatar: avatar(m.author), text, t: Date.parse(m.timestamp), img: (m.attachments || []).filter(a => /^image\//.test(a.content_type || '')).map(a => a.proxy_url || a.url).slice(0, 2), files: (m.attachments || []).filter(a => !/^image\//.test(a.content_type || '')).map(a => a.filename) };
      });
    },
    async send(cid, text) { await call('POST', `/channels/${cid}/messages`, { content: String(text).slice(0, 2000), nonce: String(Date.now() * 4194304) }); return true; },

    // ---- voice (through a hidden Discord client)
    async vjoin(gid, cid, name) {
      if (!hw || hw.isDestroyed()) {
        hw = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { partition: PART, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
        const ss = session.fromPartition(PART); ss.setPermissionRequestHandler((w, p, cb) => cb(['media', 'audioCapture', 'notifications', 'fullscreen'].includes(p))); ss.setPermissionCheckHandler(() => true);
        hw.webContents.setUserAgent(UA); hw.on('closed', () => { hw = null; voice = null; onChange(); });
      }
      await hw.loadURL(`https://discord.com/channels/${gid}/${cid}`);
      const click = `(async () => { const sel = '[data-list-item-id="channels___${cid}"]'; for (let i = 0; i < 40; i++) { const e = document.querySelector(sel); if (e) { e.click(); return true; } await new Promise(r => setTimeout(r, 500)); } return false; })()`;
      const ok = await hw.webContents.executeJavaScript(click).catch(() => false);
      if (!ok) throw new Error('Could not find that voice channel.');
      voice = { gid, cid, name: name || 'Voice', muted: false, deaf: false }; onChange(); return voice;
    },
    async vact(a) {
      if (!hw || hw.isDestroyed() || !voice) return voice;
      const labels = { mute: ['Mute', 'Unmute'], deaf: ['Deafen', 'Undeafen'] }[a]; if (!labels) return voice;
      const js = `(() => { const q = n => document.querySelector('button[aria-label="' + n + '"]'); const b = q(${JSON.stringify(labels[0])}) || q(${JSON.stringify(labels[1])}); if (b) { b.click(); return true; } return false; })()`;
      const ok = await hw.webContents.executeJavaScript(js).catch(() => false);
      if (ok) { if (a === 'mute') voice.muted = !voice.muted; else { voice.deaf = !voice.deaf; } onChange(); }
      return voice;
    },
    async vleave() {
      if (hw && !hw.isDestroyed()) { try { await hw.webContents.executeJavaScript(`(() => { const b = document.querySelector('button[aria-label="Disconnect"]'); if (b) b.click(); })()`); } catch {} try { hw.destroy(); } catch {} }
      hw = null; voice = null; onChange(); return true;
    },
  };
  return api;
};
