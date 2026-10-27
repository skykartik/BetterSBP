// Steam sign-in and friend chat, fully inside betterSBP (no Steam client needed).
(() => {
'use strict';
const D = window.D, S = D.S, esc = D.esc, api = D.api, icon = window.icon, V = D.V, K = V.k, VIEWS = V.VIEWS;
const { head, rowA, card, info } = K;
S.chat = S.chat || { state: 'out' }; S.msgs = S.msgs || {};

const stateText = c => ({ out: 'Signed out', connecting: 'Signing in…', guard: 'Steam Guard code needed', in: 'Signed in' }[c.state] || c.state);

VIEWS.steamlogin = () => ({ title: '', icon: '', body: 'wide', cls: 'slv', u: '', p: '', code: '', rem: true, tk: null,
  load() {
    const poll = () => Promise.resolve(api.chatStatus && api.chatStatus()).then(c => { if (c) { const was = (S.chat || {}).state; S.chat = c; if (c.state !== was || c.state === 'qr' || c.state === 'guard') V.refresh(this); if (c.state === 'out' && c.qrOk && !c.qr && !this.qrTried) { this.qrTried = 1; api.chatQR(); } } });
    poll();
    this.tk = setInterval(poll, 2000); D.S.noAudio = true; D.stopOst && D.stopOst();
  },
  leave() { clearInterval(this.tk); S.noAudio = false; api.chatQRCancel && api.chatQRCancel(); setTimeout(() => D.playOst && D.playOst(D.cur()), 400); },
  html() {
    const c = S.chat || { state: 'out' }, logo = (D.logo && D.logo('steam')) || icon('steam');
    const brand = `<div class="sbrand"><span class="slogo">${logo}</span><span>STEAM<sup>®</sup></span></div>`;
    const fld = (k, act, label, val, secret, ph) => `<div class="slb">${label}</div><div class="fx sfld" data-k="${k}" data-act="${act}"><span class="${val ? '' : 'ph'}">${val ? (secret ? '•'.repeat(Math.min(val.length, 24)) : esc(val)) : esc(ph || '')}</span></div>`;
    let left = '', right = '';
    if (c.available === false) left = `<div class="slb">STEAM SIGN-IN UNAVAILABLE</div><div class="sinfo">${esc(c.error || 'Run "npm install" in the betterSBP folder.')}</div>`;
    else if (c.state === 'in') { left = `<div class="slb">SIGNED IN</div><div class="sinfo big">${esc(c.name || '')}</div><div class="sinfo">You are signed in. Friends, chat, library and downloads work without the Steam client.</div><div class="fx sbtn" data-k="sl-go" data-act="done">Continue</div><div class="fx slnk" data-k="sl-out" data-act="out">Sign out</div>`; right = `<div class="sav">${c.avatar ? `<img src="${esc(c.avatar)}">` : icon('user')}</div>`; }
    else if (c.state === 'connecting') { left = `<div class="slb">SIGNING IN</div><div class="spin"></div><div class="sinfo">Talking to Steam…</div>`; right = `<div class="sqr dim"><div class="spin"></div></div>`; }
    else if (c.state === 'guard') {
      const g = c.guard || {};
      left = `<div class="slb">STEAM GUARD</div><div class="sinfo">${g.wrong ? '<b>That code was not accepted.</b> ' : ''}${g.domain ? 'Enter the code we emailed to ' + esc(g.domain) : 'Approve this sign-in in your Steam mobile app. It continues by itself. Or enter the code from the app instead.'}</div>` +
        fld('sl-code', 'code', 'CODE', this.code, false, 'Enter code') + `<div class="fx sbtn" data-k="sl-go" data-act="sendcode">Submit code</div><div class="fx slnk" data-k="sl-x" data-act="out">Cancel</div>`;
      right = `<div class="sqr dim"><div class="spin"></div></div><div class="sinfo c">Waiting for approval…</div>`;
    } else {
      left = fld('sl-u', 'user', 'SIGN IN WITH ACCOUNT NAME', this.u, false, '') + fld('sl-p', 'pass', 'PASSWORD', this.p, true, '') +
        `<div class="fx schk" data-k="sl-rem" data-act="rem"><i class="${this.rem ? 'on' : ''}">${this.rem ? icon('check') : ''}</i>Remember me</div><div class="fx sbtn ${this.u && this.p ? '' : 'off'}" data-k="sl-go" data-act="go">Sign in</div>`;
      right = `<div class="slb">OR SIGN IN WITH QR</div><div class="sqr">${c.qr ? `<img src="${c.qr}">` : c.state === 'qr' ? '<div class="spin dk"></div>' : c.qrOk ? `<div class="fx sbtn slim" data-k="sl-qr" data-act="qr">Show QR code</div>` : '<div class="sinfo dk">QR needs "npm install"</div>'}</div><div class="sinfo c sm">${c.qrScanned ? 'Scanned. Approve the sign-in on your phone…' : 'Scan with the Steam mobile app and approve'}</div>`;
    }
    return `<div class="sdlg">${brand}<div class="scols"><div class="sleft">${left}</div><div class="sright">${right}</div></div>${c.lastErr ? `<div class="serr">${esc(c.lastErr)}</div>` : ''}
      ${c.state === 'in' ? '' : `<div class="sfoot"><div class="fx slnk" data-k="sl-help" data-act="help">Help, I can't sign in</div><div class="sp"></div><span>Don't have a Steam account?</span><div class="fx slnk" data-k="sl-new" data-act="create">Create a Free Account</div><div class="fx slnk skip" data-k="sl-skip" data-act="skip">Skip for now</div></div>`}</div>`;
  },
  acts: {
    user() { V.osk({ title: 'Account name', value: this.u, max: 64 }).then(r => { if (r !== null) { this.u = r.trim(); V.refresh(this); } }); },
    pass() { V.osk({ title: 'Password', value: this.p, secret: true, max: 128 }).then(r => { if (r !== null) { this.p = r; V.refresh(this); } }); },
    rem() { this.rem = !this.rem; V.refresh(this); },
    qr() { this.qrTried = 1; api.chatQR(); },
    go() { if (!this.u) return this.acts.user.call(this); if (!this.p) return this.acts.pass.call(this); S.dlLogin = this.u; api.chatQRCancel && api.chatQRCancel(); S.chat = { ...S.chat, state: 'connecting', lastErr: '' }; api.chatLogin(this.u, this.p, this.rem); this.p = ''; V.refresh(this); },
    code() { V.osk({ title: 'Steam Guard code', value: this.code, max: 8 }).then(r => { if (r !== null) { this.code = r.trim(); V.refresh(this); } }); },
    sendcode() { if (this.code) { api.chatGuard(this.code); this.code = ''; } else this.acts.code.call(this); },
    out() { api.chatLogout(); S.chat = { ...S.chat, state: 'out' }; this.qrTried = 1; V.refresh(this); api.chatQR && setTimeout(() => api.chatQR(), 400); },
    done() { V.back(); },
    skip() { D.setPref('skipLogin', true); V.back(); },
    help() { V.dlg({ title: "Can't sign in?", msg: 'Check your account name (not your email) and password. If Steam Guard asks for a code, approve the request in the Steam mobile app or enter the code from it. Too many attempts can lock sign-in for a while. You can reset a password at help.steampowered.com from any device.', buttons: [{ label: 'OK' }] }); },
    create() { api.openWeb('https://store.steampowered.com/join/'); },
  } });

VIEWS.chat = id => ({ title: (S.chatNames && S.chatNames[id]) || 'Chat', icon: 'people', body: 'col', id, ready: false, stick: true, fk: 'ch-w',
  load() { Promise.resolve(api.chatHistory(id)).then(l => { S.msgs[id] = l || []; this.ready = true; this.stick = true; V.refresh(this); }); },
  after() { if (this.stick) { this.stick = false; const sc = document.querySelector('#view .vscroll'); if (sc) sc.scrollTop = sc.scrollHeight; } },
  html() {
    if (S.chat.state !== 'in') return card('Sign in to your Steam account to chat.') + rowA('ch-si', 'user', 'Sign in', { act: 'si' });
    const l = S.msgs[id] || [];
    let o = l.length ? `<div class="chat">${D.chatBubbles(l)}</div>` : (this.ready ? '<div class="snone">No messages yet. Say hi!</div>' : card('Loading…'));
    return o + `<div class="dcompw"><div class="fx dcomp" data-k="ch-w" data-act="write">${icon('edit')}<span>Message ${esc((S.chatNames && S.chatNames[id]) || 'friend')}</span></div></div>`;
  },
  acts: {
    write() { V.osk({ title: 'Message to ' + ((S.chatNames && S.chatNames[id]) || 'friend'), max: 500 }).then(r => { if (r && r.trim()) { const t = r.trim(); Promise.resolve(api.chatSend(id, t)).then(ok => { if (ok) { (S.msgs[id] = S.msgs[id] || []).push({ me: true, text: t, t: Date.now() }); } else D.toast('Could not send the message.'); V.refresh(); }); } }); },
    si() { V.open('steamlogin'); },
  } });

VIEWS.xprofile = f => ({ title: f.name || 'Xbox profile', icon: 'people', body: 'col', p: null, err: '',
  load() { Promise.resolve(api.xboxProfile(f.id)).then(r => { if (r && r.ok) this.p = r.p; else this.err = (r && r.msg) || 'Could not load this profile.'; V.refresh(this); }); },
  html() {
    const p = this.p; if (this.err) return `<div class="note">${esc(this.err)}</div>`; if (!p) return '<div class="snone">Loading…</div>';
    let o = `<div class="dme big"><img src="${esc(p.avatar || f.avatar || '')}"><div><b>${esc(p.name || f.name)}</b><div class="s">${esc(p.status)}</div></div></div>`;
    o += rowA('xp-msg', 'chat', 'Message', { act: 'msg' });
    o += info('Gamerscore', p.score || '—') + (p.realName ? info('Name', p.realName) : '') + (p.location ? info('Location', p.location) : '') + (p.bio ? info('Bio', p.bio) : '') + (p.tier ? info('Account', p.tier) : '') + (p.rep ? info('Reputation', p.rep.replace(/([A-Z])/g, ' $1').trim()) : '');
    if (p.games.length) o += head('Recently played') + `<div class="shelf">${p.games.map(g => `<div class="fx gc2"><img src="${esc(g.img)}" onerror="this.remove()"><div class="gcn">${esc(g.name)}</div></div>`).join('')}</div>`;
    return o;
  },
  acts: { msg() { V.open('xchat', f); } } });
VIEWS.xchat = f => ({ title: f.name || 'Chat', icon: 'people', body: 'col', l: null, err: '', stick: true, fk: 'xc-w',
  after() { if (this.stick) { this.stick = false; const sc = document.querySelector('#view .vscroll'); if (sc) sc.scrollTop = sc.scrollHeight; } },
  load() { const fin = r => { if (r && r.ok) { const n = (this.l || []).length, first = this.l == null; this.l = r.l; this.err = ''; if (first || r.l.length !== n) { this.stick = true; V.refresh(this); } } else { this.err = (r && r.msg) || 'Messages could not be loaded.'; if (!this.l) this.l = []; V.refresh(this); } };
    const go = () => Promise.race([Promise.resolve(api.xboxMsgs(f.id)), new Promise(r => setTimeout(() => r({ ok: false, msg: 'Xbox did not answer in time.' }), 20000))]).then(fin).catch(() => fin(null)); go(); this.iv = setInterval(go, 6000); },
  leave() { clearInterval(this.iv); },
  html() {
    if (!this.l) return card('Loading…');
    return (this.err ? `<div class="note">${esc(this.err)}</div>` : '') + (this.l.length ? `<div class="chat">${D.chatBubbles(this.l)}</div>` : '<div class="snone">No messages yet. Say hi!</div>') + `<div class="dcompw"><div class="fx dcomp" data-k="xc-w" data-act="write">${icon('edit')}<span>Message ${esc(f.name || 'friend')}</span></div></div>`;
  },
  acts: { write() { V.osk({ title: 'Message to ' + (f.name || 'friend'), max: 256 }).then(r => { if (r && r.trim()) { const t = r.trim(); Promise.resolve(api.xboxSend(f.id, t)).then(x => { if (x && x.ok) { (this.l = this.l || []).push({ me: true, text: t, t: Date.now() }); } else D.toast((x && x.msg) || 'Could not send the message.'); V.refresh(this); }); } }); } } });

Promise.resolve(api.chatStatus && api.chatStatus()).then(c => { if (c) { S.chat = c; if (c.name) S.dlLogin = S.dlLogin || c.name; } }).catch(() => {});

/* ------------------------------------------------------------- Profile settings (PlayStation-style list) */
const prow = (k, t, act, arg, right) => `<div class="fx prow" data-k="${k}" data-act="${act}" data-arg="${esc(arg || '')}"><span>${esc(t)}</span>${right ? `<em>${esc(right)}</em>` : ''}</div>`;
const LANGS = ['english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'brazilian', 'russian', 'japanese', 'koreana', 'schinese', 'tchinese', 'polish', 'turkish', 'arabic'];
const LNAME = { english: 'English', spanish: 'Español', french: 'Français', german: 'Deutsch', italian: 'Italiano', portuguese: 'Português', brazilian: 'Português (Brasil)', russian: 'Русский', japanese: '日本語', koreana: '한국어', schinese: '简体中文', tchinese: '繁體中文', polish: 'Polski', turkish: 'Türkçe', arabic: 'العربية' };
const PRIV = [['profile', 'My profile', 'PrivacyProfile'], ['games', 'Game details', ''], ['playtime', 'Always keep my total playtime private', ''], ['friends', 'Friends list', ''], ['inventory', 'Inventory', ''], ['gifts', 'Inventory gifts', '']];
const PLV = { 3: 'Public', 2: 'Friends only', 1: 'Private' }, CLV = { 1: 'Public', 0: 'Friends only', 2: 'Private' };
V.PAGES.profile = () => ({ title: 'Profile', body: 'col', p: null, err: '',
  load() { if (S.chat && S.chat.state === 'in') Promise.resolve(api.profileGet()).then(r => { if (r && r.ok) this.p = r.p; else this.err = (r && r.msg) || ''; V.refresh(this); }); },
  html() {
    const c = S.chat || {}, on = c.state === 'in', p = this.p || {};
    if (!on) return `<div class="plist">` + prow('pr-in', 'Sign in to Steam to edit your profile', 'signin') + prow('pr-lang', 'Languages', 'lang', '', LNAME[S.pref.lang || 'english']) + '</div>';
    return `<div class="pavrow"><div class="sav">${c.avatar ? `<img src="${esc(c.avatar)}">` : icon('user')}</div><div><div class="pnm">${esc(p.name || c.persona || c.name)}</div><div class="psub">${p.custom ? 'steamcommunity.com/id/' + esc(p.custom) : 'Your Steam profile'}</div></div></div>` +
      head('Appearance') + `<div class="plist">` + prow('pr-pic', 'Profile Picture', 'pic') + prow('pr-frame', 'Avatar Frame', 'items', 'frame') + prow('pr-bg', 'Profile Background', 'items', 'background') + prow('pr-mini', 'Mini Profile Background', 'items', 'minibg') + `</div>` +
      head('About you') + `<div class="plist">` + prow('pr-name', 'Name', 'name', '', p.name || c.name) + prow('pr-real', 'Real name', 'real', '', p.real) + prow('pr-url', 'Custom URL', 'url', '', p.custom) + prow('pr-about', 'About', 'about', '', (p.summary || '').replace(/\s+/g, ' ').slice(0, 40)) + `</div>` +
      head('Privacy') + `<div class="plist">` + prow('pr-priv', 'Privacy settings', 'priv') + `</div>` +
      head('Account') + `<div class="plist">` + prow('pr-id', 'Account name', 'none', '', c.account) + prow('pr-lang', 'Languages', 'lang', '', LNAME[S.pref.lang || 'english']) + '</div>' + (this.err ? `<div class="snone s">${esc(this.err)}</div>` : '');
  },
  async save(patch, ok) { const r = await api.profileSave(patch); if (r && r.ok) { Object.assign(this.p || (this.p = {}), { name: patch.name != null ? patch.name : (this.p || {}).name, summary: patch.summary != null ? patch.summary : (this.p || {}).summary, real: patch.real != null ? patch.real : (this.p || {}).real, custom: patch.custom != null ? patch.custom : (this.p || {}).custom }); D.toast(ok); api.chatStatus().then(c => { S.chat = c; V.refresh(this); }); } else D.toast((r && r.msg) || 'Could not save.'); V.refresh(this); },
  acts: {
    none() {}, signin() { V.open('steamlogin'); },
    name() { V.osk({ title: 'Name', value: (this.p || {}).name || (S.chat || {}).name || '', max: 32 }).then(r => { if (r && r.trim()) this.save({ name: r.trim() }, 'Name updated.'); }); },
    real() { V.osk({ title: 'Real name', value: (this.p || {}).real || '', max: 64 }).then(r => { if (r !== null) this.save({ real: r.trim() }, 'Real name updated.'); }); },
    url() { V.osk({ title: 'Custom URL (letters, numbers, - and _)', value: (this.p || {}).custom || '', max: 32 }).then(r => { if (r !== null) this.save({ custom: r.trim() }, 'Custom URL updated.'); }); },
    about() { V.osk({ title: 'About', value: (this.p || {}).summary || '', max: 500 }).then(r => { if (r !== null) this.save({ summary: r }, 'About updated.'); }); },
    items(kind) { V.open('pitems', kind); },
    priv() { V.open('privacy'); },
    pic() { const r = K.fx().getBoundingClientRect(); D.openMenu([
      { icon: 'face', label: 'Animated avatars I own', run: () => V.open('pitems', 'avatar') },
      { icon: 'folder', label: 'Upload an image file…', run: () => D.pick({ title: 'Choose a profile picture', exts: ['png', 'jpg', 'jpeg'] }).then(p => p === null ? { cancel: true } : api.profileAvatar(null, p)).then(x => { if (x && x.ok) D.toast('Profile picture updated. It can take a minute to show.'); else if (x && !x.cancel) D.toast(x.msg || 'Could not upload.'); }) }],
      { top: Math.min(r.top, innerHeight - 300) + 'px', left: '55%', transformOrigin: 'top left' }, 'Profile Picture', 'view'); },
    lang() { const r = K.fx().getBoundingClientRect(); D.openMenu(LANGS.map(l => ({ icon: (S.pref.lang || 'english') === l ? 'check' : 'circle', label: LNAME[l], run: () => { D.setPref('lang', l); D.toast('Language set. Game info updates as it is refreshed.'); V.refresh(); } })), { top: Math.min(r.top, innerHeight - 560) + 'px', left: '55%', transformOrigin: 'top left' }, 'Languages', 'view'); },
  } });

/* items you own on Steam (animated avatars, avatar frames, profile backgrounds) - pick one to equip */
const PNAME = { avatar: 'Animated avatars', frame: 'Avatar frames', background: 'Profile backgrounds', minibg: 'Mini profile backgrounds' }, PKEY = { avatar: 'avatars', frame: 'frames', background: 'backgrounds', minibg: 'minibgs' };
VIEWS.pitems = kind => ({ title: PNAME[kind], body: 'wide', d: null,
  load() { Promise.resolve(api.profileItems()).then(r => { this.d = r; V.refresh(this); }); },
  html() {
    const d = this.d; if (!d) return '<div class="snone">Loading what you own on Steam…</div>'; if (!d.ok) return `<div class="note">${esc(d.msg || 'Could not read your items.')}</div>`;
    const l = d[PKEY[kind]] || [], eq = (d.equipped || {})[kind];
    return `<div class="note">Items you own on Steam. Get more from the Steam Points Shop.</div><div class="grid g5">` + `<div class="fx gc pnone ${!eq ? 'eq' : ''}" data-k="pi-none" data-act="use" data-arg=""><div class="pnn">None</div></div>` +
      l.map(x => `<div class="fx gc pit ${x.id === eq ? 'eq' : ''}" data-k="pi${x.id}" data-act="use" data-arg="${x.id}"><img loading="lazy" src="${esc(x.img || x.small)}"><div class="pnn">${esc(x.name)}${x.id === eq ? ' · Equipped' : ''}</div></div>`).join('') + `</div>` + (l.length ? '' : '<div class="snone">You do not own any of these yet.</div>');
  },
  acts: { use(id) { Promise.resolve(api.profileEquip(kind, id)).then(r => { if (r && r.ok) { D.toast(id ? 'Equipped.' : 'Removed.'); this.d.equipped[kind] = id; api.chatStatus().then(c => { S.chat = c; }); V.refresh(this); } else D.toast((r && r.msg) || 'Steam did not accept that.'); }); } } });

VIEWS.privacy = () => ({ title: 'Privacy settings', body: 'col', p: null, err: '',
  load() { Promise.resolve(api.privacyGet()).then(r => { if (r && r.ok) this.p = r.p; else this.err = (r && r.msg) || 'Could not read your privacy settings.'; V.refresh(this); }); },
  html() {
    if (this.err) return `<div class="note">${esc(this.err)}</div>`; const p = this.p; if (!p) return '<div class="snone">Loading…</div>';
    return `<div class="plist">` + PRIV.map(([k, t]) => prow('pv-' + k, t, 'set', k, PLV[p[k]] || '')).join('') + prow('pv-comments', 'Who can comment on my profile', 'set', 'comments', CLV[p.comments] || '') + '</div>';
  },
  acts: { set(k) { const r = K.fx().getBoundingClientRect(), L = k === 'comments' ? CLV : PLV; D.openMenu(Object.keys(L).sort((a, b) => b - a).map(v => ({ icon: String(this.p[k]) === v ? 'check' : 'circle', label: L[v], run: () => Promise.resolve(api.privacySet({ [k]: +v })).then(x => { if (x && x.ok) { this.p[k] = +v; D.toast('Privacy updated.'); V.refresh(this); } else D.toast((x && x.msg) || 'Steam did not accept it.'); }) })), { top: Math.min(r.top, innerHeight - 320) + 'px', left: '55%', transformOrigin: 'top left' }, 'Who can see this', 'view'); } } });

/* ------------------------------------------------------------- Storage (PlayStation-style two columns) */
const SEG = [['games', 'Games and Apps', '#4db3ff'], ['media', 'Media Gallery', '#7b2fe0'], ['saved', 'Saved Data', '#f0780c'], ['other', 'Other', '#eeeae4']];
const fmt = b => !b ? '0 MB' : b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(b >= 1.05e8 ? 0 : 2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
V.PAGES.storage = () => ({ title: 'Storage', body: 'wide', d: null, sel: 0,
  load() { const go = () => Promise.resolve(api.storage()).then(d => { this.d = d || { libs: [], games: [], cache: { art: 0, ost: 0 } }; V.refresh(this); }).catch(() => { this.d = { libs: [], games: [], cache: { art: 0, ost: 0 } }; V.refresh(this); });
    go(); this.sg = null; this.iv = setInterval(() => Promise.resolve(api.storageSig()).then(s => { if (this.sg !== null && s !== this.sg) go(); this.sg = s; }), 4000); },
  leave() { clearInterval(this.iv); },
  html() {
    const d = this.d; if (!d) return card('Reading drives…');
    const L = d.libs.filter(l => l.total), cur = L[Math.min(this.sel, L.length - 1)];
    const left = `<div class="stl">${L.map((l, i) => `<div class="fx prow ${i === this.sel ? 'cur' : ''}" data-k="st${i}" data-act="pick" data-arg="${i}">${esc(l.extra ? 'Drive (' + l.path.slice(0, 2) + ')' : i === 0 ? 'Steam Library (' + l.path.slice(0, 2) + ')' : 'Extended (' + l.path.slice(0, 2) + ')')}</div>`).join('')}
      ${head('betterSBP data').replace('class="', 'class="mini ')}
      <div class="fx prow" data-k="tcl-a" data-act="clr" data-arg="art"><span>Clear artwork cache</span><em>${fmt(d.cache.art)}</em></div><div class="fx prow" data-k="tcl-o" data-act="clr" data-arg="ost"><span>Clear soundtrack cache</span><em>${fmt(d.cache.ost)}</em></div></div>`;
    if (!cur) return left + card('No Steam library found.');
    const sum = SEG.reduce((a, s) => a + (cur[s[0]] || 0), 0);
    const right = `<div class="str"><div class="sth"><span>${esc(cur.path)}</span><span>Size: ${fmt(cur.total)}</span></div>
      <div class="sbar2">${SEG.map(s => `<i style="width:${Math.max(0, (cur[s[0]] || 0) / cur.total * 100)}%;background:${s[2]}"></i>`).join('')}</div><div class="sfree">Free space: ${fmt(cur.free)}</div>
      ${SEG.map(s => `<div class="srow2"><b style="background:${s[2]}"></b><span>${s[1]}</span><em>${fmt(cur[s[0]])}</em></div>`).join('')}
      ${head('Installed games on this drive · press to uninstall') + (d.games.filter(g => g.library && g.library.slice(0, 1).toUpperCase() === cur.path.slice(0, 1).toUpperCase()).map(g => `<div class="fx srow" data-k="un${g.id}" data-act="unin" data-arg="${g.id}"><div class="stx"><div class="t">${esc(g.name)}</div><div class="s">${fmt(g.size)}</div></div><div class="sr2">${icon('trash')}</div></div>`).join('') || info('No installed games here', ''))}</div>`;
    return `<div class="stor2">${left}${right}</div>`;
  },
  acts: {
    pick(i) { this.sel = +i; V.refresh(this); },
    unin(id) { const g = (this.d.games || []).find(x => x.id === id); if (!g) return; V.dlg({ title: 'Uninstall ' + g.name + '?', msg: 'This deletes the game files (' + fmt(g.size) + ') from this drive. Saves in the cloud or in Documents are kept.', buttons: [{ label: 'Uninstall', run: () => { api.gameAction(id, 'uninstall'); D.toast('Uninstalling ' + g.name + '…'); setTimeout(() => api.storage().then(d => { this.d = d; V.refresh(this); }), 1500); } }, { label: 'Cancel' }] }); },
    clr(k) { V.dlg({ title: k === 'art' ? 'Clear artwork cache?' : 'Clear soundtrack cache?', msg: 'This frees disk space. Nothing in your Steam library is touched.', buttons: [{ label: 'Clear', run: () => { if (k === 'ost') D.stopOst(true); api.clearCache(k).then(() => { D.toast('Cache cleared.'); this.load(); }); } }, { label: 'Cancel' }] }); },
  } });

/* ------------------------------------------------------------- Profile page: Overview / Games / Friends / Shared */
VIEWS.profile = id => {
  const isSelf = () => !id || id === (S.chat && S.chat.me) || id === S.user.steamid;
  return { title: '', body: 'wide', d: null, id, tabI: 0, fr: null, caps: null, gm: null,
  tabs: ['Overview', 'Games', 'Friends', 'Screenshots', 'Artwork', 'Reviews', 'Wishlist', 'Groups'], pc: {},
  need(sec) { if (!this.pc[sec]) { this.pc[sec] = 'loading'; Promise.resolve(api.profileContent(id || (S.chat && S.chat.me) || S.user.steamid, sec)).then(r => { this.pc[sec] = r || []; V.refresh(this); }); } },
  load() {
    const me = isSelf(), pid = me ? null : id;
    api.profile(pid).then(d => { this.d = d; V.refresh(this); });
    if (me) {
      Promise.resolve(api.library && api.library()).then(l => { this.gm = ((l && l.games) || []).map(g => ({ id: g.id, name: g.name, h: (g.minutes || 0) / 60, last: g.last || 0 })).sort((a, b) => (b.last - a.last) || (b.h - a.h)); V.refresh(this); });
      Promise.resolve(api.friends && api.friends()).then(f => { this.fr = (f && f.friends) || []; V.refresh(this); });
    } else {
      api.profileGames(id).then(r => { this.gm = r.games.sort((a, b) => (b.h2 - a.h2) || (b.h - a.h)); this.gpriv = r.priv; V.refresh(this); });
      api.profileFriends(id).then(r => { this.fr = r.friends; this.fpriv = r.priv; V.refresh(this); });
    }
  },
  html() {
    const d = this.d; if (!d) return card('Loading profile…'); if (d.error) return card(esc(d.error));
    const self = isSelf(), st = { offline: 'Offline', online: 'Online', 'in-game': 'In game' }[d.online] || d.online;
    let o = `<div class="phead"><div class="pfa2">${d.avatar ? `<img src="${esc(d.avatar)}">` : icon('user')}<i class="${d.online !== 'offline' ? 'on' : ''}"></i></div>
      <div class="pni"><div class="pnm">${esc(d.name)}</div><div class="psub">${esc([st, d.level != null ? 'Level ' + d.level : '', d.location].filter(Boolean).join('  |  '))}</div></div></div>`;
    o += `<div class="ptabs">${this.tabs.map((t, i) => `<div class="fx ptab ${i === this.tabI ? 'on' : ''}" data-k="pt${i}" data-act="tab" data-arg="${i}">${t}</div>`).join('')}<span class="grow"></span>
      ${self ? `<div class="fx pico" data-k="pt-ed" data-act="edit" title="Edit profile">${icon('edit')}</div><div class="fx pico" data-k="pt-acc" data-act="acct" title="Steam account">${icon('shield')}</div>` : `<div class="fx pico" data-k="pt-msg" data-act="msg" title="Message">${icon('people')}</div>`}</div>`;
    const gm = this.gm;
    if (this.tabI === 0) {
      o += `<div class="stats">` + [['Member since', d.since || '—'], ['Hours (2 weeks)', d.hours2w || '0'], gm ? ['Games', gm.length] : null, this.fr ? ['Friends', this.fr.length] : null].filter(Boolean).map(x => `<div class="stat"><small>${x[0]}</small><b>${esc(x[1])}</b></div>`).join('') + '</div>';
      if (d.summary) o += `<div class="card" style="margin:0 6rem 2rem">${esc(d.summary)}</div>`;
      if (d.most && d.most.length) o += head('Most played') + `<div class="shelf">${d.most.map(g => `<div class="fx sc small" data-k="m${g.id}" data-act="open" data-arg="${g.id}"><img loading="lazy" src="${K.headerU(g.id)}"><div class="sn">${esc(g.name)}</div></div>`).join('')}</div>`;
    } else if (this.tabI === 1) {
      if (!gm) return o + card('Loading games…');
      o += `<div class="rph"><span>${self ? 'Recently played' : 'Games'}</span></div>` + (gm.length ? gm.slice(0, 60).map(g => `<div class="fx grow2" data-k="gm${g.id}" data-act="open" data-arg="${g.id}"><img src="${K.coverU(g.id)}" onerror="D.fb(this,'${g.id}')"><div><div class="gn">${esc(g.name)}</div><div class="gs">${g.last ? 'Played: ' + D.when(g.last * 1000).toLowerCase() + '  |  ' : (g.h2 ? g.h2 + ' h past 2 weeks  |  ' : '')}Total play hours: ${Math.round(g.h)}</div></div></div>`).join('') : `<div class="snone">${self ? 'No games yet.' : 'This player keeps their game details private.'}</div>`);
    } else if (this.tabI === 2) {
      const f = this.fr; o += !f ? card('Loading friends…') : f.length ? f.map(x => `<div class="fx srow frow" data-k="f${x.id}" data-act="friend" data-arg="${x.id}"><div class="fav">${x.avatar ? `<img src="${esc(x.avatar)}">` : `<span>${esc((x.name || '?')[0])}</span>`}${self && x.state >= 0 ? `<i class="${x.state > 0 ? 'on' : ''}${x.game ? ' play' : ''}"></i>` : ''}</div><div class="stx"><div class="t">${esc(x.name)}</div><div class="s">${esc(self ? (x.game ? 'Playing ' + x.game : x.state > 0 ? 'Online' : 'Offline') : '')}</div></div></div>`).join('') : `<div class="snone">${self ? 'No friends to show. Sign in to Steam to load them.' : 'This player keeps their friends list private.'}</div>`;
    } else {
      const sec = ['shots', 'art', 'reviews', 'wishlist', 'groups'][this.tabI - 3]; this.need(sec); const l = this.pc[sec];
      if (!l || l === 'loading') return o + '<div class="snone">Loading from Steam…</div>';
      if (!l.length) return o + `<div class="snone">${self ? 'Nothing here yet.' : 'Nothing public here.'}</div>`;
      if (sec === 'shots' || sec === 'art') o += `<div class="grid g4">${l.map((x, i) => `<div class="fx gc" data-k="pi${i}" data-act="pimg" data-arg="${sec}:${i}"><img loading="lazy" src="${esc(x.img)}"></div>`).join('')}</div>`;
      else if (sec === 'reviews') o += l.map((r, i) => `<div class="fx srow rvr" data-k="pr${i}" data-act="prev" data-arg="${i}"><div class="rvi ${r.up ? 'up' : 'dn'}">${icon(r.up ? 'check' : 'x')}</div><div class="stx"><div class="t">${esc(r.game)} · ${r.up ? 'Recommended' : 'Not recommended'}${r.hours ? ' · ' + esc(r.hours) + ' h' : ''}</div><div class="s">${esc(r.text.slice(0, 160))}</div></div></div>`).join('');
      else if (sec === 'wishlist') o += `<div class="grid g5">${l.map(w => `<div class="fx pcd" data-k="pw${w.id}" data-act="open" data-arg="${w.id}"><img loading="lazy" src="${K.headerU(w.id)}"><div class="pcn">${esc(w.name)}</div></div>`).join('')}</div>`;
      else o += `<div class="grid g4 nwg">${l.map((g, i) => `<div class="nwc"><img loading="lazy" src="${esc(g.img)}" onerror="this.remove()"><div class="nwt">${esc(g.name)}<small>${esc(g.members ? g.members + ' members' : '')}</small></div></div>`).join('')}</div>`;
    }
    return o;
  },
  acts: {
    tab(i) { this.tabI = +i; V.refresh(this); }, acct() { V.openSettingsPage('users'); }, edit() { V.openSettingsPage('profile'); },
    pimg(a) { const [sec, i] = a.split(':'), l = this.pc[sec] || []; V.lightbox(l.map(x => ({ src: x.full || x.img, cap: '' })), +i); }, prev(i) { const r = this.pc.reviews[+i]; V.dlg({ title: r.game + ' · ' + (r.up ? 'Recommended' : 'Not recommended'), msg: r.text, buttons: [{ label: 'Close' }] }); },
    open(g) { V.open('game', g); }, shot(src) { V.lightbox([{ src, cap: '' }], 0); },
    friend(fid) { if (isSelf() && S.chat && S.chat.state === 'in') { S.chatNames = S.chatNames || {}; const f = (this.fr || []).find(x => x.id === fid); if (f) S.chatNames[fid] = f.name; V.open('chat', fid); } else V.open('profile', fid); },
    msg() { S.chatNames = S.chatNames || {}; S.chatNames[id] = this.d.name; V.open(S.chat && S.chat.state === 'in' ? 'chat' : 'steamlogin', id); },
  } };
};

/* ------------------------------------------------------------- Game information (3 panels) + properties + library extras */
const nameFor = id => { const g = S.games.find(x => x.id === String(id)); if (g) return g.name; const l = S.lib && S.lib.games.find(x => x.id === String(id)); return l ? l.name : 'Game'; };
VIEWS.ginfo = id => ({ title: nameFor(id), body: 'wide', d: null,
  load() { Promise.resolve(api.storeApp(id)).then(d => { this.d = d || {}; V.refresh(this); }).catch(() => { this.d = {}; V.refresh(this); }); },
  html() {
    const d = this.d; if (!d) return card('Loading…');
    const det = (S.data[id] && S.data[id].details) || {}, raw = S.games.find(g => g.id === String(id)) || {};
    const desc = d.about || d.desc || det.desc || 'No description available.', pub = (d.publishers || det.publishers || [])[0] || (d.developers || det.developers || [])[0] || '—';
    const row = (a, b) => `<div class="irow"><span>${a}</span><b>${esc(b || '—')}</b></div>`, ic = (n, t) => `<div class="iic">${icon(n)}<span>${esc(t)}</span></div>`;
    const cats = d.categories || det.categories || [], single = cats.some(c => /single/i.test(c)), multi = cats.some(c => /multi|co-op|online/i.test(c));
    return `<div class="ginfo"><div class="fx gip1" data-k="gi-d" data-act="more"><p>${esc(desc).replace(/\n+/g, '</p><p>')}</p></div>
      <div class="gip2">${row('Publisher:', pub)}${row('Release Date:', d.release || det.release)}${row('Developer:', (d.developers || det.developers || []).join(', '))}${row('Genre:', (d.genres || det.genres || []).join(', '))}${row('Age rating:', d.age ? d.age + '+' : '')}<hr>
        ${ic('wifi', multi ? 'Online / multiplayer features' : single ? 'Single-player' : 'Offline play')}${ic('disk', (d.storage || (raw.size ? (raw.size / 1073741824).toFixed(1) + ' GB' : '')) || 'Size unknown')}${ic('user', multi && single ? '1 or more players' : multi ? 'Multiplayer' : '1 player')}</div>
      <div class="gip3">${d.reqMin ? `<b>Minimum requirements</b><p>${esc(d.reqMin)}</p>` : ''}${d.languages ? `<b>Languages</b><p>${esc(d.languages)}</p>` : ''}${d.notes ? `<b>Content</b><p>${esc(d.notes)}</p>` : ''}<p class="legal">${esc(d.legal || 'Game information is provided by the Steam store.')}</p></div></div>
      <div class="rm">${icon('play')}<span>Read More</span></div>`;
  },
  acts: { more() { const d = this.d || {}; V.dlg({ title: nameFor(id), msg: (d.about || d.desc || '').slice(0, 1600), buttons: [{ label: 'Close' }] }); } } });

VIEWS.gprops = id => ({ title: nameFor(id) + ' — Properties', body: 'col',
  html() {
    const o = (S.pref.launchOpts || {})[id] || '', ns = (S.games.find(g => g.id === String(id)) || {}).nonSteam;
    return head('Launch options') + rowA('gp-lo', 'edit', 'Launch options', { act: 'lo', right: esc(o || 'None'), sub: 'Command-line arguments passed to the game, e.g. -windowed -novid' }) +
      (o ? rowA('gp-rs', 'restart', 'Reset launch options', { act: 'rs' }) : '') +
      head('Game') + rowA('gp-fav', 'heart', S.pref.fav.includes(String(id)) ? 'Remove from favorites' : 'Add to favorites', { act: 'fav' }) +
      (ns ? '' : rowA('gp-ver', 'check', 'Verify files / update', { act: 'verify', sub: 'Downloads any missing or changed files using the in-app downloader.' }) + rowA('gp-com', 'people', 'Community hub', { act: 'hub' }) + head('Controller') + rowA('gp-ctl', 'pad', 'Controller and Steam Input', { act: 'ctl', sub: 'Turn Steam Input on or off for this game, and controller options.' }));
  },
  acts: {
    lo() { V.osk({ title: 'Launch options', value: (S.pref.launchOpts || {})[id] || '', max: 200 }).then(r => { if (r !== null) { D.setPref('launchOpts', { ...(S.pref.launchOpts || {}), [id]: r.trim() }); V.refresh(); } }); },
    rs() { const l = { ...(S.pref.launchOpts || {}) }; delete l[id]; D.setPref('launchOpts', l); V.refresh(); },
    fav() { const a = S.pref.fav.slice(), i = a.indexOf(String(id)); i < 0 ? a.push(String(id)) : a.splice(i, 1); D.setPref('fav', a); V.refresh(); },
    ctl() { V.open('ginput', { id, name: nameFor(id) }); }, verify() { D.startInstall(id, nameFor(id)); }, hub() { V.open('ghub', id); },
  } });

// Library: Favorites + collections + "add non-Steam game"
{
  const L0 = VIEWS.library;
  VIEWS.library = () => {
    const v = L0(), html0 = v.html, list0 = v.list;
    v.tabs = ['All', 'Installed', 'Recently played', 'Most played', 'Favorites'];
    v.html = function () {
      const base = ['All', 'Installed', 'Recently played', 'Most played', 'Favorites']; this.tabs = base.concat(Object.keys(S.pref.colls || {}));
      return html0.call(this).replace('<div class="fx pill" data-k="lsearch"', `<div class="fx pill" data-k="ladd" data-act="addns">${icon('plus')}Add a non-Steam game</div><div class="fx pill" data-k="lsearch"`);
    };
    v.list = function () {
      if (this.tabI < 4) return list0.call(this);
      let l = (S.lib ? S.lib.games : []).slice(); const q = this.filter.toLowerCase();
      // non-Steam games live only in S.games
      S.games.filter(g => g.nonSteam && !l.find(x => x.id === g.id)).forEach(g => l.push({ id: g.id, name: g.name, installed: true, minutes: 0, last: g.lastPlayed || 0 }));
      const ids = this.tabI === 4 ? S.pref.fav : (S.pref.colls[this.tabs[this.tabI]] || []);
      l = l.filter(g => ids.includes(g.id)); if (q) l = l.filter(g => g.name.toLowerCase().includes(q));
      return l.sort((a, b) => a.name.localeCompare(b.name));
    };
    v.acts.addns = function () { D.pick({ title: 'Add a non-Steam game', exts: ['exe', 'lnk', 'bat', 'cmd'] }).then(p => p === null ? null : api.nsAdd(p)).then(r => { if (r) D.toast('Added ' + r.name + '.'); }); };
    return v;
  };
}

/* ------------------------------------------------------------- Control-center side panels (Notifications / Sound / Music / Mic) */
const { rowT, rowS, rowC } = K;
const tm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const devs = async kind => { try { const l = await navigator.mediaDevices.enumerateDevices(); return l.filter(d => d.kind === kind); } catch { return []; } };
const pickDev = async (kind, key, title, apply) => {
  const l = await devs(kind), cur = S.pref[key] || 'default';
  const items = [{ id: 'default', label: 'System default' }].concat(l.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || (title + ' ' + (i + 1)) })));
  D.openMenu(items.map(x => ({ icon: x.id === cur ? 'check' : 'circle', label: x.label, run: () => { D.setPref(key, x.id); apply && apply(x.id); V.refresh(); } })), { top: '20%', right: '62rem', transformOrigin: 'top right' }, title, 'view');
};
const devName = async (kind, key) => { const id = S.pref[key]; if (!id || id === 'default') return 'System default'; const l = await devs(kind); const d = l.find(x => x.deviceId === id); return d ? d.label : 'System default'; };

VIEWS.ccnotes = () => ({ title: 'Notifications', cls: 'sidep', body: 'col',
  html: () => `<div class="spt">Notifications</div>` + rowT('n1', 'bell', 'Do Not Disturb', 'dnd', 'Hides pop-ups. Messages are still kept here.') +
    (S.notes.length ? S.notes.slice().reverse().map((n, i) => `<div class="fx srow nrow" data-k="nn${i}" data-act="del" data-arg="${S.notes.length - 1 - i}"><div class="nic">${icon('bell')}</div><div class="stx"><div class="t">${esc(n.msg)}</div><div class="s">${tm(n.t)}</div></div></div>`).join('') + rowA('n-clr', 'trash', 'Delete all', { act: 'clr' }) : '<div class="snone s">No notifications</div>'),
  acts: { del(i) { S.notes.splice(+i, 1); V.refresh(); }, clr() { S.notes.length = 0; V.refresh(); } } });

VIEWS.ccnews = () => ({ title: 'Official news', cls: 'sidep', body: 'col',
  html: () => `<div class="spt">Official news</div>` + (S.news.length ? S.news.slice(0, 12).map((n, i) => `<div class="fx srow nwr" data-k="nw${i}" data-act="open" data-arg="${i}"><div class="nwi">${n.image ? `<img loading="lazy" src="${esc(n.image)}" onerror="this.remove()">` : ''}</div><div class="stx"><div class="t">${esc(n.title)}</div><div class="s">${esc(n.gameName || '')} · ${D.when(n.date)}</div></div></div>`).join('') : '<div class="snone s">No news right now</div>'),
  acts: { open(i) { V.open('news', S.news[+i]); } } });

VIEWS.ccsound = () => ({ title: 'Sound', cls: 'sidep', body: 'col', outName: 'System default',
  load() { devName('audiooutput', 'outDev').then(n => { this.outName = n; V.refresh(this); }); },
  html() {
    return `<div class="spt">Sound</div>` +
      rowA('s-out', 'volume', 'Output device', { act: 'out', sub: this.outName }) +
      rowT('s-mute', 'volume', 'Mute everything', 'muted') +
      `<div class="sph">Media volume</div>` +
      rowS('s-vol', 'volume', 'Overall', 'vol', 0, 1, .05, v => Math.round(v * 100)) +
      rowS('s-mus', 'music', 'Game music', 'musicVol', 0, 1, .05, v => Math.round(v * 100)) +
      rowS('s-vid', 'film', 'Video & trailers', 'vidVol', 0, 1, .05, v => Math.round(v * 100)) +
      rowT('s-th', 'bell', 'Sounds', 'sfx', 'Menu click and navigation sounds.')
  },
  acts: { out() { pickDev('audiooutput', 'outDev', 'Output device', id => D.applySink && D.applySink(id)); } } });

VIEWS.ccmusic = () => ({ title: 'Music', cls: 'sidep', body: 'col',
  html() {
    const g = S.items[0].find(x => x.kind === 'game' && x.id === S.nowId), on = S.pref.music && !S.pref.muted;
    return `<div class="spt">Music</div><div class="nowp"><div class="npc">${icon('music')}</div><div class="stx"><div class="t">${g ? esc(g.name) + ' Soundtrack' : 'Game soundtrack'}</div><div class="s">${on ? 'Playing while you browse' : 'Off'}</div></div></div>` +
      rowT('m1', 'music', 'Play game music', 'music', 'Plays each game\'s soundtrack while it is selected.') +
      rowS('m2', 'volume', 'Music volume', 'musicVol', 0, 1, .05, v => Math.round(v * 100)) +
      (g ? rowA('m3', 'restart', 'Try a different soundtrack', { act: 'other' }) : '');
  },
  acts: { other() { const g = S.items[0].find(x => x.kind === 'game' && x.id === S.nowId); if (g) { D.stopOst(true); api.ostRefresh(g.id, g.name).then(() => D.playOst(g)); D.toast('Searching for another soundtrack…'); } } } });

let micStream = null, micRaf = 0;
const micStop = () => { cancelAnimationFrame(micRaf); try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch {} micStream = null; };
VIEWS.ccmic = () => ({ title: 'Microphone', cls: 'sidep', body: 'col', inName: 'System default', err: '',
  load() { devName('audioinput', 'micDev').then(n => { this.inName = n; V.refresh(this); }); this.start(); },
  leave() { micStop(); },
  async start() {
    micStop(); this.err = '';
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: S.pref.micDev && S.pref.micDev !== 'default' ? { deviceId: { exact: S.pref.micDev } } : true });
      micStream.getAudioTracks().forEach(t => t.enabled = !S.pref.micMute);
      const ctx = new AudioContext(), src = ctx.createMediaStreamSource(micStream), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); const buf = new Uint8Array(an.fftSize);
      const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const b of buf) m = Math.max(m, Math.abs(b - 128)); const el = document.querySelector('.micl i'); if (el) el.style.width = (S.pref.micMute ? 0 : Math.min(100, m * 2.2)) + '%'; micRaf = requestAnimationFrame(tick); };
      tick();
    } catch (e) { this.err = 'No microphone could be opened. Check Windows privacy settings.'; V.refresh(this); }
  },
  html() {
    return `<div class="spt">Microphone</div>` + rowA('mc-dev', 'mic', 'Input device', { act: 'dev', sub: this.inName }) +
      rowT('mc-mute', 'mic', 'Mute microphone', 'micMute') +
      `<div class="sph">Input level</div><div class="micl"><i></i></div>` + (this.err ? `<div class="snone s">${esc(this.err)}</div>` : `<div class="snone s">Speak to test your microphone.</div>`);
  },
  acts: { dev() { pickDev('audioinput', 'micDev', 'Input device', () => this.start()); } },
  after() { const t = micStream && micStream.getAudioTracks(); t && t.forEach(x => x.enabled = !S.pref.micMute); } });

// Gallery: screenshots folder (Steam's own screenshot manager location)
{
  const G0 = VIEWS.gallery;
  VIEWS.gallery = () => {
    const v = G0(), h0 = v.html;
    v.html = function () { const o = h0.call(this); return o.replace(/(<div class="chips">.*?<\/div>)(?=<|$)/s, m => m).replace('<div class="chips">', `<div class="pills" style="padding:0 6rem 1rem"><div class="fx pill" data-k="gfolder" data-act="folder">${icon('folder')}Open Steam screenshots folder</div></div><div class="chips">`); };
    v.acts = Object.assign({}, v.acts, { folder() { api.gameAction('0', 'shots').then(ok => { if (!ok) D.toast('No Steam screenshots folder found yet.'); }); } });
    return v;
  };
}

/* ------------------------------------------------------------- Community (own UI, no web pages) */
VIEWS.community = () => ({ title: 'Community', icon: 'globe', body: 'wide', tabI: 0, tabs: ['Friends activity', 'Game hubs', 'News'],
  load() { api.friends && api.friends().then(f => { S.friends = f && f.friends || []; V.refresh(this); }); },
  html() {
    let o = `<div class="pills">${this.tabs.map((t, i) => `<div class="fx pill ${i === this.tabI ? 'on' : ''}" data-k="ct${i}" data-act="tab" data-arg="${i}">${t}</div>`).join('')}</div>`;
    if (this.tabI === 0) {
      const fcard = (f, sub) => `<div class="fx fcard" data-k="f${f.id}" data-act="chat" data-arg="${f.id}"><div class="fcav">${f.avatar ? `<img src="${esc(f.avatar.replace(/(_medium|_full)?\.jpg$/, '_full.jpg'))}" onerror="this.remove()">` : `<span>${esc((f.name || '?')[0].toUpperCase())}</span>`}<i class="${f.game ? 'play' : 'on'}"></i></div><div class="fcn">${esc(f.name)}</div><div class="fcs ${f.game ? 'g' : ''}">${esc(sub)}</div></div>`; const pl = (S.friends || []).filter(f => f.game), on = (S.friends || []).filter(f => !f.game && f.state > 0);
      if (!(S.chat && S.chat.state === 'in')) return o + `<div class="snone">Sign in to Steam to see what your friends are playing.</div><div class="pills"><div class="fx pill" data-k="c-in" data-act="signin">${icon('steam')}Sign in</div></div>`;
      o += head('Playing now') + (pl.length ? `<div class="fgrid">${pl.map(f => fcard(f, f.game)).join('')}</div>` : info('Nobody is playing right now', ''));
      return o + head('Online') + (on.length ? `<div class="fgrid">${on.slice(0, 40).map(f => fcard(f, 'Online')).join('')}</div>` : info('No friends online', ''));
    }
    if (this.tabI === 1) { const g = S.games.slice(0, 40); return o + `<div class="grid g4 nwg">${g.map(x => `<div class="fx nwc" data-k="h${x.id}" data-act="hub" data-arg="${x.id}"><img loading="lazy" src="${D.hdr(x.id)}" onerror="this.remove()"><div class="nwt">${esc(x.name)}<small>Community hub</small></div></div>`).join('')}</div>`; }
    return o + (S.news.length ? `<div class="grid g4 nwg">${S.news.slice(0, 24).map((n, i) => `<div class="fx nwc" data-k="n${i}" data-act="news" data-arg="${i}"><img loading="lazy" src="${esc(n.image || D.hdr(n.gameId))}" onerror="this.remove()"><div class="nwt">${esc(n.title)}<small>${esc(n.gameName)} · ${D.when(n.date)}</small></div></div>`).join('')}</div>` : '<div class="snone">No news right now</div>');
  },
  tab(d) { this.tabI = (this.tabI + d + this.tabs.length) % this.tabs.length; this.fk = 'ct' + this.tabI; V.refresh(this); },
  acts: { tab(i) { this.tabI = +i; V.refresh(this); }, signin() { V.open('steamlogin'); }, chat(id) { V.open('chat', id); }, hub(id) { V.open('ghub', id); }, news(i) { V.open('news', S.news[+i]); } } });

VIEWS.ghub = id => ({ title: nameFor(id) + ' — Community', icon: 'people', body: 'wide', tabI: 0, tabs: ['News', 'Reviews', 'Screenshots', 'Artwork', 'Guides', 'Workshop', 'Friends'], news: null, rev: null, d: null, hc: {},
  need(sec) { if (!this.hc[sec]) { this.hc[sec] = 'loading'; Promise.resolve(api.hubContent(id, sec)).then(r => { this.hc[sec] = r || []; V.refresh(this); }); } },
  load() { Promise.resolve(api.newsGame(id)).then(n => { this.news = n || []; V.refresh(this); }); Promise.resolve(api.reviewsList(id)).then(r => { this.rev = r || []; V.refresh(this); }); api.storeApp(id).then(d => { this.d = d || {}; V.refresh(this); }); },
  html() {
    let o = `<div class="pills">${this.tabs.map((t, i) => `<div class="fx pill ${i === this.tabI ? 'on' : ''}" data-k="gt${i}" data-act="tab" data-arg="${i}">${t}</div>`).join('')}</div>`;
    if (this.tabI === 0) return o + (!this.news ? '<div class="snone">Loading…</div>' : this.news.length ? `<div class="grid g4 nwg">${this.news.map((n, i) => `<div class="fx nwc" data-k="n${i}" data-act="news" data-arg="${i}"><img loading="lazy" src="${esc(n.image || D.hdr(id))}" onerror="this.remove()"><div class="nwt">${esc(n.title)}<small>${D.when(n.date)}</small></div></div>`).join('')}</div>` : '<div class="snone">No news for this game</div>');
    if (this.tabI === 1) {
      const rv = this.d && this.d.reviews, h = rv ? `<div class="note">${esc(rv.label || '')}${rv.pct != null ? ' · ' + rv.pct + '% positive' : ''}${rv.total ? ' · ' + rv.total.toLocaleString() + ' reviews' : ''}</div>` : '';
      return o + h + (!this.rev ? '<div class="snone">Loading…</div>' : this.rev.length ? this.rev.map((r, i) => `<div class="fx srow rvr" data-k="r${i}" data-act="rev" data-arg="${i}"><div class="rvi ${r.up ? 'up' : 'dn'}">${icon(r.up ? 'check' : 'x')}</div><div class="stx"><div class="t">${r.up ? 'Recommended' : 'Not recommended'} · ${r.hours} h played</div><div class="s">${esc(r.text.slice(0, 160))}</div></div><div class="sr2">${r.votes} helpful</div></div>`).join('') : '<div class="snone">No reviews yet</div>');
    }
    if (this.tabI >= 2 && this.tabI <= 5) {
      const sec = ['shots', 'art', 'guides', 'workshop'][this.tabI - 2]; this.need(sec); const l = this.hc[sec];
      if (!l || l === 'loading') return o + '<div class="snone">Loading from the Steam Community…</div>';
      return o + (l.length ? `<div class="grid g4 nwg">${l.map((x, i) => `<div class="fx nwc" data-k="hc${i}" data-act="hcopen" data-arg="${sec}:${i}"><img loading="lazy" src="${esc(x.img)}" onerror="this.remove()"><div class="nwt">${esc(x.title || (sec === 'shots' ? 'Screenshot' : 'Artwork'))}<small>${esc(x.by ? 'by ' + x.by : '')}</small></div></div>`).join('')}</div>` : '<div class="snone">Nothing to show here yet</div>');
    }
    const fr = (S.friends || []).filter(f => f.game === nameFor(id));
    return o + (fr.length ? `<div class="grid g4 nwg">${fr.map(f => `<div class="fx nwc" data-k="f${f.id}" data-act="chat" data-arg="${f.id}"><img src="${esc(f.avatar || '')}" onerror="this.remove()"><div class="nwt">${esc(f.name)}<small>Playing now</small></div></div>`).join('')}</div>` : '<div class="snone">None of your friends are playing this right now</div>');
  },
  tab(d) { this.tabI = (this.tabI + d + this.tabs.length) % this.tabs.length; this.fk = 'gt' + this.tabI; V.refresh(this); },
  acts: { tab(i) { this.tabI = +i; V.refresh(this); }, news(i) { V.open('news', this.news[+i]); }, chat(f) { V.open('chat', f); },
    hcopen(a) { const [sec, i] = a.split(':'), l = this.hc[sec] || []; V.lightbox(l.map(x => ({ src: x.full || x.img, cap: [x.title, x.by && 'by ' + x.by].filter(Boolean).join(' · ') })), +i); },
    shot(i) { const sh = this.d.shots; V.lightbox(sh.map(x => ({ src: x.full, cap: nameFor(id) })), +i); },
    rev(i) { const r = this.rev[+i]; V.dlg({ title: (r.up ? 'Recommended' : 'Not recommended') + ' · ' + r.hours + ' h played', msg: r.text, buttons: [{ label: 'Close' }] }); } } });


/* ------------------------------------------------------------- Discord (through the Discord desktop app's local RPC) */
S.dc = S.dc || { state: 'off' };
const dcOn = () => S.dc && S.dc.state === 'on';

// Friends: Steam | Xbox | Discord tabs
S.xb = S.xb || { state: 'out' };
{
  const F0 = VIEWS.friends;
  VIEWS.friends = () => {
    const v = F0(), h0 = v.html, l0 = v.load; v.tabI = 0; v.cls = 'sidep'; v.body = 'col'; v.xf = null;
    const bar = t => `<div class="pills"><div class="fx pill ${t === 0 ? 'on' : ''}" data-k="ftS" data-act="ftab" data-arg="0"><span class="pli">${icon('steam')}</span>Steam</div><div class="fx pill ${t === 1 ? 'on' : ''}" data-k="ftX" data-act="ftab" data-arg="1"><span class="pli">${(D.logo && D.logo('xbox')) || icon('pad')}</span>Xbox</div><div class="fx pill ${t === 2 ? 'on' : ''}" data-k="ftD" data-act="ftab" data-arg="2"><span class="pli">${(D.logo && D.logo('discord')) || icon('people')}</span>Discord${dcOn() && S.dc.selected ? ' ●' : ''}</div></div>`;
    const loadX = function () { Promise.resolve(api.xboxStatus()).then(c => { if (c) { S.xb = c; if (c.state === 'in') Promise.resolve(api.xboxFriends()).then(r => { this.xf = r; V.refresh(this); }); else V.refresh(this); } }); };
    v.load = function () { l0.call(this); loadX.call(this); Promise.resolve(api.friends && api.friends()).then(f => { this.reqs = (f && f.requests) || []; V.refresh(this); }); const dl = () => Promise.resolve(api.discordStatus && api.discordStatus()).then(c => { if (c) { S.dc = c; if (c.state === 'on') Promise.resolve(api.dcGuilds()).then(g => { this.dg = g; V.refresh(this); }); else V.refresh(this); } }); this.dl = dl; dl(); };
    v.html = function () {
      if (this.tabI === 0) { const req = (this.reqs || []).map((r, i) => `<div class="fx srow frow" data-k="rq${i}" data-act="rq" data-arg="${i}"><div class="fav">${r.avatar ? `<img src="${esc(r.avatar)}">` : `<span>${esc((r.name || '?')[0])}</span>`}</div><div class="stx"><div class="t">${esc(r.name)}</div><div class="s">Wants to be your friend · press to answer</div></div></div>`).join('');
        return bar(0) + (S.chat && S.chat.state === 'in' ? rowA('f-add', 'plus', 'Add a friend', { act: 'addf', sub: 'Friend code, profile link or SteamID' }) + (req ? head('Friend requests') + req : '') : '') + h0.call(this); }
      if (this.tabI === 1) {
        const x = S.xb || {}; let o = bar(1);
        if (x.state === 'code') return o + `<div class="xbc"><div class="slb">SIGN IN WITH MICROSOFT</div><div class="sinfo">On your phone or PC open <b>${esc((x.url || 'microsoft.com/link').replace(/^https?:\/\//, ''))}</b> and enter</div><div class="xcode">${esc(x.code || '…')}</div>${x.qr ? `<div class="sqr"><img src="${x.qr}"></div>` : ''}<div class="sinfo c sm">Waiting for you to finish on your phone…</div></div>` + rowA('x-x', 'x', 'Cancel', { act: 'xcancel' });
        if (x.state === 'connecting') return o + '<div class="snone">Signing in to Xbox…</div>';
        if (x.state !== 'in') return o + (x.err ? `<div class="note">${esc(x.err)}</div>` : '') + `<div class="note">Sign in with your Microsoft account to see your Xbox friends, who is online and what they are playing.</div>` + rowA('x-in', 'user', 'Sign in with Microsoft', { act: 'xweb', sub: 'Also signs you in to Xbox Cloud Gaming. Esc cancels.' }) + rowA('x-in2', 'chat', 'Sign in with a code on your phone', { act: 'xconnect', sub: 'Friends only; Xbox Cloud Gaming asks separately.' });
        o += rowA('x-add', 'plus', 'Add an Xbox friend', { act: 'xadd', sub: 'By gamertag' });
        o += `<div class="dme">${x.me && x.me.avatar ? `<img src="${esc(x.me.avatar)}">` : ''}<b>${esc((x.me || {}).name || 'Xbox')}</b></div>`;
        const r = this.xf; if (!r) return o + '<div class="snone">Loading friends…</div>'; if (!r.ok) return o + `<div class="note">${esc(r.msg || 'Could not load your Xbox friends.')}</div>`;
        const on = r.friends.filter(f => f.state > 0), off = r.friends.filter(f => f.state <= 0);
        const row = f => `<div class="fx srow frow" data-k="x${f.id}" data-act="xfriend" data-arg="${f.id}"><div class="fav">${f.avatar ? `<img src="${esc(f.avatar)}">` : `<span>${esc((f.name || '?')[0].toUpperCase())}</span>`}<i class="${f.state > 0 ? 'on' : ''}${f.game ? ' play' : ''}"></i></div><div class="stx"><div class="t">${esc(f.name)}</div><div class="s ${f.game ? 'g' : ''}">${esc(f.game ? 'Playing ' + f.game : f.state > 0 ? (f.text || 'Online') : 'Offline')}</div></div></div>`;
        if (!r.friends.length) return o + '<div class="snone">No Xbox friends found.</div>' + rowA('x-retry', 'restart', 'Reload friends', { act: 'xreload', sub: 'Xbox sometimes answers slowly.' }) + rowA('x-out0', 'power', 'Sign out of Xbox', { act: 'xout' });
        if (on.length) o += head('Online — ' + on.length) + on.map(row).join(''); if (off.length && S.pref.showOffline !== false) o += head('Offline — ' + off.length) + off.map(row).join('');
        return o + rowA('x-out', 'power', 'Sign out of Xbox', { act: 'xout' });
      }
      const c = S.dc || {};
      let o = bar(2);
      if (!dcOn()) return o + (c.state === 'connecting' ? '<div class="snone">Connecting to Discord…</div>' : `<div class="note">Log in to Discord once (email and password, or the QR code from the Discord phone app). After that your servers, direct messages and voice channels work right here in betterSBP.</div>` + rowA('d-set', 'people', 'Log in to Discord', { act: 'dconnect' }));
      o += `<div class="dme">${c.me && c.me.avatar ? `<img src="${esc(c.me.avatar)}">` : ''}<b>${esc((c.me || {}).name || 'Discord')}</b></div>`;
      if (c.voice) o += rowA('d-v', 'volume', 'In voice: ' + c.voice.name, { act: 'dvoice', sub: 'Press to open the voice controls' });
      o += rowA('d-dm', 'chat', 'Direct messages', { act: 'ddms' }) + rowA('d-fr', 'people', 'Friends', { act: 'dfr' });
      const g = this.dg;
      if (!g) o += '<div class="snone">Loading servers…</div>';
      else if (!g.ok) o += `<div class="note">${esc(g.msg || 'Could not load servers.')}</div>` + rowA('d-re', 'restart', 'Try again', { act: 'dreload' });
      else o += head('Servers') + (g.v.length ? g.v.map((x, i) => `<div class="fx srow frow" data-k="dg${i}" data-act="dguild" data-arg="${i}">${dav(x.icon, x.name)}<div class="stx"><div class="t">${esc(x.name)}</div></div></div>`).join('') : '<div class="snone">You are not in any servers.</div>');
      return o + rowA('d-out', 'power', 'Log out of Discord', { act: 'dout' });
    };
    const KEY = ['ftS', 'ftX', 'ftD'];
    Object.assign(v.acts, { dguild(i) { V.open('dguild', this.dg.v[+i]); }, ddms() { V.open('ddms'); }, dfr() { V.open('dfriends'); }, dvoice() { V.open('dvoice'); }, dreload() { this.dg = null; V.refresh(this); this.dl(); }, addf() { V.osk({ title: 'Friend code, profile link or SteamID', max: 120 }).then(r => { if (r && r.trim()) Promise.resolve(api.friendAdd(r.trim())).then(x => { D.toast((x && x.msg) || 'Done.'); }); }); }, rq(i) { const r = this.reqs[+i]; V.dlg({ title: r.name, msg: 'wants to be your friend.', buttons: [{ label: 'Accept', run: () => { api.friendRespond(r.id, true); this.reqs.splice(+i, 1); D.toast('Friend added.'); V.refresh(this); } }, { label: 'Decline', run: () => { api.friendRespond(r.id, false); this.reqs.splice(+i, 1); V.refresh(this); } }, { label: 'Later' }] }); }, xadd() { V.osk({ title: 'Xbox gamertag', max: 30 }).then(r => { if (r && r.trim()) Promise.resolve(api.xboxAdd(r.trim())).then(x => D.toast((x && x.msg) || 'Done.')); }); }, ftab(i) { this.tabI = +i; this.fk = KEY[this.tabI]; V.refresh(this); }, dout() { api.discordDisconnect(); }, dconnect() { api.discordConnect(); }, 
      xreload() { this.xf = null; V.refresh(this); Promise.resolve(api.xboxFriends()).then(r => { this.xf = r; V.refresh(this); }); }, xconnect() { api.xboxConnect(); }, xweb() { api.xboxWebConnect(); }, xcancel() { api.xboxCancel(); }, xout() { Promise.resolve(api.xboxSignout()).then(() => { this.xf = null; D.toast('Signed out of Xbox.'); }); }, xfriend(id) { const f = ((this.xf || {}).friends || []).find(x => x.id === id); if (f) { const r = K.fx().getBoundingClientRect(); D.openMenu([{ icon: 'people', label: 'View profile', run: () => V.open('xprofile', f) }, { icon: 'chat', label: 'Message', run: () => V.open('xchat', f) }], { top: Math.min(r.top, innerHeight - 220) + 'px', left: '55%', transformOrigin: 'top left' }, f.name, 'view'); } } });
    v.tab = function (d) { this.tabI = (this.tabI + d + 3) % 3; this.fk = KEY[this.tabI]; V.refresh(this); };
    return v;
  };
}
api.onXbox && api.onXbox(c => { const was = S.xb && S.xb.state; S.xb = c; const t = K.top(); if (t && t.name === 'friends') { if (c.state === 'in' && was !== 'in') t.load(); else V.refresh(t); } if (c.state === 'in' && was !== 'in') D.toast('Signed in to Xbox.'); });
api.onDiscord && api.onDiscord(c => { const was = S.dc && S.dc.state; S.dc = c; const t = K.top(); if (t && (t.name === 'friends')) { if (t.name === 'friends' && c.state === 'on' && was !== 'on') t.load(); else V.refresh(t); } if (c.state === 'on' && was !== 'on') D.toast('Discord connected.'); dcReload(t); });


/* ------------------------------------------------------------- settings shortcuts next to the things they change */
{
  const QS = { library: ['library', 'Library settings'], gallery: ['captures', 'Capture settings'], downloads: ['downloads', 'Download settings'], friends: ['social', 'Friends and chat settings'], apps: ['interface', 'Interface settings'], tv: ['interface', 'Interface settings'], applib: ['interface', 'Interface settings'], store: ['library', 'Store and library settings'], ccnotes: ['notifs', 'Notification settings'], ccsound: ['sound', 'Sound settings'], ccmic: ['sound', 'Sound settings'], ccmusic: ['sound', 'Sound settings'] };
  const row = (n) => `<div class="fx pill wide qset" data-k="qs-${n}" data-act="qset" data-arg="${QS[n][0]}">${icon('gear')}${QS[n][1]}</div>`;
  Object.keys(QS).forEach(n => {
    const V0 = VIEWS[n]; if (!V0) return;
    VIEWS[n] = (...a) => {
      const v = V0(...a), h0 = v.html; if (!h0 || v._qs) return v; v._qs = 1;
      v.html = function () { let o = h0.apply(this, arguments); if (typeof o !== 'string') return o; if (n === 'library' && o.includes('data-k="lsearch"')) return o.replace('<div class="fx pill" data-k="lsearch"', row(n).replace('wide ', '') + '<div class="fx pill" data-k="lsearch"'); return o + row(n); };
      v.acts = Object.assign({}, v.acts, { qset(pg) { V.open('set', pg); } }); return v;
    };
  });
}

/* ------------------------------------------------------------- chat helpers + Discord in betterSBP's own UI */
const dayL = t => { const d = new Date(t), n = new Date(), y = new Date(n - 864e5); return d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); };
const clk = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !S.pref.clock24 });
D.chatBubbles = l => { let last = '', o = ''; (l || []).slice(-80).forEach((m, i) => { const d = m.t ? dayL(m.t) : ''; if (d && d !== last) { o += `<div class="chday">${esc(d)}</div>`; last = d; } o += `<div class="fx bub ${m.me ? 'me' : ''}" data-k="b${i}" data-act="noop">${esc(m.text)}${m.t ? `<span class="btm">${clk(m.t)}</span>` : ''}</div>`; }); return o; };
const dav = (u, n, st) => `<div class="fav">${u ? `<img src="${esc(u)}" onerror="this.remove()">` : `<span>${esc((n || '?')[0].toUpperCase())}</span>`}${st !== undefined ? `<i class="${st && st !== 'offline' ? 'on' : ''}"></i>` : ''}</div>`;
const dcFail = (r, def) => (r && r.msg) || def;
const dcLine = c => c.group ? 'Group chat' : c.game ? 'Playing ' + c.game : ({ online: 'Online', idle: 'Idle', dnd: 'Do not disturb' }[c.st] || 'Offline');
const dcReload = t => { if (!t || (t.name !== 'ddms' && t.name !== 'dfriends')) return; const n = Date.now(); if (n - (t._rl || 0) < 4000) return; t._rl = n; t.load(); };
VIEWS.ddms = () => ({ title: 'Direct messages', icon: 'chat', body: 'col', cls: 'sidep', l: null, err: '',
  load() { Promise.resolve(api.dcDms()).then(r => { if (r && r.ok) this.l = r.v; else { this.err = dcFail(r, 'Could not load messages.'); this.l = []; } V.refresh(this); }); },
  html() { if (!this.l) return '<div class="snone">Loading…</div>'; return (this.err ? `<div class="note">${esc(this.err)}</div>` : '') + (this.l.length ? this.l.map((c, i) => `<div class="fx srow frow" data-k="dm${i}" data-act="open" data-arg="${i}">${dav(c.avatar, c.name, c.group ? undefined : c.st)}<div class="stx"><div class="t">${esc(c.name)}</div><div class="s ${c.game ? 'g' : ''}">${esc(dcLine(c))}</div></div></div>`).join('') : '<div class="snone">No conversations yet.</div>'); },
  acts: { open(i) { const c = this.l[+i]; V.open('dchat', { id: c.id, name: c.name, avatar: c.avatar }); } } });
VIEWS.dfriends = () => ({ title: 'Discord friends', icon: 'people', body: 'col', cls: 'sidep', l: null, err: '',
  load() { Promise.resolve(api.dcFriends()).then(r => { if (r && r.ok) this.l = r.v; else { this.err = dcFail(r, 'Could not load friends.'); this.l = []; } V.refresh(this); }); },
  html() { if (!this.l) return '<div class="snone">Loading…</div>'; const row = (c, i) => `<div class="fx srow frow" data-k="df${i}" data-act="open" data-arg="${i}">${dav(c.avatar, c.name, c.st)}<div class="stx"><div class="t">${esc(c.name)}</div><div class="s ${c.game ? 'g' : ''}">${esc(dcLine(c))}</div></div></div>`;
    const on = this.l.map((c, i) => [c, i]).filter(x => x[0].st !== 'offline'), off = this.l.map((c, i) => [c, i]).filter(x => x[0].st === 'offline');
    return (this.err ? `<div class="note">${esc(this.err)}</div>` : '') + (this.l.length ? (on.length ? head('Online — ' + on.length) + on.map(x => row(...x)).join('') : '') + (off.length ? head('Offline — ' + off.length) + off.map(x => row(...x)).join('') : '') : '<div class="snone">No friends found.</div>'); },
  acts: { open(i) { const c = this.l[+i]; Promise.resolve(api.dcOpenDm(c.id)).then(r => { if (r && r.ok) V.open('dchat', { id: r.v, name: c.name, avatar: c.avatar }); else D.toast(dcFail(r, 'Could not open the chat.')); }); } } });
VIEWS.dguild = g => ({ title: g.name, icon: 'people', body: 'col', cls: 'sidep', l: null, err: '',
  load() { Promise.resolve(api.dcChannels(g.id)).then(r => { if (r && r.ok) this.l = r.v; else { this.err = dcFail(r, 'Could not load channels.'); this.l = []; } V.refresh(this); }); },
  html() { if (!this.l) return '<div class="snone">Loading…</div>'; let o = this.err ? `<div class="note">${esc(this.err)}</div>` : '', cat = null; this.l.forEach((c, i) => { if (c.cat !== cat) { cat = c.cat; o += head(cat || 'Channels'); } o += `<div class="fx srow frow" data-k="ch${i}" data-act="open" data-arg="${i}"><div class="fav"><span>${c.voice ? '🔊' : '#'}</span></div><div class="stx"><div class="t">${esc(c.name)}</div><div class="s">${c.voice ? 'Voice channel · press to join' : 'Text channel'}</div></div></div>`; }); return o || '<div class="snone">No channels you can see.</div>'; },
  acts: { open(i) { const c = this.l[+i]; if (!c.voice) return V.open('dchat', { id: c.id, name: '#' + c.name, avatar: g.icon }); V.dlg({ title: 'Join ' + c.name + '?', msg: 'You join the voice channel and can talk with your headset.', buttons: [{ label: 'Join', run: () => { D.toast('Joining…'); Promise.resolve(api.dcVJoin(g.id, c.id, c.name + ' · ' + g.name)).then(r => { if (r && r.ok) { S.dc = { ...(S.dc || {}), voice: r.v }; V.open('dvoice'); } else D.toast(dcFail(r, 'Could not join.')); }); } }, { label: 'Cancel' }] }); } } });
VIEWS.dchat = c => ({ title: c.name, icon: 'chat', body: 'col', l: null, err: '', stick: true, fk: 'dc-w',
  load() { const go = () => Promise.resolve(api.dcMsgs(c.id)).then(r => { if (r && r.ok) { const n = (this.l || []).length, last = this.l && this.l.length ? this.l[this.l.length - 1].id : '', first = this.l == null; this.l = r.v; this.err = ''; if (first || r.v.length !== n || (r.v.length && r.v[r.v.length - 1].id !== last)) { if (first || this.fk === 'dc-w') this.stick = true; V.refresh(this); } } else { this.err = dcFail(r, 'Messages could not be loaded.'); if (!this.l) this.l = []; V.refresh(this); } }).catch(() => {}); go(); this.iv = setInterval(go, 5000); },
  leave() { clearInterval(this.iv); },
  after() { if (this.stick) { this.stick = false; const sc = document.querySelector('#view .vscroll'); if (sc) sc.scrollTop = sc.scrollHeight; } },
  html() {
    if (!this.l) return card('Loading…');
    let last = '', o = '';
    this.l.forEach((m, i) => { const d = dayL(m.t); if (d !== last) { o += `<div class="chday">${esc(d)}</div>`; last = d; } o += `<div class="fx dmsg ${m.me ? 'me' : ''}" data-k="m${i}" data-act="msg" data-arg="${i}">${dav(m.avatar, m.name)}<div class="dmb"><div class="dmn">${esc(m.name)}<i>${clk(m.t)}</i></div>${m.text ? `<div class="dmt">${esc(m.text)}</div>` : ''}${(m.img || []).map(u => `<img class="dmi" src="${esc(u)}">`).join('')}${(m.files || []).map(f => `<div class="dmt dim">📎 ${esc(f)}</div>`).join('')}</div></div>`; });
    return (this.err ? `<div class="note">${esc(this.err)}</div>` : '') + (this.l.length ? `<div class="dchat">${o}</div>` : '<div class="snone">No messages yet. Say hi!</div>') + `<div class="dcompw"><div class="fx dcomp" data-k="dc-w" data-act="write">${icon('edit')}<span>Message ${esc(c.name)}</span></div></div>`;
  },
  acts: { msg(i) { const m = this.l[+i]; D.openMenu([{ icon: 'edit', label: 'Reply', run: () => this.acts.write.call(this, '@' + m.name + ' ') }, { icon: 'doc', label: 'Copy text', run: () => { try { navigator.clipboard.writeText(m.text || ''); D.toast('Copied.'); } catch {} } }], { top: '30%', left: '40%', transformOrigin: 'top left' }, m.name, 'view'); },
    write(pre) { V.osk({ title: 'Message to ' + c.name, max: 500, value: typeof pre === 'string' ? pre : '' }).then(r => { if (r && r.trim()) { const t = r.trim(); Promise.resolve(api.dcSend(c.id, t)).then(x => { if (x && x.ok) { (this.l = this.l || []).push({ id: 'x' + Date.now(), me: true, name: 'You', avatar: '', text: t, t: Date.now(), img: [], files: [] }); this.stick = true; this.fk = 'dc-w'; } else D.toast(dcFail(x, 'Could not send the message.')); V.refresh(this); }); } }); } } });
VIEWS.dvoice = () => ({ title: 'Discord Voice Chat', icon: 'people', body: 'col', cls: 'sidep',
  html() { const v = (S.dc || {}).voice; if (!v) return '<div class="snone">You are not in a voice channel.</div>';
    return `<div class="dvh"><span class="dvl">${(D.logo && D.logo('discord')) || ''}</span><b>${esc(v.name)}</b></div><div class="note">Connected. Your headset microphone is live${v.muted ? ' (muted)' : ''}${v.deaf ? ' (deafened)' : ''}.</div>` +
      `<div class="dvb"><div class="fx rbtn" data-k="dv-m" data-act="mute">${icon(v.muted ? 'micoff' : 'mic')}<span>${v.muted ? 'Unmute' : 'Mute'}</span></div><div class="fx rbtn" data-k="dv-d" data-act="deaf">${icon(v.deaf ? 'volume0' : 'volume')}<span>${v.deaf ? 'Undeafen' : 'Deafen'}</span></div></div>` +
      `<div class="fx pill wide dvleave" data-k="dv-l" data-act="leave">Leave</div>`; },
  acts: { mute() { Promise.resolve(api.dcVAct('mute')).then(r => { if (r && r.ok) { S.dc = { ...(S.dc || {}), voice: r.v }; V.refresh(this); } }); }, deaf() { Promise.resolve(api.dcVAct('deaf')).then(r => { if (r && r.ok) { S.dc = { ...(S.dc || {}), voice: r.v }; V.refresh(this); } }); }, leave() { Promise.resolve(api.dcVLeave()).then(() => { S.dc = { ...(S.dc || {}), voice: null }; D.toast('Left the voice channel.'); V.back(); }); } } });

/* ------------------------------------------------------------- First-run setup wizard (also re-runnable from Settings) */
VIEWS.setup = () => ({ title: '', body: 'wide', cls: 'slv', tk: null, st: 0, fresh: true, dir: 1,
  STEPS: ['Welcome', 'Accounts', 'Network', 'Sound and look', 'Behavior', 'All set'],
  load() { const poll = () => { Promise.resolve(api.chatStatus()).then(c => { if (c) S.chat = c; }); Promise.resolve(api.discordStatus()).then(c => { if (c) S.dc = c; }); Promise.resolve(api.xboxStatus && api.xboxStatus()).then(c => { if (c) S.xb = c; }); Promise.resolve(api.net && api.net()).then(n => { this.net = n; V.refresh(this); }); }; poll(); this.tk = setInterval(poll, 2500); S.noAudio = true; D.stopOst && D.stopOst(); },
  leave() { clearInterval(this.tk); S.noAudio = false; setTimeout(() => D.playOst && D.playOst(D.cur()), 400); },
  onBack() { if (this.fin) return false; if (this.st > 0) { this.dir = -1; this.go(this.st - 1); return true; } return !S.pref.setupDone; },
  go(n) { this.st = n; this.fresh = true; this.fk = 'su-next'; V.refresh(this); },
  html() {
    const c = S.chat || {}, d = S.dc || {}, x = S.xb || {}, sOk = c.state === 'in', dOk = d.state === 'on', xOk = x.state === 'in', st = this.st, P = S.pref, last = st === this.STEPS.length - 1;
    const card = (k, act, logo, name, sub, ok, btn) => `<div class="fx scard ${ok ? 'ok' : ''}" data-k="${k}" data-act="${act}"><div class="scl">${logo}</div><div class="scn">${name}</div><div class="scs">${sub}</div><div class="scb">${ok ? icon('check') + 'Done' : btn}</div></div>`;
    const dots = this.STEPS.map((_, i) => `<i class="${i === st ? 'on' : i < st ? 'ok' : ''}"></i>`).join('');
    let body = '';
    if (st === 0) body = `<div class="sinfo big">Welcome to betterSBP</div><div class="sinfo">Pick how you want it to look. You can change everything later in Settings.</div>
      <div class="scards">${card('su-simple', 'mode', icon('sparkle'), 'Simple', 'Only the essentials: games, friends, downloads and settings', !!P.simple, 'Choose')}${card('su-full', 'modeFull', icon('grid'), 'Full', 'Every page, gallery, community and all settings', !P.simple, 'Choose')}</div>`;
    else if (st === 1) body = `<div class="sinfo big">Sign in</div><div class="sinfo">One Steam login covers your library, friends, chat and game downloads. Everything is optional.</div>
      <div class="scards three">${card('su-steam', 'steam', (D.logo && D.logo('steam')) || icon('steam'), 'Steam', sOk ? esc(c.name || 'Signed in') : c.state === 'connecting' ? 'Signing in…' : 'Library, friends, chat, downloads', sOk, 'Sign in')}
      ${card('su-xbox', 'xbox', (D.logo && D.logo('xbox')) || icon('pspad'), 'Xbox', xOk ? esc(x.gamertag || x.name || 'Signed in') : 'Friends, chat and Cloud Gaming', xOk, 'Sign in')}
      ${card('su-dc', 'discord', (D.logo && D.logo('discord')) || icon('people'), 'Discord', dOk ? esc((d.me || {}).name || 'Connected') : 'Servers, friends, DMs and voice', dOk, 'Connect')}</div>
      <div class="srows">${K.rowT('su-dl', 'download', 'Use my Steam login for downloads', 'dlSavePass', 'Downloads use the same login. Your password is kept encrypted on this PC.')}</div>`;
    else if (st === 2) { const n = this.net || {}, w = n.wifi; body = `<div class="sinfo big">Connect</div><div class="sinfo">Wi-Fi and Bluetooth are managed right here, not in Windows.</div><div class="srows">
      ${K.info('Internet', w ? 'Wi-Fi: ' + esc(w.ssid) : (n.ifaces && n.ifaces.length ? 'Connected (' + esc(n.ifaces[0].name) + ')' : 'Not connected'))}
      ${K.rowA('su-wifi', 'wifi', 'Wi-Fi networks', { act: 'wifi', sub: 'Pick a network and enter its password.' })}${K.rowA('su-bt', 'link', 'Bluetooth devices', { act: 'bt', sub: 'Pair controllers, headphones and keyboards.' })}</div>`; }
    else if (st === 3) body = `<div class="sinfo big">Sound and look</div><div class="srows">${K.rowT('su-sfx', 'bell', 'Sounds', 'sfx', 'Menu click and navigation sounds.')}${K.rowT('su-mus', 'music', 'Game music', 'music', 'Plays the soundtrack of the game you highlight.')}${K.rowT('su-24', 'clock', '24-hour clock', 'clock24')}${K.rowT('su-bat', 'bolt', 'Show battery', 'showBattery', 'Laptops only.')}${K.rowT('su-mo', 'layers', 'Animations', 'motion')}${K.rowT('su-lt', 'screen', 'Large text', 'largeText')}</div>`;
    else if (st === 4) body = `<div class="sinfo big">How it behaves</div><div class="srows">${K.rowT('su-sw', 'power', 'Start with Windows', 'startup', 'Opens betterSBP when you sign in to your PC.')}${K.rowT('su-fs', 'screen', 'Full screen', 'fullscreen')}${K.rowT('su-bs', 'face', 'Start screen', 'bootScreen', 'Shows the “Select your profile” screen at start.')}${K.rowT('su-pp', 'bell', 'Friend and message pop-ups', 'popups')}${K.rowT('su-tr', 'video', 'Background trailers', 'trailers')}${K.rowC('su-pl', 'pad', 'Button symbols', 'padLayout', ['auto', 'xbox', 'ps'], v => ({ auto: 'Detect my controller', xbox: 'Xbox (A B X Y)', ps: 'PlayStation (✕ ○ □ △)' }[v]))}</div>`;
    else body = `<div class="sinfo big">You're all set</div><div class="sinfo">${sOk || xOk || dOk ? 'Your accounts are connected.' : 'You can sign in later from Friends or Settings.'} Run this setup again any time from Settings.</div><div class="sdone">${icon('check')}</div>`;
    return `<div class="sdlg setup"><div class="sbrand"><span class="slogo">${icon('home')}</span><span>betterSBP</span></div><div class="sdots">${dots}</div>
      <div class="sstep ${this.fresh ? 'in' : ''}">${body}</div>
      <div class="sfoot">${st > 0 ? `<div class="fx sbtn slim ghost" data-k="su-back" data-act="prev">Back</div>` : `<div class="fx sbtn slim ghost" data-k="su-skip" data-act="done">Skip setup</div>`}<div class="sp"></div><div class="fx sbtn slim" data-k="su-next" data-act="${last ? 'done' : 'next'}">${last ? 'Start' : 'Next'}</div></div></div>`;
  },
  after() { if (this.fresh) { this.fresh = false; } },
  acts: {
    next() { this.go(this.st + 1); }, prev() { this.go(this.st - 1); },
    mode() { D.setPref('simple', true); V.refresh(this); }, modeFull() { D.setPref('simple', false); V.refresh(this); },
    steam() { if ((S.chat || {}).state === 'in') return D.toast('Already signed in.'); V.open('steamlogin'); },
    xbox() { if ((S.xb || {}).state === 'in') return D.toast('Already signed in.'); api.xboxWebConnect(); },
    discord() { if ((S.dc || {}).state === 'on') return D.toast('Already connected.'); api.discordConnect(); },
    wifi() { V.openSettingsPage('network'); }, bt() { V.openSettingsPage('bluetooth'); },
    done() { if ((S.chat || {}).state !== 'in') D.setPref('skipLogin', true); if ((S.dc || {}).state !== 'on') D.setPref('skipDiscord', true); D.setPref('setupDone', true); S.noAudio = false; this.fin = true; V.back(); },
  } });

// live updates
api.onChatState && api.onChatState(c => {
  const was = S.chat.state; S.chat = c;
  if (c.state === 'in') { const nm = c.name && c.name !== S.user.steamName ? c.name : null; Object.assign(S.user, { steamid: c.me || S.user.steamid, avatar: c.avatar || S.user.avatar }); if (c.persona) S.user.name = c.persona; if (D.renderTop && (c.avatar || nm)) D.renderTop(); }
  const t = K.top(); if (t && (t.name === 'steamlogin' || t.name === 'chat' || t.name === 'friends')) { if (t.name === 'friends') t.load && t.load(); else V.refresh(t); }
  if (t && t.name === 'library' && c.state !== was && (c.state === 'in' || c.state === 'out')) { S.lib = null; t.load && t.load(); }
  if (c.state === 'guard' && was !== 'guard') D.toast('Steam Guard code needed.');
  if (c.state === 'in' && was !== 'in') { D.toast('Signed in to Steam.'); if (t && t.name === 'steamlogin') setTimeout(() => { const x = K.top(); if (x && x.name === 'steamlogin') V.back(); }, 900); api.storeRecs && api.storeRecs().then(r => { S.recs = r; }); S.friends = null; api.friends && api.friends().then(f => { S.friends = f && f.friends || []; }); S.dlLogin = c.name; (S.dl || []).filter(x => x.state === 'login').forEach(x => api.dlResume(x.id)); }
  if (c.state === 'out' && c.lastErr) D.toast(c.lastErr);
});
api.onChatMsg && api.onChatMsg(m => {
  (S.msgs[m.id] = S.msgs[m.id] || []).push(m);
  const t = K.top();
  if (t && t.name === 'chat' && t.id === m.id) { V.refresh(t); api.chatHistory(m.id); }
});


/* ------------------------------------------------------------- In-app file manager (controller friendly) */
const fsz = b => !b ? '' : b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(0) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
VIEWS.filepick = o => (o.res = o.res || (() => {}), { title: o.title || 'Choose a file', icon: 'folder', body: 'col', dir: '', data: null, hist: [], res: o.res, done: false, showAll: false,
  load() { this.go(''); },
  go(d) { this.data = null; V.refresh(this); Promise.resolve(api.fsList(d)).then(r => { this.data = r || { ok: false, msg: 'Could not read this folder.', items: [] }; this.dir = this.data.dir || ''; V.refresh(this); const s = D.$('#view .vscroll'); if (s) s.scrollTop = 0; }); },
  onBack() { if (this.dir) { const p = this.data && this.data.parent; this.go(p == null ? '' : p); return true; } if (!this.done) { this.done = true; o.res(null); } return false; },
  leave() { if (!this.done) { this.done = true; o.res(null); } },
  html() {
    const r = this.data; if (!r) return '<div class="snone">Reading…</div>';
    const ok = f => !o.exts || o.exts.includes((f.name.split('.').pop() || '').toLowerCase()), items = (r.items || []).filter(f => f.dir || this.showAll || ok(f));
    let h = `<div class="fpath">${icon('folder')}<span>${esc(this.dir || 'This PC')}</span></div>`;
    if (r.msg) h += `<div class="note">${esc(r.msg)}</div>`;
    if (this.dir) h += `<div class="fx srow" data-k="fp-up" data-act="up"><div class="stx"><div class="t">&larr; Up one folder</div></div></div>`;
    if (o.folder && this.dir) h += rowA('fp-use', 'check', 'Use this folder', { act: 'usedir', sub: this.dir });
    h += items.map((f, i) => `<div class="fx srow fprow" data-k="fp${i}" data-act="${f.dir ? 'open' : 'pick'}" data-arg="${i}"><div class="fpi ${f.dir ? 'd' : ''}">${icon(f.dir ? (f.kind === 'drive' ? 'disk' : 'folder') : 'doc')}</div><div class="stx"><div class="t">${esc(f.name)}</div><div class="s">${f.kind === 'drive' ? fsz(f.free) + ' free of ' + fsz(f.total) : f.dir ? '' : fsz(f.size)}</div></div></div>`).join('') || (this.dir ? '<div class="snone">Nothing to show here</div>' : '');
    this.list = items;
    if (!o.folder && o.exts) h += rowA('fp-all', 'filter', this.showAll ? 'Showing all files' : 'Showing ' + o.exts.join(', ') + ' files only', { act: 'all', sub: 'Press to switch' });
    return h;
  },
  acts: {
    up() { const p = this.data && this.data.parent; this.go(p == null ? '' : p); },
    open(i) { this.go(this.list[+i].path); },
    pick(i) { const f = this.list[+i]; this.done = true; o.res(f.path); V.back(); },
    usedir() { this.done = true; o.res(this.dir); V.back(); },
    all() { this.showAll = !this.showAll; V.refresh(this); },
  } });
// ask for a file: uses the in-app file manager unless the person turned it off (then undefined -> Windows' own dialog)
V.filePick = o => new Promise(res => V.open('filepick', { ...o, res }));
D.pick = o => S.pref.fileManager === false ? Promise.resolve(undefined) : V.filePick(o);


/* ------------------------------------------------------------- Customization (start-up movie etc.) */
V.PAGES.custom = () => ({ title: 'Customization', body: 'col',
  mv() { return S.pref.startMovie || { mode: 'default' }; },
  html() {
    const m = this.mv(), nm = p => (p || '').split(/[\\/]/).filter(Boolean).pop() || '';
    return head('Start-up movie') + card('A video that plays full screen when betterSBP starts, like the PlayStation launch movie. Press any button to skip it.') +
      rowA('c-mode', 'video', 'Play at start-up', { act: 'mode', right: { default: 'betterSBP intro', off: 'Nothing', file: 'One movie', folder: 'Random from a folder' }[m.mode] || 'betterSBP intro', sub: 'Press to change.' }) +
      (m.mode === 'file' ? rowA('c-file', 'folder', 'Choose a movie', { act: 'pickfile', right: nm(m.path) || 'Not set', sub: 'mp4, webm, mov, m4v, mkv' }) : '') +
      (m.mode === 'folder' ? rowA('c-dir', 'folder', 'Choose a folder', { act: 'pickdir', right: nm(m.path) || 'Not set', sub: 'A different movie from this folder each time.' }) : '') +
      (m.mode !== 'off' ? rowA('c-test', 'play', 'Preview now', { act: 'test' }) + rowS('c-vol', 'volume', 'Movie volume', 'startMovieVol', 0, 1, .1, v => Math.round(v * 100) + '%') : '') +
      head('Start screen') + rowT('c-boot', 'face', 'Show “Select your profile” at start', 'bootScreen', 'Only appears when you are signed in to Steam in the app.') +
      rowT('c-music', 'music', 'Game music', 'music', 'The soundtrack of the highlighted game.') + rowT('c-tr', 'video', 'Game trailers on the home screen', 'trailers', 'Play the trailer after you rest on a game.');
  },
  acts: {
    mode() { const m = this.mv(), o = ['default', 'file', 'folder', 'off'], n = o[(o.indexOf(m.mode) + 1) % 4]; D.setPref('startMovie', { mode: n, path: n === m.mode ? m.path : (n === 'off' ? m.path : '') }); V.refresh(this); },
    pickfile() { D.pick({ title: 'Choose a start-up movie', exts: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv'] }).then(p => { if (p) { D.setPref('startMovie', { mode: 'file', path: p }); V.refresh(this); } else if (p === undefined) D.toast('Turn on “Use betterSBP file manager” under Controller settings to browse here.'); }); },
    pickdir() { D.pick({ title: 'Choose a movie folder', folder: true }).then(p => { if (p) { D.setPref('startMovie', { mode: 'folder', path: p }); V.refresh(this); } }); },
    test() { api.cfgSet && api.cfgSet({ prefs: S.pref }); setTimeout(() => D.playStartMovie(true).then(ok => { if (!ok) D.toast('Choose a movie first.'); }), 450); },
  } });

/* ------------------------------------------------------------- Controller and Steam Input */
V.PAGES.controller = () => ({ title: 'Controller and Steam Input', body: 'col',
  html() {
    const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean);
    return head('Connected controllers') + (pads.length ? pads.map(p => info(p.id.replace(/\s*\(.*$/, '').slice(0, 46) || 'Controller', 'Connected')).join('') : info('No controller detected', 'Press a button on your controller')) +
      head('Button layout') + rowC('k-lay', 'pad', 'Button symbols', 'padLayout', ['auto', 'xbox', 'ps'], x => ({ auto: 'Detect my controller', xbox: 'Xbox (A B X Y)', ps: 'PlayStation (✕ ○ □ △)' }[x])) +
      rowT('k-swap', 'pad', 'Swap confirm and back buttons', 'swapAB', 'Confirm with the right face button, like Japanese consoles.') +
      head('Feel') + rowC('k-dz', 'pad', 'Stick sensitivity', 'deadzone', [.75, .6, .45, .3], x => ({ .75: 'Low', .6: 'Normal', .45: 'High', .3: 'Very high' }[x]), 'How far you push the stick before the menu moves.') +
      rowC('k-nav', 'pad', 'Menu repeat speed', 'navSpeed', ['slow', 'normal', 'fast'], x => x[0].toUpperCase() + x.slice(1), 'How fast the menu moves while you hold a direction.') +
      rowT('k-hap', 'pad', 'Vibration in menus', 'haptics') + rowA('k-vib', 'pad', 'Test vibration', { act: 'vib' }) +
      head('Steam Input') + card('Steam Input is what applies each game’s controller layout (remapping, gyro, touch menus). It only works when a game is started through Steam, so betterSBP starts the game through Steam in the background and never shows Steam’s window. Choose below which games use it.') +
      rowC('k-mode', 'play', 'Start games', 'launchMode', ['direct', 'steam'], x => x === 'steam' ? 'Through Steam (Steam Input on for all)' : 'Directly (Steam Input per game)', 'You can override this for single games from their options menu → Controller settings.') +
      head('Files') + rowT('k-fm', 'folder', 'Use betterSBP file manager', 'fileManager', 'Browse files with a controller-friendly screen instead of the Windows dialog.');
  },
  acts: { vib() { const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean), a = p && p.vibrationActuator; if (a) a.playEffect('dual-rumble', { duration: 400, strongMagnitude: .8, weakMagnitude: .6 }); else D.toast('No vibration support on this controller.'); } } });

/* per game: Steam Input on/off (inside betterSBP; no Steam window) */
VIEWS.ginput = a => ({ title: (a.name || 'Game') + ' · Controller', icon: 'pad', body: 'col',
  html() {
    const on = (S.pref.viaSteam || []).includes(String(a.id)) || S.pref.launchMode === 'steam';
    return card('Steam Input applies the controller layout you set up for this game (remaps, gyro, radial menus). It needs the game to start through Steam, which betterSBP does silently in the background.') +
      rowA('gi-on', on ? 'check' : 'x', 'Steam Input is ' + (on ? 'on' : 'off') + ' for this game', { act: 'tog', sub: 'Press to switch' }) +
      info('How it starts', on ? 'Through Steam (no Steam window)' : 'Directly by betterSBP') +
      head('Controller') + rowC('gi-lay', 'pad', 'Button symbols', 'padLayout', ['auto', 'xbox', 'ps'], x => ({ auto: 'Detect', xbox: 'Xbox', ps: 'PlayStation' }[x])) + rowA('gi-test', 'pad', 'Test controller buttons', { act: 'test' });
  },
  acts: {
    tog() { const id = String(a.id), l = (S.pref.viaSteam || []).slice(), i = l.indexOf(id); if (S.pref.launchMode === 'steam') { D.toast('Every game starts through Steam. Change it in Settings → Controller.'); return; } i < 0 ? l.push(id) : l.splice(i, 1); D.setPref('viaSteam', l); V.refresh(this); },
    test() { V.open('set', 'accessories'); },
  } });

/* ------------------------------------------------------------- Power and Performance */
V.PAGES.power = () => ({ title: 'Power and Performance', body: 'col',
  html() {
    return head('While a game runs') + rowT('p-lp', 'bolt', 'Save resources while playing', 'lowPower', 'Pauses music, trailers and background work in betterSBP.') + rowT('p-lean', 'cube', 'Start Steam lean', 'leanSteam', 'Starts Steam without its web browser when a game needs it.') +
      head('Look') + rowT('p-lite', 'screen', 'Lighter visuals', 'lite', 'Turns off blur effects. Better on weaker PCs.') + rowT('p-mo', 'layers', 'Animations', 'motion') +
      head('Battery') + rowT('p-bat', 'bolt', 'Show battery', 'showBattery', 'Charge level on the home screen and in the quick menu.') +
      head('Start-up') + rowT('p-st', 'power', 'Open betterSBP when Windows starts', 'startup') + rowT('p-fs', 'screen', 'Full screen', 'fullscreen');
  } });
})();
