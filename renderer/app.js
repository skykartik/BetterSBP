(() => {
'use strict';
const api = window.dash || window.__demoApi;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (t, c, html) => { const e = document.createElement(t); if (c) e.className = c; if (html != null) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EASE = 'cubic-bezier(.22,.9,.24,1)';
const SMALL = 7, GAP = .9;

const DEF = { vol: .55, muted: false, music: true, sfx: true, trailers: true, trailerSound: true, trailerDelay: 3, motion: true, largeText: false, contrast: false,
  dlSavePass: true, simple: true, advanced: false, setupDone: false, ytAds: true, ytSponsor: true, ytShorts: true, ytLook: 'tv', padLayout: 'auto', showBattery: true, fileManager: true, swapAB: false, deadzone: .6, navSpeed: 'normal', startMovieVol: 1, clock24: true, showClock: true, startTab: 0, homeSort: 'recent', importShortcuts: true, familyShare: true, popOnline: true, popGame: true, popMsg: true, showOffline: true, myState: 1, popups: true, launchMode: 'direct', viaSteam: [], musicVol: 1, vidVol: .5, dnd: false, micMute: false, outDev: 'default', micDev: 'default', lite: true, bootScreen: true, fav: [], colls: {}, launchOpts: {}, leanSteam: true, haptics: true, scale: 100, fullscreen: true, toasts: true, startup: false, remind: 0, pin: '', hidden: [], noMusic: [], galSteam: true, galWin: true, lowPower: true, guideDash: true, wish: [], appsUsed: [], dlLib: '' };
const S = {
  tab: 0, zone: 'row', idx: [2, 0], heroI: 0, topI: 0, stripI: 0, mode: 'home',
  cc: 0, ccFrom: 'home', sr: 0, query: '', pref: { ...DEF }, notes: [], lastInput: 'kb', hasKey: false, lib: null,
  user: { name: 'Player', avatar: null }, games: [], data: {}, news: [], items: [[], []],
  menu: null, online: true, noOst: {},
  strip: { key: '', cards: [] }, hub: {}, store: null, caps: null, dl: [], sleep: false, vids: null,
};
let saveT = null;
const savePrefs = () => { clearTimeout(saveT); saveT = setTimeout(() => api.cfgSet && api.cfgSet({ prefs: S.pref }), 400); };
for (const k of ['vol', 'muted', 'music', 'trailers']) Object.defineProperty(S, k, { get: () => S.pref[k], set: v => { S.pref[k] = v; savePrefs(); } });
function applyPrefs() {
  const r = document.documentElement.style, b = document.body.classList;
  r.setProperty('--ui', String((S.pref.scale / 100) * (S.pref.largeText ? 1.15 : 1)));
  b.toggle('lite', S.pref.lite !== false); b.toggle('nomotion', !S.pref.motion); b.toggle('hc', !!S.pref.contrast);
}
function setPref(k, v) {
  S.pref[k] = v; savePrefs(); applyPrefs();
  if (k === 'vol' || k === 'muted') applyVol();
  if (k === 'fullscreen' || k === 'startup') api.setWindow && api.setWindow({ [k]: v });
  if (k === 'padLayout') paintGlyphs();
  if (k === 'showBattery') paintBat();
  if (/^yt(Ads|Sponsor|Shorts|Look)$/.test(k)) api.cfgSet && api.cfgSet({ dropWarm: 'youtube' });
  if (k === 'music') v ? playOst(cur()) : stopOst();
  if (k === 'simple') { renderTop(); updateTop && updateTop(); }
  if (k === 'homeSort' || k === 'showClock' || k === 'clock24') { buildItems(); if (S.mode === 'home' || S.mode === 'view') { try { renderRow(false); } catch {} } tick(); }
  if (k === 'myState') api.chatPersona && api.chatPersona(v);
  if (k === 'importShortcuts' || k === 'familyShare') api.cfgSet && api.cfgSet({ [k]: v });
  if (k === 'trailers' && !v) stopTrailer();
  if (k === 'largeText' || k === 'scale') bgKey = '';
}

/* ------------------------------------------------------------------ content */
const SPECIAL = {
  store: { kind: 'special', id: 'store', name: 'Store', icon: 'bag', grad: ['#2d62e8', '#0b1c55'], desc: 'Browse new releases, top sellers and special offers.', view: 'store' },
  explore: { kind: 'special', id: 'explore', name: 'Explore', icon: 'compass', grad: ['#3a4670', '#12162a'], desc: 'The latest news and updates from your games.' },
  library: { kind: 'special', id: 'library', name: 'Game Library', icon: 'pslib', grad: ['#3b4a6b', '#141a2a'], desc: 'Your complete Steam library, installed or not.', view: 'library' },
  friends: { kind: 'special', id: 'friends', name: 'Friends', icon: 'people', grad: ['#2c6b7a', '#0c2230'], desc: 'See who is online and what they are playing.', view: 'friends' },
  downloads: { kind: 'special', id: 'downloads', name: 'Downloads', icon: 'download', grad: ['#1f9d7a', '#08302a'], desc: 'Download and update games right here, without opening Steam.', view: 'downloads' },
  gallery: { kind: 'special', id: 'gallery', name: 'Gallery', icon: 'psgallery', grad: ['#4a3d6e', '#171229'], desc: 'Screenshots from your games and captures from betterSBP.', view: 'gallery' },
  community: { kind: 'special', id: 'community', name: 'Community', icon: 'globe', grad: ['#2a5a8a', '#0a1c2e'], desc: 'Steam Community: discussions, guides, workshop and screenshots, right inside betterSBP.', web: 'https://steamcommunity.com/' },
  pads: { kind: 'special', id: 'pads', name: 'Controllers', icon: 'pspad', grad: ['#3a4a5e', '#10161f'], desc: 'See connected controllers and test buttons and vibration.', view: 'set:accessories' },
};
const APPS = [
  { kind: 'app', id: 'youtube', name: 'YouTube', icon: 'ytplay', grad: ['#ff3a3a', '#3d0707'], tag: 'Video', embed: 'youtube', cover: 'assets/youtube.png', wide: 'assets/youtube-wide.jpg', desc: 'Watch videos, music and live streams on the big screen. Sign in with the TV code on your phone.' , logo: 'youtube', dev: 'Google LLC', cat: 'Video & Music', age: 'Everyone', size: 'Streams online', feats: ['4K video', 'Live streams', 'Music', 'Sign in with your account'] },
  { kind: 'app', id: 'xcloud', name: 'Xbox Cloud Gaming', icon: 'pspad', grad: ['#1c8a1c', '#06240a'], tag: 'Games', embed: 'xcloud', cover: 'assets/xcloud.png', wide: 'assets/xcloud-wide.png', desc: 'Stream Xbox games from the cloud with your controller. Needs a Game Pass Ultimate subscription and a Microsoft sign-in. Guide button returns here.', dev: 'Microsoft', cat: 'Games', age: 'Teen', size: 'Streams online', feats: ['Game Pass Ultimate', 'Controller support', 'Play on any PC'] },
];
const SECTIONS = [
  { kind: 'section', id: 'sec-tv', name: 'TV & Video', icon: 'film', grad: ['#7a3bea', '#150a38'], desc: 'Game trailers, your videos and YouTube.', view: 'tv' },
  { kind: 'section', id: 'sec-media', name: 'Media Gallery', icon: 'psgallery', grad: ['#16a2c4', '#06303b'], desc: 'Screenshots, captures and videos from your games.', view: 'gallery' },
];
var D_applySink = () => {};
let CC = [['home', 'Home'], ['layers', 'Switcher'], ['bell', 'Notifications'], ['news', 'Official news'], ['people', 'Friends'], ['music', 'Music'],
  ['volume', 'Sound'], ['mic', 'Microphone'], ['pad', 'Accessories'], ['face', 'Profile'], ['power', 'Power']];

const hide = id => S.data[id] && S.data[id].hidden;
// non-Steam games: shown on the home row only when switched on (shortcuts imported from Steam start off, games you add yourself start on)
const onHome = id => { const v = (S.pref.nsHome || {})[id]; return v === undefined ? !String(id).startsWith('sc') : !!v; };
function buildItems() {
  let gl = S.games.filter(x => !S.pref.hidden.includes(x.id) && (x.nonSteam ? onHome(x.id) : !hide(x.id)));
  if (S.pref.homeSort === 'az') gl = gl.slice().sort((a, b) => a.name.localeCompare(b.name));
  const g = gl.map(x => ({ kind: 'game', id: x.id, name: x.name, raw: x }));
  S.items[0] = [SPECIAL.store, SPECIAL.explore, ...g, SPECIAL.library];
  S.items[1] = [APPS[0], APPS[1], ...SECTIONS];
}
const cur = () => S.items[S.tab][S.idx[S.tab]];
const when = ts => { const d = Math.floor((Date.now() - ts) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d + ' days ago'; };
const hue = s => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const gbytes = n => n ? (n / 1073741824).toFixed(1) + ' GB' : '';

/* --------------------------------------------------------------------- audio */
const AC = new (window.AudioContext || window.webkitAudioContext)();
D_applySink = id => { try { AC.setSinkId && AC.setSinkId(id === 'default' ? '' : id); } catch {} try { aud.forEach(a => a.setSinkId && a.setSinkId(id === 'default' ? '' : id)); } catch {} };
function haptic(ms = 25, w = .25) {
  if (!S.pref.haptics) return;
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean), a = gp && gp.vibrationActuator;
  if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: 0, weakMagnitude: w }).catch(() => {});
}
// Two sound themes made with WebAudio (no files): "ps" = soft glassy bells like the PS5 shell, "steam" = crisp clicks like Big Picture.
let _rev = null;
function reverb() {
  if (_rev) return _rev;
  const d = AC.createDelay(.5), f = AC.createGain(), lp = AC.createBiquadFilter(), out = AC.createGain();
  d.delayTime.value = .09; f.gain.value = .32; lp.type = 'lowpass'; lp.frequency.value = 2600; out.gain.value = .5;
  d.connect(lp).connect(f).connect(d); lp.connect(out).connect(AC.destination);
  return (_rev = d);
}
function tone(t, f0, f1, dur, vol, o = {}) {
  const g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp || 5200;
  const parts = o.harm || [[1, 1]];
  for (const [m, a] of parts) {
    const os = AC.createOscillator(); os.type = o.type || 'sine';
    os.frequency.setValueAtTime(f0 * m, t); if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1 * m, t + dur);
    const pg = AC.createGain(); pg.gain.value = a; os.connect(pg).connect(g); os.start(t); os.stop(t + dur + .05);
  }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (window.__sfxScale || 1), t + (o.atk || .006)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  g.connect(lp); lp.connect(AC.destination); if (o.wet) { const s = AC.createGain(); s.gain.value = o.wet; lp.connect(s).connect(reverb()); }
}
const BELL = [[1, 1], [2.01, .35], [3.98, .12]];
// a "thock": a short sine/triangle blip with a quick pitch drop and a soft click on top, low-passed and completely dry
function thock(t, f0, f1, dur, vol) {
  const g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  const o1 = AC.createOscillator(); o1.type = 'sine'; o1.frequency.setValueAtTime(f0, t); o1.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const o2 = AC.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(Math.max(80, f1 * 2), t + dur * .6);
  const g2 = AC.createGain(); g2.gain.value = .22; o1.connect(g); o2.connect(g2).connect(g); o1.start(t); o2.start(t); o1.stop(t + dur + .05); o2.stop(t + dur + .05);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * .7 * (window.__sfxScale || 1), t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .03);
  g.connect(lp); lp.connect(AC.destination);
}
// a soft breath of filtered noise (open / launch swoosh)
function puff(t, dur, vol, f0, f1) {
  const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = buf; const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .8;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * .5 * (window.__sfxScale || 1), t + dur * .4); g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(bp).connect(g).connect(AC.destination); src.start(t);
}
const SND = {
  ps: {   // soft, dry, blocky "thocks" and dull taps instead of ringing bells
    move: t => { thock(t, 640, 430, .045, .5); },
    ok: t => { thock(t, 520, 300, .09, .75); thock(t + .045, 780, 520, .08, .45); },
    back: t => { thock(t, 430, 240, .1, .7); },
    open: t => { puff(t, .22, .22, 900, 2600); thock(t + .08, 420, 560, .1, .5); },
    notify: t => { thock(t, 660, 640, .14, .55); thock(t + .12, 990, 960, .2, .5); },
    err: t => { thock(t, 210, 150, .16, .75); thock(t + .1, 190, 130, .16, .6); },
    toggle: t => { thock(t, 560, 760, .06, .6); },
    launch: t => { puff(t, .55, .3, 500, 3200); thock(t + .15, 330, 520, .22, .55); thock(t + .32, 660, 880, .3, .5); },
  },
};
function sfx(type) {
  if (type === 'move' && S.lastInput === 'pad') haptic();
  if (S.muted || !S.pref.sfx) return;
  try {
    if (AC.state === 'suspended') AC.resume();
    const th = SND.ps, f = th[type] || th.ok, now = AC.currentTime;
    const master = Math.min(1, S.vol * 1.4);
    window.__sfxScale = master; f(now);
  } catch {}
}
const aud = [new Audio(), new Audio()];
aud.forEach(a => { a.loop = true; a.preload = 'auto'; a.volume = 0; });
let ac = 0, ostTok = 0;
const vol = () => (S.muted || !S.music ? 0 : S.vol * (S.pref.musicVol == null ? 1 : S.pref.musicVol));
function fade(a, to, ms, done) {
  cancelAnimationFrame(a._f);
  const from = a.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) a._f = requestAnimationFrame(step); else if (done) done();
  };
  step();
}
async function playOst(it) {
  const tok = ++ostTok;
  if (!it || it.kind !== 'game' || !S.music || S.pref.noMusic.includes(it.id) || S.mode === 'boot' || S.noAudio) { stopOst(); return; }
  await sleep(450);
  if (tok !== ostTok) return;
  let url = null;
  try { url = await api.ost(it.id, it.name); } catch {}
  if (tok !== ostTok) return;
  if (!url) { S.noOst[it.id] = true; return; }
  S.nowId = it.id;
  const old = aud[ac]; fade(old, 0, 700, () => { if (old.volume <= .01) old.pause(); });
  ac ^= 1; const a = aud[ac];
  if (a._src !== url) { a.src = url; a._src = url; }
  a.volume = 0;
  try { await a.play(); } catch { document.addEventListener('keydown', () => playOst(cur()), { once: true }); document.addEventListener('click', () => playOst(cur()), { once: true }); return; }
  if (tok === ostTok) fade(a, vol(), 2000);
}
function stopOst(hard) {
  ostTok++;
  if (hard) { aud.forEach(a => { cancelAnimationFrame(a._f); a.pause(); a.removeAttribute('src'); a._src = null; a.load(); }); return; }
  aud.forEach(a => fade(a, 0, 600, () => { if (a.volume <= .01) a.pause(); }));
}
function applyVol() { fade(aud[ac], vol(), 250); }

/* ---------------------------------------------------------------- background */
const load = src => new Promise(res => {
  const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => res(im); im.onerror = () => res(null); im.src = src; setTimeout(() => res(null), 5000);
});
function dominant(im) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = (mx - mn) / (mx || 1), lum = (R + G + B) / 765;
      const wt = .04 + sat * sat * 2.2 * (lum > .1 ? 1 : .15) * (lum < .93 ? 1 : .2);
      r += R * wt; g += G * wt; b += B * wt; w += wt;
    }
    r /= w; g /= w; b /= w;
    const k = Math.max(r, g, b) ? Math.min(1.7, 205 / Math.max(r, g, b)) : 1;
    return `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
  } catch { return null; }
}
let bgTok = 0, bgFlip = 0, bgKey = '';
const isStripItem = it => !!it && (it.id === 'explore' || it.kind === 'section' || it.kind === 'app');
async function setBG(it, dir = 0) {
  if (it && it.kind === 'app' && it.embed && api.warmApp) setTimeout(() => { const c = cur(); if (c && c.id === it.id) api.warmApp(it.embed); }, 700);
  const sc = isStripItem(it) ? S.strip.cards[S.stripI] : null;
  const gid = sc && sc.hero && sc.hero.gameId ? sc.hero.gameId : it.id;
  const d = S.data[gid], a = d && d.art;
  let heroSrc = a && a.hero, fillSrc = (a && (a.hero || a.header || a.cover)) || null, g = it.grad;
  if (sc) {
    if (sc.hero && sc.hero.bg) { fillSrc = sc.hero.bg; heroSrc = null; }
    else if (!(sc.hero && sc.hero.gameId)) { fillSrc = null; heroSrc = null; }
    if (sc.grad) g = sc.grad;
  }
  const key = gid + '|' + (fillSrc || '') + '|' + (sc ? sc.id : '') + '|' + (g ? g[0] : '');
  if (key === bgKey) return; bgKey = key;
  const tok = ++bgTok;
  let im = null;
  if (fillSrc) { im = await load(fillSrc); if (tok !== bgTok) return; }
  const layers = $$('.bglayer'); bgFlip ^= 1;
  const L = layers[bgFlip], O = layers[bgFlip ^ 1];
  g = g || ['#2f6bff', '#0b1230'];
  if (im) {
    L.innerHTML = `<img class="fill" src="${fillSrc}">` + (heroSrc ? `<img class="sharp" src="${heroSrc}">` : '');
    document.documentElement.style.setProperty('--accent', dominant(im) || g[0]);
  } else {
    const hh = it.kind === 'game' ? hue(it.name) : 0, c0 = (it.grad || sc) ? g[0] : `hsl(${hh},65%,45%)`, c1 = (it.grad || sc) ? g[1] : `hsl(${hh + 40},60%,12%)`;
    L.innerHTML = `<div class="grad" style="background:linear-gradient(145deg,${c0},${c1})"></div>
      <div class="blob" style="left:8%;top:10%;width:46%;height:60%;background:${c0}"></div>
      <div class="blob" style="right:2%;bottom:0;width:40%;height:50%;background:${c1 === g[1] ? c0 : c1};animation-delay:-7s"></div>`;
    document.documentElement.style.setProperty('--accent', c0);
  }
  L.classList.add('on'); O.classList.remove('on');
}

let trTok = 0, trTimer = null;
function stopTrailer() {
  clearTimeout(trTimer); const v = $('#trailer'), tok = ++trTok; v.classList.remove('on');
  setTimeout(() => { if (tok === trTok) { v.pause(); v.removeAttribute('src'); v.load(); } }, 1400);
}
function armTrailer(it) {
  stopTrailer(); const tok = trTok;
  if (!S.trailers || it.kind !== 'game') return;
  trTimer = setTimeout(() => {
    const d = S.data[it.id], url = d && d.details && d.details.trailer, v = $('#trailer');
    if (!url || tok !== trTok || S.mode !== 'home') return;
    v.src = url; v.muted = !S.noOst[it.id] || !S.pref.trailerSound || S.muted; v.volume = Math.min(1, S.vol * (S.pref.vidVol == null ? .5 : S.pref.vidVol));
    v.play().then(() => { if (tok === trTok) v.classList.add('on'); }).catch(() => {});
  }, S.pref.trailerDelay * 1000);
}

/* ------------------------------------------------------------------ top bar */
const SIMPLE_HIDE = [3, 4, 5];   // Gallery, Community, Controllers are hidden in Simple mode
function renderTop() {
  const t = $('#top');
  t.innerHTML = `<div class="tabs"><div class="tab" data-z="0">Games</div><div class="tab" data-z="1">Media</div></div>
    <div class="tr"><button class="ib" data-z="2">${icon('people')}<span class="tip">Friends</span></button>
    <button class="ib" data-z="3">${icon('psgallery')}<span class="tip">Gallery</span></button>
    <button class="ib" data-z="4">${icon('globe')}<span class="tip">Community</span></button>
    <button class="ib" data-z="5">${icon('pspad')}<span class="tip">Controllers</span></button>
    <button class="ib dlb" data-z="6">${icon('download')}<i class="ring"></i><span class="tip">Downloads</span></button>
    <button class="ib" data-z="7">${icon('search')}<span class="tip">Search</span></button>
    <button class="ib" data-z="8">${icon('gear')}<span class="tip">Settings</span></button>
    <div class="av" data-z="9"><div class="face">${S.user.avatar ? `<img src="${S.user.avatar}">` : icon('user')}</div><i class="dot"></i></div>
    <div class="bat"></div><div class="clock"></div></div>`;
  $$('.ib').forEach(e => { if (S.pref.simple && SIMPLE_HIDE.includes(+e.dataset.z)) e.style.display = 'none'; });
  tick(); paintBat();
}
/* battery: percentage + colour by charge; only shown on PCs that actually have a battery */
const BAT = { has: false, level: 1, charging: false };
function paintBat() {
  const on = BAT.has && S.pref.showBattery !== false, p = Math.round(BAT.level * 100), col = BAT.charging ? '#3dd6ff' : p > 50 ? '#3ddc84' : p > 20 ? '#ffc13d' : '#ff4d4d';
  document.querySelectorAll('.bat').forEach(e => {
    e.style.display = on ? '' : 'none'; if (!on) return;
    e.innerHTML = `<span class="bi" style="--bc:${col}"><i style="width:${Math.max(6, p)}%"></i></span>${BAT.charging ? icon('bolt') : ''}<b style="color:${col}">${p}%</b>`;
  });
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.bat')) { if (OV) return; D.V.open('set', 'power'); } });
async function initBat() {
  try { BAT.has = !!(await api.batteryHas()); } catch {}
  if (!BAT.has) { try { const b = await navigator.getBattery(); BAT.has = !(b.level === 1 && b.charging && b.chargingTime === 0 && b.dischargingTime === Infinity) || (await api.batteryInfo()) != null; } catch {} }
  if (!BAT.has) return paintBat();
  try { const b = await navigator.getBattery(); const up = () => { BAT.level = b.level; BAT.charging = b.charging; paintBat(); }; ['levelchange', 'chargingchange'].forEach(e => b.addEventListener(e, up)); up(); }
  catch { const poll = async () => { const r = await api.batteryInfo(); if (r) { BAT.level = r.level; BAT.charging = r.charging; paintBat(); } }; poll(); setInterval(poll, 60000); }
}
function tick() { const c = $('.clock'); if (c) { c.style.display = S.pref.showClock === false ? 'none' : ''; c.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: S.pref.clock24 === false }); } }
setInterval(tick, 10000);
function updateTop() {
  $$('.tab').forEach((e, i) => { e.classList.toggle('active', i === S.tab); e.classList.toggle('focus', S.zone === 'top' && S.topI === i); });
  $$('.ib,.av').forEach(e => e.classList.toggle('focus', S.zone === 'top' && S.topI === +e.dataset.z));
  const d = $('.av .dot'); if (d) d.classList.toggle('off', !S.online);
}

/* ---------------------------------------------------------------------- row */
const tileById = id => $(`#row [data-id="${CSS.escape(String(id))}"]`);
function renderRow(enter) {
  const row = $('#row'); row.innerHTML = ''; row.classList.remove('enter'); void row.offsetWidth; if (enter) row.classList.add('enter');
  S.items[S.tab].forEach((it, i) => {
    const t = h('div', 'tile k-' + it.kind); t.dataset.i = i; t.dataset.id = it.id; t.style.setProperty('--d', Math.min(i, 14) * 45 + 'ms');
    const art = h('div', 'art');
    if (it.kind === 'game') {
      const hh = hue(it.name);
      t.style.background = `linear-gradient(150deg,hsl(${hh},55%,32%),hsl(${hh + 40},60%,12%))`;
      art.innerHTML = `<div class="ph">${esc(it.name[0].toUpperCase())}</div>`;
    } else if (it.kind === 'section') {
      t.classList.add('k-sec'); art.innerHTML = `<div class="sico">${icon(it.icon)}</div>`;
    } else {
      t.style.background = `linear-gradient(150deg,${it.grad[0]}${it.id === 'store' ? '' : 'cc'},${it.grad[1]}${it.id === 'store' ? '' : 'cc'})`;
      t.style.setProperty('--g0', it.grad[0]); t.style.setProperty('--g1', it.grad[1]);
      if (it.cover) art.innerHTML = `<img class="acov ok" src="${it.cover}">`; else art.innerHTML = `<div class="sico${it.logo && window.LOGO_IMG[it.logo] ? ' lg' : ''}">${it.logo && window.LOGO_IMG[it.logo] ? logo(it.logo) : icon(it.icon)}</div>`;
    }
    t.append(art, h('div', 'label', esc(it.name))); row.append(t);
    if (it.kind === 'game') paintTile(it.id);
  });
  S.idx[S.tab] = Math.max(0, Math.min(S.idx[S.tab], S.items[S.tab].length - 1));
  applyFocus(); paintBadges();
}
function heroDl() {
  const it = cur(), b = $('#hero > .hl .btns .pri'); if (!it || !b || it.kind !== 'game') return;
  const d = S.dl.find(x => String(x.id) === String(it.id) && ['queued', 'starting', 'downloading', 'login'].includes(x.state));
  b.classList.toggle('dling', !!d);
  if (d) { const p = Math.round(d.progress || 0); b.innerHTML = `<i class="dlfill" style="width:${p}%"></i><span>${d.state === 'queued' ? 'Queued' : d.state === 'login' ? 'Sign in to download' : 'Downloading… ' + p + '%'}</span>`; }
  else if (b.classList.contains('dlwas')) { b.textContent = 'Play'; }
  b.classList.toggle('dlwas', !!d);
}
function paintBadges() {
  heroDl();
  const act = S.dl.filter(x => ['queued', 'starting', 'downloading', 'login'].includes(x.state)), btn = $('.dlb'); if (!btn) return;
  btn.classList.toggle('busy', !!act.length);
  const p = act.length ? act.reduce((s, x) => s + (x.progress || 0), 0) / act.length : 0; btn.style.setProperty('--p', p + '%');
  let b = $('.bdg', btn); if (!act.length) { if (b) b.remove(); return; } if (!b) { b = h('div', 'bdg'); btn.append(b); } b.textContent = act.length;
}
function paintTile(id) {
  const t = tileById(id), d = S.data[id], src = d && d.art && (d.art.cover || d.art.header);
  if (!t || !src) return;
  const art = $('.art', t); let img = $('img', art);
  if (!img) { img = h('img'); img.style.objectPosition = 'center 30%'; art.prepend(img); }
  img.onload = () => { img.classList.add('ok'); const ph = $('.ph', art); if (ph) ph.remove(); };
  img.src = src;
}
function applyFocus() {
  $$('#row .tile').forEach((t, i) => t.classList.toggle('focus', i === S.idx[S.tab]));
  $('#row').style.transform = `translateX(${-S.idx[S.tab] * (SMALL + GAP)}rem)`;
  applyZones();
}
function applyZones() {
  $$('#row .tile').forEach((t, i) => t.classList.toggle('ringed', i === S.idx[S.tab] && S.zone === 'row'));
  updateTop(); updateHeroFocus(); updateStrip();
}
function bump(dir) { $('#row').animate([{ translate: '0' }, { translate: dir * 1.4 + 'rem' }, { translate: '0' }], { duration: 380, easing: EASE }); }
function moveRow(d) {
  const n = S.items[S.tab].length, i = S.idx[S.tab] + d;
  if (i < 0 || i >= n) { bump(-d); return; }
  S.idx[S.tab] = i; sfx('move'); applyFocus(); onFocus(d);
}

/* ---------------------------------------------------------------------- hero */
const hasHero = it => !isStripItem(it);
function showHero(it, animate = true) {
  const hero = $('#hero'), d = S.data[it.id] || {}, det = d.details || {};
  let left = '', right = '', news = false;
  if (isStripItem(it)) {
    news = true; const sc = S.strip.cards[S.stripI], hh = sc && sc.hero;
    left = hh ? `<div class="meta">${esc(hh.meta || '')}</div><div class="newsTitle">${esc(hh.title)}</div><div class="desc nd">${esc(hh.desc || '')}</div>`
             : `<div class="titleText">${esc(it.name)}</div><div class="desc">${esc(it.desc)}</div>`;
  } else {
    const logo = d.art && d.art.logo;
    left = logo ? `<div class="logo"><img src="${logo}"></div>` : `<div class="titleText${it.name.length > 15 ? ' sm' : ''}">${esc(it.name)}</div>`;
    if (it.kind === 'game') {
      const m = [...(det.genres || []).slice(0, 3), ...(det.developers || []).slice(0, 1)];
      if (m.length) left += `<div class="meta">${m.map(esc).join(' <i></i> ')}</div>`;
    }
    left += `<div class="desc">${esc(it.kind === 'game' ? (det.desc || '') : it.desc)}</div>`;
    left += `<div class="btns"><div class="btn pri" data-b="0">${it.kind === 'game' ? 'Play' : 'Open'}</div><div class="btn rnd" data-b="1">···</div></div>`;
    if (it.kind === 'game') {
      const cover = d.art && (d.art.cover || d.art.header);
      right = `<div class="cardArt">${cover ? `<img src="${cover}">` : ''}<div class="sz">${gbytes(it.raw && it.raw.size)}</div><div class="bd">Installed</div></div>`;
      const tr = d.trophies, st = d.stats;
      if (S.data[it.id] && S.data[it.id].trophies === undefined && !S.data[it.id]._tq && api.trophies) {
        const dd = S.data[it.id]; dd._tq = 1;
        Promise.resolve(api.trophies(it.id)).then(t => { dd.trophies = t || null; const c = cur(); if (t && c && c.id === it.id && S.mode === 'home') showHero(c, false); }).catch(() => { dd.trophies = null; });
      }
      if (tr) right += `<div class="prog"><div class="pi">${icon('trophy')}</div><div class="pc"><small>Progress</small><b>${Math.round(tr.earned / tr.total * 100)}%</b></div><div class="pc r"><small>Earned</small><b>${tr.earned}/${tr.total}</b></div></div>`;
      else if (st && st.playtime) right += `<div class="prog"><div class="pi">${icon('clock')}</div><div class="pc"><small>Time played</small><b>${st.playtime >= 60 ? (st.playtime / 60).toFixed(1) + ' h' : st.playtime + ' min'}</b></div><div class="pc r"><small>Last played</small><b>${st.lastPlayed ? when(st.lastPlayed * 1000) : '—'}</b></div></div>`;
    }
  }
  hero.innerHTML = `<div class="hl${news ? ' news' : ''}">${left}</div>${right ? `<div class="hc">${right}</div>` : ''}`;   // swapped instantly: no slide / fade
  updateHeroFocus(); updateStrip();
}
function updateHeroFocus() { $$('.btn').forEach(b => b.classList.toggle('focus', S.zone === 'hero' && +b.dataset.b === S.heroI)); }

/* ---- strip: Explore news, game hub activities, Media apps ---- */
const CDN = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/';
const gart = (id, ...k) => { const a = S.data[id] && S.data[id].art; if (a) for (const x of k) if (a[x]) return a[x]; return null; };
const hdr = id => gart(id, 'header', 'hero', 'cover') || CDN + id + '/header.jpg';
const hrs = m => !m ? '0 min' : m >= 60 ? (m / 60).toFixed(m >= 600 ? 0 : 1) + ' h' : m + ' min';
const gnm = id => { const g = S.games.find(x => x.id === String(id)); return g ? g.name : 'this game'; };
const newsCard = n => ({ id: 'n' + n.gid, kind: 'news', icon: 'news', img: n.image || hdr(n.gameId), title: n.title, sub: n.gameName + ' · ' + when(n.date),
  hero: { meta: `Official news from ${n.gameName} · ${when(n.date)}`, title: n.title, desc: n.snippet, bg: n.image || gart(n.gameId, 'hero', 'header') || hdr(n.gameId), gameId: n.image ? undefined : n.gameId }, run: () => D.V.open('news', n) });
const appCard = a => ({ id: 'app-' + a.id, kind: 'app', icon: a.icon, logo: a.logo, img: a.wide, grad: a.grad, title: a.name, sub: a.tag, hero: { meta: a.tag + ' · ' + (a.dev || ''), title: a.name, desc: a.desc }, run: () => launchApp(a) });
const appInfoCards = a => [
  { id: 'ai-dev', kind: 'info', icon: 'info', grad: a.grad, title: 'About ' + a.name, sub: (a.dev || '') + ' · ' + (a.cat || a.tag), hero: { meta: 'About', title: a.name, desc: a.desc } },
  { id: 'ai-feat', kind: 'info', icon: 'sparkle', grad: ['#3a4670', '#12162a'], title: 'Features', sub: (a.feats || []).join(' · '), hero: { meta: 'Features', title: a.name, desc: (a.feats || []).join(' · ') + '. Age rating: ' + (a.age || 'Everyone') + '.' } },
];
const storeCard = (i, tag) => ({ id: 's' + i.id + tag, kind: 'store', icon: 'bag', img: i.img, title: i.name, sub: i.price || '', hero: { meta: 'Store · ' + tag, title: i.name, desc: [i.discount ? `${i.discount}% off` : '', i.price].filter(Boolean).join(' · ') + (i.price ? '. ' : '') + 'Open the store page for trailers, screenshots and reviews.', bg: i.img }, run: () => D.V.open('game', i.id) });
const capCard = c => ({ id: 'c' + c.id, kind: 'shot', icon: 'camera', img: c.src, title: c.appid ? gnm(c.appid) : 'Screenshot', sub: when(c.time),
  hero: { meta: 'Gallery · ' + when(c.time), title: c.appid ? gnm(c.appid) : 'Your capture', desc: 'A screenshot you took. Press ' + D.g('A') + ' to view it full screen.', bg: c.src }, run: () => D.V.lightbox([{ src: c.src, cap: when(c.time) }], 0) });
function exploreCards() {
  const out = [], sec = (name, arr) => arr.forEach((c, j) => { c.grp = name; c.first = j === 0; out.push(c); });
  const gameCard = (g, sub, extra) => ({ id: 'eg' + g.id + (extra || ''), kind: 'act', icon: 'play', img: hdr(g.id), title: g.name, sub, hero: { meta: sub, title: g.name, desc: (S.data[g.id] && S.data[g.id].details && S.data[g.id].details.desc || '').slice(0, 220), bg: gart(g.id, 'hero', 'header') || hdr(g.id), gameId: g.id }, run: () => launchGame({ kind: 'game', id: g.id, name: g.name }) });
  const played = [...S.games].filter(g => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
  if (played.length) sec('Continue playing', played.slice(0, 8).map(g => gameCard(g, 'Last played ' + when(g.lastPlayed * 1000), 'c')));
  const dl = (S.dl || []).filter(d => d.state !== 'done');
  if (dl.length) sec('Downloads', dl.slice(0, 6).map(d => ({ id: 'edl' + d.id, kind: 'act', icon: 'download', img: hdr(d.id), title: d.name, sub: d.state === 'downloading' ? Math.round(d.progress) + '%' : d.msg || d.state, prog: d.progress, hero: { meta: 'Downloads', title: d.name, desc: d.msg || '' }, run: () => openView('downloads') })));
  const fr = (S.friends || []).filter(f => f.game).slice(0, 8), on = (S.friends || []).filter(f => !f.game && f.online).slice(0, 6);
  if (fr.length) sec('Friends are playing', fr.map(f => ({ id: 'fr' + f.id, kind: 'act', icon: 'people', img: f.avatar || '', title: f.name, sub: 'Playing ' + f.game, hero: { meta: 'Friends', title: f.name, desc: 'is playing ' + f.game }, run: () => openView('friends') })));
  if (on.length) sec('Friends online', on.map(f => ({ id: 'fo' + f.id, kind: 'act', icon: 'people', img: f.avatar || '', title: f.name, sub: 'Online', hero: { meta: 'Friends', title: f.name, desc: 'is online' }, run: () => openView('friends') })));
  if (S.news.length) sec('News from your games', S.news.slice(0, 16).map(newsCard));
  const tr = []; S.games.forEach(g => { const m = S.data[g.id] && S.data[g.id].details && S.data[g.id].details.movies; if (m && m[0] && tr.length < 10) tr.push({ id: 'etr' + g.id, kind: 'trailer', icon: 'video', img: m[0].thumb || hdr(g.id), title: g.name, sub: 'Trailer', hero: { meta: 'Game trailer', title: g.name, desc: (S.data[g.id].details.desc || '').slice(0, 200), bg: gart(g.id, 'hero', 'header') || m[0].thumb, gameId: g.id }, run: () => D.V.player(m[0].url, g.name) }); });
  if (tr.length) sec('Trailers from your games', tr);
  const unplayed = S.games.filter(g => !g.lastPlayed && !g.nonSteam).slice(0, 8);
  if (unplayed.length) sec('Not played yet', unplayed.map(g => gameCard(g, 'Installed · not played yet', 'u')));
  const big = [...S.games].filter(g => g.size).sort((a, b) => b.size - a.size).slice(0, 6);
  if (big.length) sec('Taking the most space', big.map(g => gameCard(g, gbytes(g.size), 's')));
  const cp = (S.caps || []).slice(0, 12); if (cp.length) sec('Your captures', cp.map(capCard));
  const vd = (S.vids || []).slice(0, 8); if (vd.length) sec('Your videos', vd.map(v => ({ id: 'ev' + v.id, kind: 'video', icon: 'film', grad: ['#3a2a6e', '#120a2a'], title: v.name, sub: v.from, hero: { meta: 'Your videos · ' + v.from, title: v.name, desc: 'A recording from your PC.' }, run: () => D.V.player(v.src, v.name) })));
  if (!out.length) out.push({ id: 'ex-empty', kind: 'act', icon: 'sparkle', grad: ['#2c3a66', '#0d1226'], title: 'Nothing to explore yet', sub: 'Play a game or sign in to Steam', hero: { meta: 'Explore', title: 'Nothing here yet', desc: 'Your recent games, friends, news and captures show up here.' } });
  return out;
}
function mediaCards(it) {
  if (it.kind === 'app') return [appCard(it), ...appInfoCards(it)];
  if (it.id === 'sec-media') { const o = (S.caps || []).slice(0, 12).map(capCard); (S.vids || []).slice(0, 4).forEach(v => o.push({ id: 'v' + v.id, kind: 'video', icon: 'film', grad: ['#3a2a6e', '#120a2a'], title: v.name, sub: v.from, hero: { meta: 'Video', title: v.name, desc: 'A recording from your PC. Press ' + D.g('A') + ' to play.' }, run: () => D.V.player(v.src) })); return o.length ? o : [{ id: 'nomedia', kind: 'info', icon: 'camera', grad: it.grad, title: 'No captures yet', sub: 'Take screenshots in a game', hero: { meta: 'Media Gallery', title: 'No captures yet', desc: 'Screenshots from your games will show up here.' } }]; }
  const out = [appCard(APPS[0])];
  S.games.forEach(g => { const m = S.data[g.id] && S.data[g.id].details && S.data[g.id].details.movies; if (m && m[0] && out.length < 9) out.push({ id: 'tr' + g.id, kind: 'trailer', icon: 'video', img: m[0].thumb || hdr(g.id), title: g.name, sub: 'Trailer',
    hero: { meta: 'Game trailer', title: g.name, desc: (S.data[g.id].details.desc || '').slice(0, 200), bg: gart(g.id, 'hero', 'header') || m[0].thumb, gameId: g.id }, run: () => D.V.player(m[0].url) }); });
  (S.vids || []).slice(0, 3).forEach(v => out.push({ id: 'v' + v.id, kind: 'video', icon: 'film', grad: ['#3a2a6e', '#120a2a'], title: v.name, sub: v.from, hero: { meta: 'Your videos · ' + v.from, title: v.name, desc: 'A recording from your PC. Press ' + D.g('A') + ' to play.' }, run: () => D.V.player(v.src) }));
  return out;
}
function hubCards(it) {
  const id = it.id, d = S.data[id] || {}, det = d.details || {}, st = d.stats, hub = S.hub[id] || {}, out = [], fr = (S.friends || []).filter(f => f.game && f.game === it.name);
  const g1 = ['#2c3a66', '#0d1226'];
  out.push(st && (st.playtime || st.lastPlayed) ? { id: 'a-time', kind: 'act', icon: 'clock', grad: g1, title: hrs(st.playtime) + ' played', sub: st.lastPlayed ? 'Last played ' + when(st.lastPlayed * 1000) : 'Your activity', run: () => D.V.open('game', id) }
    : { id: 'a-time', kind: 'act', icon: 'clock', grad: g1, title: 'Not played yet', sub: 'Press Play to start', run: () => launchGame(it) });
  if (d.trophies) out.push({ id: 'a-tr', kind: 'act', icon: 'trophy', grad: ['#6e5320', '#241a08'], title: `${d.trophies.earned}/${d.trophies.total} trophies`, sub: Math.round(d.trophies.earned / d.trophies.total * 100) + '% complete', prog: d.trophies.earned / d.trophies.total * 100, run: () => D.V.open('ach', id) });
  if (fr.length) out.push({ id: 'a-fr', kind: 'act', icon: 'people', grad: ['#1f6b5a', '#0a241f'], title: fr.length + (fr.length > 1 ? ' friends' : ' friend') + ' playing', sub: fr.slice(0, 3).map(f => f.name).join(', '), run: () => openView('friends') });
  (hub.news || []).slice(0, 3).forEach(n => out.push(newsCard(n)));
  const tUrl = det.trailer || hub.trailer;
  if (tUrl) out.push({ id: 'a-trl', kind: 'act', icon: 'video', img: det.movies && det.movies[0] && det.movies[0].thumb || hdr(id), title: 'Watch the trailer', sub: 'Official trailer', run: () => D.V.player(tUrl) });
  if (det.shots && det.shots.length) out.push({ id: 'a-shots', kind: 'act', icon: 'camera', img: det.shots[0].thumb, title: det.shots.length + ' screenshots', sub: 'From the store', run: () => D.V.lightbox(det.shots.map(x => ({ src: x.full, cap: it.name })), 0) });
  (det.movies || []).slice(1, 4).forEach((m, i) => out.push({ id: 'a-mv' + i, kind: 'act', sec: 'Trending videos', icon: 'video', img: m.thumb, title: m.name || 'Video', sub: 'Trailer & clips', run: () => D.V.player(m.url) }));
  const caps = (S.caps || []).filter(c => c.appid === id);
  if (caps.length) out.push({ id: 'a-caps', kind: 'act', icon: 'sparkle', img: caps[0].src, title: 'Your captures', sub: caps.length + ' saved', run: () => D.V.lightbox(caps.map(c => ({ src: c.src, cap: when(c.time) })), 0) });
  (hub.dlc || []).forEach(d => out.push({ id: 'dlc' + d.id, kind: 'act', sec: 'Add-Ons', icon: 'bag', img: d.img, title: d.name, sub: d.price ? (d.discount ? '-' + d.discount + '%  ' : '') + d.price : 'Add-on', run: () => D.V.open('game', d.id) }));
  { const tid = it.raw && it.raw.nonSteam ? d.steamId : id; if (tid) out.push({ id: 'a-store', kind: 'act', icon: 'bag', img: hdr(id), title: 'Store page and details', sub: 'Reviews, editions and more', run: () => D.V.open('game', tid) }); }
  if (!it.nonSteam && /^\d+$/.test(id)) out.push({ id: 'a-rev', kind: 'act', icon: 'star', grad: ['#3a3a66', '#101226'], title: 'Reviews', sub: det.reviewDesc ? det.reviewDesc + (det.reviewPct ? ' (' + det.reviewPct + '%)' : '') : 'See what players say', run: () => openView('game', id) });
  out.push({ id: 'a-mng', kind: 'act', icon: 'gear', grad: ['#3a4256', '#10131b'], title: 'Manage game', sub: 'Files, artwork, hide, music', run: () => optionsMenu(it) });
  // group into PS-style sections: Activities | Trending videos | Add-Ons
  const rank = c => c.sec === 'Trending videos' || c.id === 'a-trl' ? 1 : c.sec === 'Add-Ons' ? 2 : c.kind === 'news' || c.id === 'a-shots' || c.id === 'a-caps' ? 1 : 0;
  out.forEach(c => { if (c.id === 'a-trl') c.sec = 'Trending videos'; });
  const g = [[], [], []]; out.forEach(c => g[c.sec === 'Add-Ons' ? 2 : (c.sec === 'Trending videos' || c.kind === 'news' || c.id === 'a-shots' || c.id === 'a-caps') ? 1 : 0].push(c));
  g[1].forEach(c => { if (c.kind === 'news') c.sec = c.sec || 'Trending videos'; });
  const names = ['Activities', 'Trending videos', 'Add-Ons'], res = [];
  g.forEach((arr, i) => { arr.forEach((c, j) => { c.grp = names[i]; c.first = j === 0; res.push(c); }); });
  return res;
}
function buildStrip(it) { return !it ? [] : isStripItem(it) ? (it.id === 'explore' ? exploreCards() : mediaCards(it)) : it.kind === 'game' ? hubCards(it) : []; }
function refreshStrip(keep) {
  const it = cur(), old = S.strip.cards[S.stripI] && S.strip.cards[S.stripI].id;
  S.strip = { key: it ? it.id : '', cards: buildStrip(it) };
  if (keep && old) { const i = S.strip.cards.findIndex(c => c.id === old); S.stripI = i >= 0 ? i : Math.min(S.stripI, Math.max(0, S.strip.cards.length - 1)); } else S.stripI = 0;
  renderStrip(); updateStrip();
}
function renderStrip() {
  const s = $('#strip'); s.innerHTML = '<div class="track"></div>'; const tr = $('.track', s);
  let row = null;
  S.strip.cards.forEach((c, i) => {
    const g = c.grad || ['#2b3550', '#0d1220'];
    if (c.grp && c.first) { const w = h('div', 'ngrp', `<div class="ngt">${esc(c.grp)}</div>`); row = h('div', 'ngrow'); w.append(row); tr.append(w); } else if (!c.grp) row = null;
    const e = h('div', 'ncard k-' + c.kind + (c.img ? ' hasimg' : ' noimg'),
      `${c.img ? `<img loading="lazy" src="${esc(c.img)}" onerror="this.remove()">` : ''}<div class="nbig">${icon(c.icon || 'circle')}</div><div class="nb">${icon(c.icon || 'circle')}</div>` +
      `<div class="nt">${esc(c.title)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</div>${c.prog != null ? `<div class="npb"><i style="width:${c.prog}%"></i></div>` : ''}`);
    e.style.setProperty('--g0', g[0]); e.style.setProperty('--g1', g[1]); e.dataset.i = i; (row || tr).append(e);
  });
}
function updateStrip() {
  const it = cur(), n = S.strip.cards.length;
  const on = !!it && n > 0 && S.mode === 'home' && (isStripItem(it) || (it.kind === 'game' && S.zone === 'strip'));
  $('#strip').classList.toggle('on', on);
  $('#hero').classList.toggle('lift', !!it && it.kind === 'game' && S.zone === 'strip' && on);
  $$('.ncard').forEach((c, i) => { c.classList.toggle('cur', i === S.stripI); c.classList.toggle('focus', S.zone === 'strip' && i === S.stripI); });
  const tr = $('#strip .track');
  if (tr) {   // slide the track so the selected card is always fully on screen
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), vis = innerWidth - 11.8 * rem - 3 * rem, c = tr.querySelectorAll('.ncard')[S.stripI];
    let x = 0; if (c) { let o = 0, n = c; while (n && n !== tr) { o += n.offsetLeft; n = n.offsetParent; } x = Math.max(0, o + c.offsetWidth + 3 * rem - vis); if (S.stripI === 0 || (c.parentElement.classList.contains('ngrow') && c.previousElementSibling === null && o < vis * .5)) x = Math.min(x, Math.max(0, o - 1 * rem)); }
    tr.style.transform = `translateX(${-x}px)`;
  }
}
let hubT = null;
function ensureHub(id) {
  if (S.hub[id]) return; const hub = S.hub[id] = {};
  Promise.resolve(api.newsGame && api.newsGame(id)).then(n => { hub.news = n || []; hubDone(id); }).catch(() => {});
  const nm = gnm(id);
  setTimeout(() => { const d = S.data[id]; const ids = d && d.details && d.details.dlcIds; if (ids && ids.length && api.dlcList) api.dlcList(ids).then(l => { hub.dlc = l || []; hubDone(id); }).catch(() => {}); else if (api.storeApp) api.storeApp(id).then(x => { if (x && x.dlcIds && x.dlcIds.length) api.dlcList(x.dlcIds).then(l => { hub.dlc = l || []; hubDone(id); }); }).catch(() => {}); }, 900);
  setTimeout(() => { const d = S.data[id]; if (!(d && d.details && d.details.trailer) && api.findTrailer) Promise.resolve(api.findTrailer(id, nm)).then(u => { if (u) { hub.trailer = u; hubDone(id); } }).catch(() => {}); }, 1500);
}
function hubDone(id) { const it = cur(); if (it && it.id === id && S.mode === 'home') refreshStrip(true); }
function loadCaps() { Promise.resolve(api.gallery && api.gallery()).then(g => { S.caps = (g || []).slice(0, 60); const it = cur(); if (it && (it.id === 'explore' || it.kind === 'game')) refreshStrip(true); }).catch(() => {}); }
/* launch animation: the tile grows into the whole screen (no splash screen) while the app loads in the background */
let alEl = null, alT = 0;
function appLaunchAnim(a) {
  appLaunchEnd(true);
  const t = document.querySelector('#row .tile.focus') || document.querySelector('.ncard.sel') , r = t ? t.getBoundingClientRect() : { left: innerWidth / 2 - 60, top: innerHeight / 2 - 60, width: 120, height: 120 };
  const e = h('div', 'alaunch', `<div class="alg">${a.cover ? `<img src="${a.cover}">` : icon(a.icon)}</div><div class="alr"></div>`);
  e.style.setProperty('--g0', a.grad[0]); e.style.setProperty('--g1', a.grad[1]);
  Object.assign(e.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.append(e); alEl = e; void e.offsetWidth; requestAnimationFrame(() => e.classList.add('full'));
  clearTimeout(alT); alT = setTimeout(() => appLaunchEnd(), 14000); sfx('launch');
}
function appLaunchEnd(now) { clearTimeout(alT); const e = alEl; alEl = null; if (!e) return; if (now) return e.remove(); e.classList.add('out'); setTimeout(() => e.remove(), 500); }
api.onAppShown && api.onAppShown(() => appLaunchEnd());
function launchApp(a) {
  sfx('ok'); S.pref.appsUsed = [a.id, ...S.pref.appsUsed.filter(x => x !== a.id)].slice(0, 12); savePrefs();
  stopOst(); stopTrailer();
  if (a.embed) { appLaunchAnim(a); Promise.resolve(api.openApp && api.openApp(a.embed)).then(ok => { if (!ok) { appLaunchEnd(true); toast(a.name + ' runs inside the betterSBP desktop app.'); playOst(cur()); } }); }
  else api.launch(a.action || {});
}

function onFocus(dir = 0) {
  const it = cur(); if (!it) return;
  S.stripI = 0; refreshStrip(false); showHero(it); setTimeout(heroDl, 60); setTimeout(heroDl, 500); setBG(it, dir); playOst(it); armTrailer(it);
  clearTimeout(hubT); if (it.kind === 'game') hubT = setTimeout(() => ensureHub(it.id), 700);
  if (it.kind === 'game') { enqueue(it.id, true); const l = S.items[S.tab]; [1, -1, 2].forEach(o => l[S.idx[S.tab] + o] && l[S.idx[S.tab] + o].kind === 'game' && enqueue(l[S.idx[S.tab] + o].id, true)); }
}

/* ------------------------------------------------------------ data pipeline */
const dq = { list: [], seen: new Set(), run: 0 };
function enqueue(id, front) {
  if (dq.seen.has(id)) { if (front) { const i = dq.list.indexOf(id); if (i > 0) { dq.list.splice(i, 1); dq.list.unshift(id); } } return; }
  dq.seen.add(id); front ? dq.list.unshift(id) : dq.list.push(id); pump();
}
function pump() {
  while (dq.run < 4 && dq.list.length) {
    const id = dq.list.shift(); dq.run++;
    Promise.resolve(api.game(id)).then(d => { S.data[id] = d || {}; onData(id); }).catch(() => { S.data[id] = {}; })
      .finally(() => { dq.run--; pump(); });
  }
}
let rebuildT = null;
function onData(id) {
  const d = S.data[id];
  if (d.hidden) { clearTimeout(rebuildT); rebuildT = setTimeout(rebuild, 150); return; }
  paintTile(id);
  const it = cur(); if (it && (isStripItem(it) || it.id === id)) refreshStrip(true);
  if (it && (it.id === id || (isStripItem(it) && S.strip.cards[S.stripI] && S.strip.cards[S.stripI].hero && S.strip.cards[S.stripI].hero.gameId === id))) { bgKey = ''; showHero(it, false); setBG(it); armTrailer(it); }
}
function rebuild() {
  const id = cur() && cur().id; buildItems();
  const i = S.items[S.tab].findIndex(x => x.id === id);
  S.idx[S.tab] = i >= 0 ? i : Math.min(S.idx[S.tab], S.items[S.tab].length - 1);
  renderRow(false); if (!cur() || cur().id !== id) onFocus(0);
}

/* ------------------------------------------------------------------ launching */
function toast(msg) {
  S.notes.unshift({ t: Date.now(), msg }); S.notes.length = Math.min(S.notes.length, 40);
  if (!S.pref.toasts || S.pref.dnd) return;
  const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 3600);
}
function launchArgs(it) {
  const o = (S.pref.launchOpts || {})[it.id] || '', raw = it.raw || S.games.find(g => g.id === it.id) || {};
  return raw.nonSteam ? { exe: raw.exe, args: o, nsid: it.id } : { steam: it.id, args: o };
}
async function launchGame(it, fromEl) {
  if (!(await D.requirePin())) return;
  sfx('ok'); stopOst(); stopTrailer();
  const tile = fromEl || (D.V.active() ? null : tileById(it.id)), d = S.data[it.id] || {}, src = d.art && (d.art.hero || d.art.cover || d.art.header);
  D.V.closeAll();
  const la = launchArgs(it);
  if (!tile || !S.pref.motion) { api.launch(la); return; }
  const r = tile.getBoundingClientRect(), br = getComputedStyle(tile).borderRadius, z = h('div', 'lz');
  if (src) z.style.backgroundImage = `url("${src}")`;
  Object.assign(z.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: br });
  $('#launch').append(z);
  const full = { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px', borderRadius: '0px' };
  await z.animate([{ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: br }, { ...full, offset: .75 }, full],
    { duration: 750, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' }).finished;
  api.launch(la); await sleep(1600); z.remove();
}
function activate(it) {
  if (!it) return;
  if (it.id === 'explore') { if (S.strip.cards.length) { S.zone = 'strip'; sfx('ok'); applyZones(); } return; }
  if (it.web) { sfx('ok'); return api.openWeb(it.web); }
  if (it.view) { stopTrailer(); sfx('ok'); return openView(it.view); }
  if (it.kind === 'game') return launchGame(it);
  if (it.kind === 'app') return launchApp(it);
  sfx('ok'); toast('Opening ' + it.name + '…'); stopOst(); api.launch(it.action || {});
}
api.onLaunchFailed && api.onLaunchFailed(({ id }) => {
  const it = S.items[0].find(x => x.id === String(id)) || { id, name: gnm(id), kind: 'game' };
  setTimeout(() => D.V.dlg({ title: it.name + ' closed right away', msg: 'Some games only start while Steam is running. Launch this game through Steam from now on?',
    buttons: [{ label: 'Launch through Steam', run: () => { setPref('viaSteam', [...new Set([...(S.pref.viaSteam || []), String(id)])]); const la = launchArgs(it); api.launch({ ...la, viaSteam: true }); } }, { label: 'Not now' }] }), 600);
});
api.onRestored && api.onRestored(() => {
  $('#app').animate([{ opacity: 0, filter: 'blur(14px) brightness(.4)' }, { opacity: 1, filter: 'none' }], { duration: 1000, easing: EASE });
  playOst(cur()); armTrailer(cur());
});

/* -------------------------------------------------------------------- menus */
function openMenu(items, pos, head, from) {
  const layer = $('#menuLayer'); layer.innerHTML = '';
  const m = h('div', 'menu'); Object.assign(m.style, pos);
  if (head) m.append(h('div', 'mh', head));
  items.forEach((it, i) => {
    const e = h('div', 'mi', `<div class="mic">${icon(it.icon)}</div><div class="mt">${esc(it.label)}${it.sub ? `<span class="ms">${esc(it.sub)}</span>` : ''}</div>${it.right ? `<div class="mr">${it.right}</div>` : ''}`);
    e.dataset.i = i; m.append(e);
  });
  layer.append(m); layer.classList.add('on');
  const mm = h('div', 'mmore', icon('chev') || '⌄'); m.append(mm);
  const upd = () => { const more = m.scrollTop + m.clientHeight < m.scrollHeight - 6, up = m.scrollTop > 6; mm.classList.toggle('on', more); m.classList.toggle('upmore', up); };
  m.addEventListener('scroll', upd); m.addEventListener('wheel', e => { m.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false }); setTimeout(upd, 60); setTimeout(upd, 400);
  S.menu = { items, i: 0, from, el: m }; S.mode = 'menu'; menuSel(); sfx('open');
  requestAnimationFrame(() => m.classList.add('on'));
}
function menuSel() { $$('.mi', S.menu.el).forEach((e, i) => { const on = i === S.menu.i; e.classList.toggle('sel', on); if (on) e.scrollIntoView({ block: 'nearest' }); }); }
function closeMenu() {
  if (!S.menu) return; const m = S.menu.el; m.classList.remove('on'); $('#menuLayer').classList.remove('on');
  S.mode = S.menu.from; S.menu = null; setTimeout(() => { if (!S.menu) $('#menuLayer').innerHTML = ''; }, 350);
}
function menuRun() {
  const it = S.menu.items[S.menu.i]; sfx('ok');
  if (it.keep) { it.run(); return; }
  closeMenu(); it.run && it.run();
}
const onlineRight = () => `<i class="${S.online ? '' : 'off'}"></i>${S.online ? 'Online' : 'Appear Offline'}`;
function leaveCC() { if (S.mode === 'cc') { $('#cc').classList.remove('on'); S.mode = S.ccFrom === 'view' ? 'view' : 'home'; } }
function openView(spec, arg) {
  leaveCC();
  if (spec.startsWith('set:')) D.V.open('set', spec.slice(4));   // straight to the page, so Back returns to where you came from
  else D.V.open(spec, arg);
}
function profileMenu(from = 'home') {
  openMenu([
    { icon: 'user', label: 'Online Status', right: onlineRight(), keep: true, run() { S.online = !S.online; $('.mr', S.menu.el).innerHTML = onlineRight(); updateTop(); api.chatPersona && api.chatPersona(S.online ? 1 : 7); } },
    { icon: 'face', label: 'Profile', run: () => openView('profile') },
    { icon: 'trophy', label: 'Trophies', run: () => openView('trophies') },
    { icon: 'people', label: 'Switch User', run: () => { Promise.resolve(api.chatLogout()).then(() => { S.chat = { state: 'out' }; D.S.user = { name: 'Player' }; openView('steamlogin'); }); } },
    { icon: 'power', label: 'Log out (exit betterSBP)', run: () => { sfx('back'); api.quit(); } },
  ], { top: '7.4rem', right: '3.4rem', transformOrigin: 'top right' }, `${esc(S.user.name)} ${icon('star')}`, from);
}
function powerMenu() {
  const go = async a => { const r = await api.power(a); if (!r.ok) toast(r.msg); };
  openMenu([
    { icon: 'power', label: 'Enter Rest Mode', sub: 'Charge controllers, download updates, and suspend your games.', run: () => go('sleep') },
    { icon: 'circle', label: 'Turn Off PC', run: () => go('shutdown') },
    { icon: 'restart', label: 'Restart PC', run: () => go('restart') },
  ], { bottom: '11.5rem', right: '5rem', transformOrigin: 'bottom right' }, 'Power', 'cc');
}
function optionsMenu(it) {
  if (!it || it.id === 'explore') return;
  if (it.kind !== 'game') { openMenu([{ icon: it.icon, label: 'Open', run: () => activate(it) }], { left: '24rem', bottom: '5rem', transformOrigin: 'bottom left' }, null, 'home'); return; }
  const raw = it.raw || S.games.find(g => g.id === it.id) || {}, ns = !!raw.nonSteam, fav = S.pref.fav.includes(it.id);
  const items = [];
  items.push({ icon: 'play', label: 'Check for update', run: () => ns ? toast('Non-Steam games update themselves.') : startInstall(it.id, it.name) });
  items.push({ icon: 'heart', label: fav ? 'Remove from favorites' : 'Add to favorites', run: () => { const a = S.pref.fav.slice(), i = a.indexOf(it.id); i < 0 ? a.push(it.id) : a.splice(i, 1); setPref('fav', a); toast(i < 0 ? 'Added to favorites.' : 'Removed from favorites.'); } });
  items.push({ icon: 'layers', label: 'Add to collection…', run: () => collectionMenu(it) });
  if (!ns) {
    items.push({ icon: 'cart', label: 'Store page', run: () => openView('game', it.id) });
    items.push({ icon: 'people', label: 'Community hub', run: () => openView('ghub', it.id) });
  } else { const sm = (S.data[it.id] || {}).steamId; if (sm) { items.push({ icon: 'cart', label: 'Store page', run: () => openView('game', sm) }); items.push({ icon: 'people', label: 'Community hub', run: () => openView('ghub', sm) }); } items.push({ icon: 'home', label: onHome(it.id) ? 'Hide from home screen' : 'Show on home screen', run: () => toggleHome(it.id) }); }
  if (!ns) items.push({ icon: 'layers', label: 'Manage game content (DLC)', run: () => openView('dlcmgr', { id: it.id, name: it.name }) });
  items.push({ icon: 'gear', label: 'Properties (launch options)', run: () => openView('gprops', it.id) });
  items.push({ icon: 'info', label: 'Information', run: () => openView('ginfo', it.id) });
  if (!ns) items.push({ icon: 'folder', label: 'Browse local files', run: () => api.gameAction(it.id, 'files') });
  items.push({ icon: 'restart', label: 'Refresh artwork', run: async () => { await api.gameAction(it.id, 'refresh'); dq.seen.delete(it.id); delete S.data[it.id]; bgKey = ''; enqueue(it.id, true); toast('Refreshing artwork…'); } });
  items.push({ icon: 'music', label: 'Try a different soundtrack', run: async () => { stopOst(true); toast('Searching for another soundtrack…'); S.noOst[it.id] = false; await api.ostRefresh(it.id, it.name); playOst(cur()); } });
  items.push({ icon: 'music', label: S.pref.noMusic.includes(it.id) ? 'Turn music on for this game' : 'Turn music off for this game', run: () => { const a = S.pref.noMusic, i = a.indexOf(it.id); i < 0 ? a.push(it.id) : a.splice(i, 1); setPref('noMusic', a); playOst(cur()); } });
  items.push({ icon: 'trash', label: ns ? 'Remove from library' : 'Delete', run: () => D.V.dlg({ title: ns ? 'Remove this game?' : 'Delete this game?', msg: ns ? it.name + ' will be removed from betterSBP. The program itself is not deleted.' : it.name + ' and its files will be deleted from this PC.', buttons: [{ label: ns ? 'Remove' : 'Delete', run: () => api.gameAction(it.id, ns ? 'removens' : 'uninstall') }, { label: 'Cancel' }] }) });
  openMenu(items, { left: '24rem', bottom: '5rem', transformOrigin: 'bottom left' }, null, 'home');
}
function toggleHome(id) { const nv = !onHome(id); setPref('nsHome', { ...(S.pref.nsHome || {}), [id]: nv }); buildItems(); const i = S.items[0].findIndex(x => x.id === id); if (S.idx[0] >= S.items[0].length) S.idx[0] = S.items[0].length - 1; renderRow(false); toast(nv ? 'Shown on the home screen.' : 'Hidden from the home screen.'); }
function collectionMenu(it) {
  const c = S.pref.colls, names = Object.keys(c);
  const items = names.map(n => ({ icon: c[n].includes(it.id) ? 'check' : 'circle', label: n, run: () => { const a = c[n].slice(), i = a.indexOf(it.id); i < 0 ? a.push(it.id) : a.splice(i, 1); setPref('colls', { ...c, [n]: a }); toast(i < 0 ? 'Added to ' + n : 'Removed from ' + n); } }));
  items.push({ icon: 'plus', label: 'New collection…', run: () => D.V.osk({ title: 'Collection name', max: 40 }).then(r => { if (r && r.trim()) setPref('colls', { ...c, [r.trim()]: [it.id] }); }) });
  openMenu(items, { left: '24rem', bottom: '5rem', transformOrigin: 'bottom left' }, 'Collections', 'home');
}

/* ----------------------------------------------------------- control center */
function renderCC() {
  const c = $('#cc');
  c.innerHTML = `<div class="cccards"></div><div class="volp" style="display:none"></div><div class="musp" style="display:none"></div>
    <div class="ccbar">${CC.map((x, i) => `<div class="cci" data-i="${i}" style="--i:${i}">${icon(x[0])}<span class="ccl">${x[1]}</span></div>`).join('')}</div>
    <div class="cust">${icon('gear')}Customise</div>`;
  ccSel();
}
function ccSel() {
  $$('.cci').forEach((e, i) => e.classList.toggle('sel', i === S.cc));
  const cards = $('.cccards'), vp = $('.volp'), mp = $('.musp'), name = CC[S.cc][1];
  cards.style.display = name === 'Home' ? 'flex' : 'none';
  vp.style.display = name === 'Sound' ? 'flex' : 'none';
  mp.style.display = name === 'Music' ? 'flex' : 'none';
  vp.innerHTML = `<div class="vi">${icon('volume')}</div><div class="vbar"><i style="width:${S.muted ? 0 : Math.round(S.vol * 100)}%"></i></div><b>${S.muted ? 'Off' : Math.round(S.vol * 100)}</b>`;
  const g = S.items[0].find(x => x.kind === 'game' && x.id === S.nowId);
  mp.innerHTML = `<div class="vi">${icon('music')}</div><div class="mpt"><b>${S.music && g ? esc(g.name) + ' Soundtrack' : 'Game music is off'}</b><small>${S.music ? 'Press <span data-g="A">A</span> to turn off' : 'Press <span data-g="A">A</span> to turn on'}</small></div>`;
}
async function fillCCCards() {
  const n = S.news[0], g = n && S.data[n.gameId], a = g && g.art, img = a && (a.header || a.hero);
  const cards = $('.cccards');
  cards.innerHTML = `<div class="cccard">${img ? `<img src="${img}">` : ''}<div class="ci">${icon('compass')}</div><small>${Math.min(3, S.news.length)} stories from your games</small><b>Official news</b></div>
    <div class="cccard"><div class="ci">${icon('camera')}</div><small>Recently created</small><b>No new captures</b></div>`;
  try {
    const c = await api.captures();
    if (c && c.thumb) $$('.cccard')[1].innerHTML = `<img src="${c.thumb}"><div class="ci">${icon('camera')}</div><small>Recently created</small><b>New screenshot</b>`;
  } catch {}
}
function openCC() { if (!$('#cc .bat')) { const b = h('div', 'bat ccbat'); $('#cc').append(b); } paintBat(); S.ccFrom = S.mode; S.mode = 'cc'; renderCC(); fillCCCards(); $('#cc').classList.add('on'); sfx('open'); }
function closeCC() { S.mode = S.ccFrom === 'view' ? 'view' : 'home'; $('#cc').classList.remove('on'); sfx('back'); if (OV && S.mode === 'home') api.ovClose(); }
function ccAct() {
  const n = CC[S.cc][1]; sfx('ok');
  if (OV && n === 'Resume') { closeCC(); return; }
  if (OV && n === 'Home') { api.ovHome(); return; }
  if (OV && n === 'Screenshot') { api.ovShot(); return; }
  if (OV && n === 'Close game') { D.V.dlg({ title: 'Close the game?', msg: 'Unsaved progress will be lost.', buttons: [{ label: 'Close game', run: () => api.ovCloseGame() }, { label: 'Cancel' }] }); return; }
  if (n === 'Home') { leaveCC(); D.V.closeAll(); }
  else if (n === 'Friends') openView('friends');
  else if (n === 'Accessories') openView('set:accessories');
  else if (n === 'Notifications') openView('ccnotes');
  else if (n === 'Official news') openView('ccnews');
  else if (n === 'Profile') profileMenu('cc');
  else if (n === 'Power') powerMenu();
  else if (n === 'Sound') openView('ccsound');
  else if (n === 'Music') openView('ccmusic');
  else if (n === 'Switcher') toast('Press Alt+Tab to switch between running apps.');
  else if (n === 'Microphone') openView('ccmic');
  else toast('Not available here.');
}

/* ------------------------------------------------------------------- search */
function results() {
  const q = S.query.trim().toLowerCase();
  const all = [...S.items[0], ...S.items[1]].filter(x => x.id !== 'explore' && x.id !== 'store');
  return (q ? all.filter(x => x.name.toLowerCase().includes(q)) : all.filter(x => x.kind === 'game').slice(0, 6)).slice(0, 7);
}
function openSearch() {
  S.mode = 'search'; S._sk = ''; S.query = ''; S.sr = 0; $('#q').value = ''; $('#search').classList.add('on'); $('#q').focus(); renderSearch(); sfx('open');
  D.V.osk({ title: '', compact: true, live: v => { S.query = v; S.sr = 0; renderSearch(); } });   // B closes only the keyboard; B again closes search
}
function closeSearch() { S._sk = ''; $('#search').classList.remove('on'); $('#q').blur(); S.mode = 'home'; sfx('back'); }
function renderSearch() {
  const r = results(); S.sr = Math.min(S.sr, Math.max(0, r.length - 1));
  $('#sbar').innerHTML = `${icon('search')}<span class="sin">${S.query ? esc(S.query) + '<span class="caret"></span>' : '<span class="caret"></span><span class="ph">Search your games and apps</span>'}</span>`;
  const key = S.query + '|' + r.map(x => x.id).join(',');
  if (S._sk !== key || !$('#sres .sr')) {          // rebuild only when the results change; moving the selection must not re-render (that made the list flicker)
    S._sk = key;
    $('#sres').innerHTML = r.length ? r.map((x, i) => {
      const d = S.data[x.id], src = d && d.art && (d.art.cover || d.art.header);
      return `<div class="sr" data-i="${i}" style="--i:${i}"><div class="st">${src ? `<img src="${src}">` : ''}</div>${esc(x.name)}</div>`;
    }).join('') : '<div class="snone">No results</div>';
  }
  $$('#sres .sr').forEach((e, i) => e.classList.toggle('sel', i === S.sr));
}

/* -------------------------------------------------------------------- input */
function switchTab(t) {
  t = Math.max(0, Math.min(1, t)); if (t === S.tab) return;
  S.tab = t; S.zone = 'row'; sfx('move'); renderRow(true); onFocus(0);
}
function topAct(i) {
  if (i < 2) { switchTab(i); S.zone = 'row'; applyZones(); }
  else if (i === 2) openView('friends');
  else if (i === 3) openView('gallery');
  else if (i === 4) openView('community');
  else if (i === 5) openView('set:accessories');
  else if (i === 6) openView('downloads');
  else if (i === 7) openSearch();
  else if (i === 8) openView('settings');
  else profileMenu('home');
}
/* Ask for a Steam login on start (in our own UI) unless one is already saved / signed in */
async function startupLogin() {
  if (S.mode === 'boot' || OV) return;
  S.noAudio = true;   // no game music until we know whether a sign-in screen is needed
  let opened = false;
  try {
    let c = null, d = null; for (let i = 0; i < 4; i++) { try { c = await api.chatStatus(); d = await api.discordStatus(); } catch {} if (c && (c.state === 'in' || c.state === 'connecting' || c.hasToken)) break; if (i < 2) await sleep(700); }
    if (!S.pref.setupDone && !(c && c.available === false)) { opened = true; openView('setup'); return; }
    const steamOk = !c || c.available === false || c.state === 'in' || c.state === 'connecting' || c.hasToken || S.pref.skipLogin;
    const dcOk = !d || d.available === false || d.state === 'on' || d.state === 'connecting' || (d.configured && d.hasToken) || S.pref.skipDiscord;
    if (!(steamOk && dcOk)) { opened = true; openView('setup'); }
  } catch {}
  if (!opened) { S.noAudio = false; playOst(cur()); }   // a sign-in view releases the gate itself when it closes
}
let bootAdd = false;
/* ------------------------------------------------------------------ start screen */
let bootSt = null;
async function showBoot() {
  const el = h('div', 'boot'); el.id = 'boot'; document.body.append(el);
  // the "who is using this" tile is the signed-in Steam account only (never a profile read from this PC)
  let acc = []; try { let c = await api.chatStatus(); for (let i = 0; i < 8 && c && c.state === 'connecting'; i++) { await sleep(500); c = await api.chatStatus(); } if (c && c.state === 'in') acc = [{ name: c.persona || c.name || 'Steam', avatar: c.avatar || '', recent: true }]; } catch {}
  bootSt = { el, stage: 0, acc, sel: Math.max(0, acc.findIndex(x => x.recent)) }; S.mode = 'boot'; drawBoot();
}
function drawBoot() {
  const b = bootSt; if (!b) return;
  if (b.stage === 0) b.el.innerHTML = `<div class="bt">Press <span data-g="A">A</span> on your controller.</div><div class="bring"><i></i><i></i><div class="blogo">${icon('steam')}</div></div><div class="bh">or press Enter</div>`;
  else b.el.innerHTML = `<div class="bwt">Welcome back to betterSBP</div><div class="bws">Who's using this controller?</div><div class="bu">${b.acc.map((x, i) => `<div class="bus ${i === b.sel ? 'f' : ''}" data-i="${i}"><div class="ucirc">${x.avatar ? `<img src="${x.avatar}">` : `<span>${esc(x.name[0].toUpperCase())}</span>`}</div><div class="un">${esc(x.name)}</div></div>`).join('')}
    <div class="bus ${b.sel >= b.acc.length ? 'f' : ''}" data-i="${b.acc.length}"><div class="ucirc">${icon('plus')}</div><div class="un">Add User</div></div></div>`;
  b.el.onclick = e => { const u = e.target.closest('.bus'); if (b.stage === 0) bootKey('ok'); else if (u) { b.sel = +u.dataset.i; bootKey('ok'); } };
}
function bootKey(k) {
  const b = bootSt; if (!b) return;
  if (b.stage === 0) { if (k === 'back') return; if (!b.acc.length) return finishBoot(); sfx('open'); b.stage = 1; drawBoot(); return; }
  const n = b.acc.length + 1;
  if (k === 'left') { b.sel = Math.max(0, b.sel - 1); sfx('move'); drawBoot(); }
  else if (k === 'right') { b.sel = Math.min(n - 1, b.sel + 1); sfx('move'); drawBoot(); }
  else if (k === 'ok' || k === 'guide') {
    finishBoot();
  }
}
function finishBoot() { const b = bootSt; if (!b) return; sfx('launch'); b.el.classList.add('out'); const el = b.el; bootSt = null; S.mode = 'home'; setTimeout(() => el.remove(), 600); setTimeout(startupLogin, 400); }
/* start-up movie (like the PlayStation launch movie): any video file, a random one from a folder, or none */
let movie = null;
async function playStartMovie(force) {
  let m = null; try { m = await api.startMovie(); } catch {}
  if (!m) return false;
  return new Promise(res => {
    const e = h('div', 'smovie', `<video src="${esc(m.src)}" autoplay playsinline></video><div class="smh"><b data-g="A">A</b> Skip</div>`);
    document.body.append(e); const v = e.querySelector('video'); v.volume = Math.min(1, (S.pref.startMovieVol == null ? 1 : S.pref.startMovieVol) * (S.muted ? 0 : Math.max(.3, S.vol * 1.4)));
    const prevMode = S.mode; S.mode = 'movie';
    const end = () => { if (!movie) return; movie = null; e.classList.add('out'); setTimeout(() => e.remove(), 500); S.mode = force ? prevMode : 'boot'; res(true); };
    movie = { end }; v.onended = end; v.onerror = end; e.onclick = end; setTimeout(() => { if (movie) end(); }, 180000); requestAnimationFrame(() => e.classList.add('on'));
  });
}
function press(k) {
  if (S.mode === 'movie') { if (k === 'ok' || k === 'back' || k === 'guide') movie && movie.end(); return; }
  if (AC.state === 'suspended') AC.resume();
  if (S.mode === 'boot') return bootKey(k);
  if (k === 'guide') {
    if (S.mode === 'cc') closeCC(); else if (S.mode === 'home' || S.mode === 'view') openCC();
    else if (S.mode === 'menu' && S.menu.from === 'cc') { closeMenu(); closeCC(); }
    return;
  }
  if (S.mode === 'home') return homeKey(k);
  if (S.mode === 'view') return D.V.key(k);
  if (S.mode === 'osk') { if (k === 'lt') return D.V.oskInput('Backspace'); if (k === 'rt') return D.V.oskInput(' '); return D.V.oskKey(k); }
  if (S.mode === 'dlg') return D.V.dlgKey(k);
  if (S.mode === 'lightbox') return D.V.lbKey(k);
  if (S.mode === 'player') return D.V.plKey(k);
  if (S.mode === 'cc') {
    const n = CC[S.cc][1];
    if (k === 'left' && S.cc > 0) { S.cc--; ccSel(); sfx('move'); }
    else if (k === 'right' && S.cc < CC.length - 1) { S.cc++; ccSel(); sfx('move'); }
    else if (n === 'Sound' && (k === 'up' || k === 'down')) { setPref('vol', Math.max(0, Math.min(1, Math.round((S.vol + (k === 'up' ? .05 : -.05)) * 100) / 100))); S.muted = false; ccSel(); sfx('move'); }
    else if (k === 'ok') ccAct();
    else if (k === 'back') closeCC();
    return;
  }
  if (S.mode === 'menu') {
    if (k === 'up' && S.menu.i > 0) { S.menu.i--; menuSel(); sfx('move'); }
    else if (k === 'down' && S.menu.i < S.menu.items.length - 1) { S.menu.i++; menuSel(); sfx('move'); }
    else if (k === 'ok') menuRun();
    else if (k === 'back') { closeMenu(); sfx('back'); }
    return;
  }
  if (S.mode === 'search') {
    const r = results();
    if (k === 'up' && S.sr > 0) { S.sr--; renderSearch(); sfx('move'); }
    else if (k === 'down' && S.sr < r.length - 1) { S.sr++; renderSearch(); sfx('move'); }
    else if (k === 'ok' && r[S.sr]) { const it = r[S.sr]; closeSearch(); activate(it); }
    else if (k === 'back') closeSearch();
    else if (k === 'options') D.V.osk({ title: '', compact: true, value: S.query, live: v => { S.query = v; S.sr = 0; renderSearch(); } });
  }
}
function stripAct(i) { const c = S.strip.cards[i]; if (c && c.run) { sfx('ok'); c.run(); } }
function homeKey(k) {
  if (k === 'lb') return switchTab(S.tab - 1);
  if (k === 'rb') return switchTab(S.tab + 1);
  if (k === 'search') return openSearch();
  const it = cur();
  if (S.zone === 'row') {
    if (k === 'left') moveRow(-1);
    else if (k === 'right') moveRow(1);
    else if (k === 'up') { S.zone = 'top'; S.topI = S.tab; sfx('move'); applyZones(); }
    else if (k === 'down') {
      if (isStripItem(it)) { if (S.strip.cards.length) S.zone = 'strip'; else return; } else if (hasHero(it)) { S.zone = 'hero'; S.heroI = 0; } else return;
      sfx('move'); applyZones();
    }
    else if (k === 'ok') activate(it);
    else if (k === 'options') optionsMenu(it);
  } else if (S.zone === 'hero') {
    if (k === 'left') { S.heroI = 0; updateHeroFocus(); sfx('move'); }
    else if (k === 'right') { S.heroI = 1; updateHeroFocus(); sfx('move'); }
    else if (k === 'down' && S.strip.cards.length && it.kind === 'game') { S.zone = 'strip'; sfx('move'); applyZones(); }
    else if (k === 'up' || k === 'back') { S.zone = 'row'; sfx('back'); applyZones(); }
    else if (k === 'ok') S.heroI === 0 ? (S.dl.some(x => String(x.id) === String(it.id) && ['queued', 'starting', 'downloading', 'login'].includes(x.state)) ? D.V.open('downloads') : activate(it)) : optionsMenu(it);
    else if (k === 'options') optionsMenu(it);
  } else if (S.zone === 'strip') {
    const n = S.strip.cards.length;
    if ((k === 'left' && S.stripI > 0) || (k === 'right' && S.stripI < n - 1)) {
      S.stripI += k === 'left' ? -1 : 1; sfx('move');
      if (isStripItem(it)) { showHero(it, true); bgKey = ''; setBG(it, k === 'left' ? -1 : 1); }
      updateStrip();
    }
    else if (k === 'up' || k === 'back') { S.zone = it.kind === 'game' ? 'hero' : 'row'; sfx('back'); applyZones(); }
    else if (k === 'ok') stripAct(S.stripI);
    else if (k === 'options' && it.kind === 'game') optionsMenu(it);
  } else {
    const hid = z => S.pref.simple && SIMPLE_HIDE.includes(z);
    if (k === 'left') { let z = S.topI - 1; while (z > 0 && hid(z)) z--; if (z >= 0 && z !== S.topI) { S.topI = z; sfx('move'); updateTop(); } }
    else if (k === 'right') { let z = S.topI + 1; while (z < 9 && hid(z)) z++; if (z <= 9 && z !== S.topI) { S.topI = z; sfx('move'); updateTop(); } }
    else if (k === 'down' || k === 'back') { S.zone = 'row'; sfx('back'); applyZones(); }
    else if (k === 'ok') { sfx('ok'); topAct(S.topI); }
  }
}

addEventListener('keydown', e => {
  S.lastInput = 'kb';
  if (e.ctrlKey && e.key.toLowerCase() === 'q') { api.quit(); return; }
  if (e.key === 'F12') { e.preventDefault(); D.capture(); return; }
  if (S.mode === 'osk') { e.preventDefault(); D.V.oskInput(e.key); return; }
  if (S.mode === 'search' && (e.key.length === 1 || e.key === 'Backspace')) return;   // let the input take typing
  if (S.mode === 'boot') { e.preventDefault(); press(e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : e.key === 'Escape' ? 'back' : 'ok'); return; }
  const m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back',
    F1: 'guide', Home: 'guide', o: 'options', O: 'options', f: 'search', F: 'search', q: 'lb', Q: 'lb', e: 'rb', E: 'rb' }[e.key];
  if (e.key === 'Tab') { e.preventDefault(); switchTab(1 - S.tab); return; }
  if (m) { e.preventDefault(); press(m); }
});
$('#q').addEventListener('input', e => { S.query = e.target.value; S.sr = 0; renderSearch(); });
addEventListener('wheel', e => {
  if (S.mode === 'home' && S.zone === 'row') press(e.deltaY + e.deltaX > 0 ? 'right' : 'left');
  else if (S.mode === 'view' || S.mode === 'search') press(e.deltaY > 0 ? 'down' : 'up');
  else if (S.mode === 'lightbox') press(e.deltaY > 0 ? 'right' : 'left');
}, { passive: true });
addEventListener('contextmenu', e => { e.preventDefault(); press('back'); });
let idleT; const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 3000); };
addEventListener('mousemove', e => { wake(); S.lastInput = 'kb'; if (S.mode === 'search') { const t = e.target.closest('.sr'); if (t && +t.dataset.i !== S.sr) { S.sr = +t.dataset.i; $$('#sres .sr').forEach((x, i) => x.classList.toggle('sel', i === S.sr)); } } }); wake();

document.addEventListener('click', e => {
  const fx = e.target.closest('.fx');
  if (fx && (S.mode === 'view' || S.mode === 'osk' || S.mode === 'dlg')) { if (S.mode === 'view') D.V.click(fx); else { D.V.focus(fx); press('ok'); } return; }
  if (S.mode === 'lightbox') { const r = e.target.closest('.lba'); if (r) press(r.classList.contains('l') ? 'left' : 'right'); else press('back'); return; }
  const t = e.target.closest('.tile, .tab, .ib, .av, .btn, .ncard, .cci, .mi, .sr');
  if (!t) { if (S.mode === 'menu' && e.target.id === 'menuLayer') press('back'); return; }
  const i = +t.dataset.i;
  if (t.matches('.tile')) { if (S.mode !== 'home') return; S.zone = 'row'; if (i === S.idx[S.tab]) activate(cur()); else { const d = i > S.idx[S.tab] ? 1 : -1; S.idx[S.tab] = i; sfx('move'); applyFocus(); onFocus(d); } }
  else if (t.matches('.tab, .ib, .av')) { if (S.mode === 'home') { S.zone = 'top'; S.topI = +t.dataset.z; sfx('ok'); topAct(S.topI); } }
  else if (t.matches('.btn')) { if (S.mode === 'home') +t.dataset.b === 0 ? activate(cur()) : optionsMenu(cur()); }
  else if (t.matches('.ncard')) { if (S.mode === 'home') { S.zone = 'strip'; S.stripI = i; updateStrip(); stripAct(i); } }
  else if (t.matches('.cci')) { S.cc = i; ccSel(); ccAct(); }
  else if (t.matches('.mi')) { S.menu.i = i; menuSel(); menuRun(); }
  else if (t.matches('.sr')) { S.sr = i; press('ok'); }
});

/* controller glyphs: Xbox letters or PlayStation symbols, auto-detected from the connected pad (or set by hand) */
const PSG = { A: '\u2715', B: '\u25CB', X: '\u25A1', Y: '\u25B3', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', Back: 'Create', Start: 'Options' };
const padKind = () => S.pref.padLayout === 'ps' || S.pref.padLayout === 'xbox' ? S.pref.padLayout : (S.padKind || 'xbox');
const g = n => padKind() === 'ps' && PSG[n] ? PSG[n] : n;
function paintGlyphs() { document.querySelectorAll('[data-g]').forEach(e => { const t = g(e.dataset.g); if (e.textContent !== t) e.textContent = t; }); }
let _pg = 0; new MutationObserver(() => { if (!_pg) _pg = requestAnimationFrame(() => { _pg = 0; paintGlyphs(); }); }).observe(document.documentElement, { childList: true, subtree: true });
function detectPad(gp) { const k = /054c|dualsense|dualshock|playstation|wireless controller|ps[345]/i.test(gp.id) ? 'ps' : 'xbox'; if (k !== S.padKind) { S.padKind = k; paintGlyphs(); } }
/* gamepad (standard mapping) */
const prev = {}, hold = {}; let lastPadSend = 0;
function poll(t) {
  if (S.sleep) { setTimeout(() => requestAnimationFrame(poll), 1000); return; }
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
  if (gp) {
    if (gp.id !== S.padId) { S.padId = gp.id; detectPad(gp); }
    const b = i => gp.buttons[i] && gp.buttons[i].pressed, ax = gp.axes;
    const dz = S.pref.deadzone || .6, sw = S.pref.swapAB;
    const st = { up: b(12) || ax[1] < -dz, down: b(13) || ax[1] > dz, left: b(14) || ax[0] < -dz, right: b(15) || ax[0] > dz,
      ok: sw ? b(1) : b(0), back: sw ? b(0) : b(1), options: b(2), search: b(3), lb: b(4), rb: b(5), lt: b(6), rt: b(7), guide: OV ? false : (b(16) || b(9) || b(8)) };   // in the in-game overlay the Guide button is handled once, by the main process
    if ((Object.values(st).some(Boolean) || gp.buttons.some(x => x.pressed)) && t - lastPadSend > 700) { lastPadSend = t; api.padActive && api.padActive(); }
    for (const k in st) {
      const NS = { slow: [520, 170], normal: [380, 110], fast: [260, 70] }[S.pref.navSpeed] || [380, 110];
      if (st[k] && !prev[k]) { S.lastInput = 'pad'; press(k); hold[k] = t + NS[0]; }
      else if (st[k] && ['up', 'down', 'left', 'right'].includes(k) && t > hold[k]) { press(k); hold[k] = t + NS[1]; }
      prev[k] = st[k];
    }
    requestAnimationFrame(poll);
  } else setTimeout(() => poll(performance.now()), 450);   // nothing connected: poll slowly instead of 60 times a second
}
window.addEventListener('gamepadconnected', () => requestAnimationFrame(poll));
requestAnimationFrame(poll);

/* ---------------------------------------------------------------- corner pop-ups */
function showPopup(d) {
  if (!d) return;
  S.notes.push({ msg: (d.title ? d.title + ': ' : '') + (d.body || ''), t: Date.now() }); if (S.notes.length > 60) S.notes.shift();
  if (S.pref.dnd || S.pref.popups === false || OV) return;
  let L = $('#popLayer'); if (!L) { L = h('div'); L.id = 'popLayer'; document.body.append(L); }
  const e = h('div', 'pop ' + (d.kind || ''), `${d.icon ? `<img src="${esc(d.icon)}" onerror="this.remove()">` : `<div class="pic">${icon(d.kind === 'discord' ? 'people' : 'steam')}</div>`}<div class="ptx"><b>${esc(d.title || '')}</b><span>${esc(d.body || '')}</span></div>`);
  L.prepend(e); sfx('notify');
  while (L.children.length > 3) L.lastChild.remove();
  requestAnimationFrame(() => e.classList.add('on'));
  setTimeout(() => { e.classList.remove('on'); setTimeout(() => e.remove(), 500); }, 5200);
}
api.onPopup && api.onPopup(showPopup);

/* ---------------------------------------------------------------- downloads */
const dlPrev = {}; let asking = false;
function onDl(list) {
  S.dl = list || []; paintBadges();
  for (const i of S.dl) { const p = dlPrev[i.id]; if (p && p !== i.state) { if (i.state === 'done') { toast(`${i.name} was installed.`); sfx('ok'); } else if (i.state === 'error') toast(`${i.name}: ${i.msg}`); } dlPrev[i.id] = i.state; }
  if (D.V && D.V.refreshDl) D.V.refreshDl();
  const q = S.dl.find(i => i.prompt); if (q && !asking) askDl(q);
}
async function askDl(i) {
  if (S.mode !== 'home' && S.mode !== 'view') { setTimeout(() => { const q = S.dl.find(x => x.prompt); if (q && !asking) askDl(q); }, 1500); return; }
  asking = true; const kind = i.prompt.kind;
  if (kind === 'user') { asking = false; D.toast('Sign in to Steam to download games.'); D.V.open('steamlogin'); return; }
  const v = await D.V.osk({ title: kind === 'user' ? `Steam account name to download ${i.name}` : kind === 'password' ? 'Steam password (sent only to Steam)' : 'Steam Guard code', secret: kind === 'password', placeholder: kind === 'user' ? 'Your login name, not your display name' : '', max: 64 });
  asking = false;
  if (v === null || v === '') { api.dlPause(i.id); return; }
  api.dlAnswer(i.id, kind, v);
}
async function startInstall(id, name) {
  if (!api.dlLibs) { toast('Downloads work in the betterSBP desktop app.'); return; }
  const r = await api.dlLibs(), libs = r.libs || [];
  if (!libs.length) { toast('No Steam library folder was found. Install Steam first.'); return; }
  const go = async lib => { await api.dlAdd(String(id), name, lib); toast('Added ' + name + ' to Downloads.'); D.V.open('downloads'); };
  const pref = libs.find(l => l.path === S.pref.dlLib);
  if (pref || libs.length === 1) return go((pref || libs[0]).path);
  openMenu(libs.map(l => ({ icon: 'disk', label: l.path, sub: gbytes(l.free) + ' free', run: () => go(l.path) })), { left: '50%', top: '28%', transformOrigin: 'top left' }, 'Install to', S.mode);
}
api.onDl && api.onDl(onDl);
api.onSleep && api.onSleep(on => { S.sleep = on; document.body.classList.toggle('sleep', on); if (on) { stopOst(true); stopTrailer(); } });
api.onAppClosed && api.onAppClosed(() => { appLaunchEnd(true); $('#app').animate([{ opacity: 0, filter: 'blur(14px) brightness(.4)' }, { opacity: 1, filter: 'none' }], { duration: 900, easing: EASE }); playOst(cur()); armTrailer(cur()); });
api.onGames && api.onGames(list => { S.games = list || []; buildItems(); rebuild(); S.games.forEach(g => enqueue(g.id)); invalidate(); });

/* ------------------------------------------------------------------ exports */
function capture() { Promise.resolve(api.capture && api.capture()).then(f => toast(f ? 'Screenshot saved to Pictures > betterSBP Captures.' : 'Could not take a screenshot.')); }
function reloadAll() { S.data = {}; dq.seen.clear(); dq.list.length = 0; bgKey = ''; S.games.forEach(g => enqueue(g.id)); const it = cur(); if (it) onFocus(0); }
function invalidate() { S.lib = null; }
function viewsClosed() { S.mode = 'home'; if (OV) { setTimeout(() => { if (S.mode === 'home') openCC(); }, 60); return; } loadCaps(); paintBadges(); const it = cur(); if (it) { refreshStrip(true); showHero(it, false); setBG(it); playOst(it); armTrailer(it); } applyZones(); }
window.D = { playStartMovie, g, paintGlyphs, renderTop, toggleHome, onHome, logo: n => window.LOGO_IMG[n] ? window.logo(n) : '', applySink: id => D_applySink(id), launchArgs, launchApp, startInstall, APPS, hdr, gbytes, hrs, S, $, $$, h, esc, api, sfx, toast, sleep, openMenu, launchGame, setPref, rebuild, reloadAll, invalidate, capture, stopOst, playOst, stopTrailer, cur, viewsClosed, when };

/* --------------------------------------------------------------------- boot */
const OV = /[?&]ov=1/.test(location.search);
(async () => {
  const init = await api.init();
  S.pref = Object.assign({}, DEF, init.prefs || {}); applyPrefs();
  S.user = init.user || S.user; S.games = init.games || []; S.hasKey = !!init.hasKey;
  api.onGuide && api.onGuide(() => press('guide'));
  if (OV) {   // in-game overlay: only the Control Center, no music / trailers / row
    document.body.classList.add('ov'); S.muted = true;
    CC = [['play', 'Resume'], ['home', 'Home'], ['bell', 'Notifications'], ['people', 'Friends'], ['volume', 'Sound'], ['camera', 'Screenshot'], ['pad', 'Accessories'], ['face', 'Profile'], ['x', 'Close game']];
    buildItems(); renderTop();
    const show = on => { if (on) { S.mode = 'home'; S.cc = 0; openCC(); api.ovStatus().then(s => { S.ovGame = s && s.game; const t = $('.cust'); if (t) t.innerHTML = icon('pad') + esc(s && s.game ? 'Playing ' + s.game : 'In game'); }); } else { $('#cc').classList.remove('on'); S.mode = 'home'; D.V.closeAll && D.V.closeAll(); } };
    api.onOv && api.onOv(show);
    return;
  }
  buildItems(); renderTop();
  S.noAudio = true; S.idx[0] = Math.min(2, S.items[0].length - 1); if (S.pref.startTab === 1) { S.tab = 1; }
  renderRow(true); onFocus(0); initBat();
  S.games.forEach(g => enqueue(g.id));
  S.mode = 'boot'; await playStartMovie().catch(() => {});
  if (S.pref.bootScreen !== false) showBoot(); else { S.mode = 'home'; setTimeout(startupLogin, 2500); }
  Promise.resolve(api.logos && api.logos()).then(l => { if (l && Object.keys(l).length) { Object.assign(window.LOGO_IMG, l); try { renderRow(false); } catch {} } }).catch(() => {});

  Promise.resolve(api.news()).then(n => { S.news = n || []; const it = cur(); if (isStripItem(it)) { refreshStrip(true); showHero(it, false); bgKey = ''; setBG(it); } }).catch(() => {});
  Promise.resolve(api.storeRecs && api.storeRecs()).then(r => { S.recs = r; const it = cur(); if (it && it.id === 'explore') refreshStrip(true); }).catch(() => {});
  Promise.resolve(api.storeFeatured && api.storeFeatured()).then(d => { S.store = d; const it = cur(); if (isStripItem(it)) { refreshStrip(true); showHero(it, false); } }).catch(() => {});
  Promise.resolve(api.videos && api.videos()).then(v => { S.vids = v || []; const it = cur(); if (it && it.id === 'sec-tv') refreshStrip(true); }).catch(() => {});
  if (api.friends) Promise.resolve(api.friends()).then(f => { S.friends = f && f.friends || []; }).catch(() => {});
  Promise.resolve(api.dlList && api.dlList()).then(l => { S.dl = l || []; S.dl.forEach(i => dlPrev[i.id] = i.state); paintBadges(); }).catch(() => {});
  loadCaps();
  setTimeout(() => Promise.resolve(api.library && api.library()).then(r => { if (r && !S.lib) S.lib = r; }).catch(() => {}), 2500);
  api.onCaptured && api.onCaptured(() => toast('Screenshot saved to Pictures > betterSBP Captures.'));
  const t0 = Date.now(); let lastRem = 0;
  setInterval(() => { const m = Math.floor((Date.now() - t0) / 60000); if (S.pref.remind && m >= S.pref.remind && m - lastRem >= S.pref.remind) { lastRem = m; toast(`You have been playing for ${m >= 60 ? (m / 60).toFixed(m % 60 ? 1 : 0) + ' h' : m + ' min'}. Time for a break?`); } }, 30000);
})();
})();

/* artwork that fails to load (missing poster on Steam's CDN, new games with hashed asset names) is looked up and swapped in automatically */
document.addEventListener('error', async e => {
  const im = e.target; if (!im || im.tagName !== 'IMG' || im.dataset.afix === '2') return;
  const m = /store_item_assets\/steam\/apps\/(\d+)\/(library_600x900|library_hero|header|capsule_616x353|capsule_231x87)[^/]*\.jpg/.exec(im.src); if (!m) return;
  const kind = m[2], id = m[1], step = +(im.dataset.afix || 0); im.dataset.afix = String(step + 1);
  try {
    const f = await api.artFind(id); let u = f && (kind === 'library_600x900' ? (f.cover || f.header) : kind === 'library_hero' ? (f.hero || f.header) : (f.header || f.capsule));
    if (!u || u === im.src) u = f && f.header; if (u && u !== im.src) im.src = u;
  } catch {}
}, true);

