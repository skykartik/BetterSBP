// In-app screens: settings pages, library, store, gallery, friends, profile, trophies.
// Everything is navigated by spatial focus so keyboard, mouse and gamepad all work.
(() => {
'use strict';
const D = window.D, S = D.S, $ = D.$, $$ = D.$$, esc = D.esc, api = D.api, icon = window.icon;
const V = D.V = {};
const STACK = [];
let fxEl = null;
const top = () => STACK[STACK.length - 1];

const CDN = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/';
const headerU = id => CDN + id + '/header.jpg';
// posters that Steam's CDN does not have are fetched once from other sources; the result is remembered so tiles never go grey again
let AM = {}; try { AM = JSON.parse(localStorage.getItem('artMap') || '{}'); } catch {}
D.artMap = AM; let amT = null; const amSave = () => { clearTimeout(amT); amT = setTimeout(() => { try { localStorage.setItem('artMap', JSON.stringify(AM)); } catch {} }, 800); };
const fbQ = [], fbRun = { n: 0 };
const fbPump = () => { while (fbRun.n < 6 && fbQ.length) { const { img, id } = fbQ.shift(); fbRun.n++; Promise.resolve(api.artFix(id, 'cover')).then(u => { if (u) { AM[id] = u; amSave(); if (img.isConnected) img.src = u; } else img.remove(); }).catch(() => img.remove()).finally(() => { fbRun.n--; fbPump(); }); } };
const libArt = g => { if (!/^\d+$/.test(g.id)) { const a = S.data[g.id] && S.data[g.id].art; return (a && (a.cover || a.header)) || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; } return AM[g.id] || (CDN + g.id + '/library_600x900.jpg'); };
const coverU = id => AM[id] || (CDN + id + '/library_600x900.jpg');
const fmtMin = m => !m ? '0 min' : m >= 60 ? (m / 60).toFixed(m >= 600 ? 0 : 1) + ' h' : m + ' min';
const gb = n => n ? (n / 1073741824).toFixed(n >= 1.07e10 ? 0 : 1) + ' GB' : '—';
const ago = ts => { if (!ts) return '—'; const d = Math.floor((Date.now() - ts) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 31 ? d + ' days ago' : new Date(ts).toLocaleDateString(); };
const dstr = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const nameOf = id => { const g = S.games.find(x => x.id === String(id)); if (g) return g.name; const l = S.lib && S.lib.games.find(x => x.id === String(id)); return l ? l.name : 'App ' + id; };
const sha = async s => {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dash:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch { let h = 7; for (const c of 'dash:' + s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return String(h); }
};

/* ------------------------------------------------------------------ builders */
const sub = s => s ? `<div class="s">${esc(s)}</div>` : '';
const sic = ic => ic ? `<div class="sic">${icon(ic)}</div>` : '';
const rowA = (k, ic, t, o = {}) => `<div class="fx srow" data-k="${k}"${o.act ? ` data-act="${o.act}"` : ''} data-arg="${esc(o.arg == null ? '' : o.arg)}">${sic(ic)}<div class="stx"><div class="t">${esc(t)}</div>${sub(o.sub)}</div>${o.right != null ? `<div class="sr2">${o.right}</div>` : ''}</div>`;
const rowT = (k, ic, t, key, s) => `<div class="fx srow" data-k="${k}" data-act="toggle" data-arg="${key}">${sic(ic)}<div class="stx"><div class="t">${esc(t)}</div>${sub(s)}</div><div class="sr2"><div class="sw ${S.pref[key] ? 'on' : ''}"><i></i></div></div></div>`;
const rowC = (k, ic, t, key, opts, fmt, s) => `<div class="fx srow" data-k="${k}" data-act="choice" data-slide="${key}" data-opts="${opts.join('|')}">${sic(ic)}<div class="stx"><div class="t">${esc(t)}</div>${sub(s)}</div><div class="sr2">&lsaquo; ${esc(fmt(S.pref[key]))} &rsaquo;</div></div>`;
const rowS = (k, ic, t, key, mn, mx, st, fmt, s) => `<div class="fx srow" data-k="${k}" data-slide="${key}" data-min="${mn}" data-max="${mx}" data-step="${st}">${sic(ic)}<div class="stx"><div class="t">${esc(t)}</div>${sub(s)}</div><div class="sr2"><div class="sl"><i style="width:${(S.pref[key] - mn) / (mx - mn) * 100}%"></i></div><b>${esc(fmt(S.pref[key]))}</b></div></div>`;
const info = (t, v) => `<div class="srow info"><div class="stx"><div class="t">${esc(t)}</div></div><div class="sr2">${esc(v)}</div></div>`;
const head = t => `<div class="sh">${esc(t)}</div>`;
const card = t => `<div class="card">${t}</div>`;
const bar = (p, cls = '') => `<div class="pbar ${cls}"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
const priceH = p => !p || (!p.price && !p.orig) ? '' : `<div class="px">${p.discount ? `<span class="disc">-${p.discount}%</span>` : ''}${p.orig ? `<span class="old">${esc(p.orig)}</span>` : ''}<span class="now">${esc(p.price)}</span></div>`;

/* ---------------------------------------------------------- focus + spatial nav */
function items(root) { return $$('.fx', root).filter(e => e.getClientRects().length); }
function setFx(el, smooth = true) {
  if (fxEl) fxEl.classList.remove('f');
  fxEl = el; if (!el) return;
  el.classList.add('f');
  const v = top(); if (v && el.dataset.k && el.closest('#view')) v.fk = el.dataset.k;
  const beh = smooth && S.pref.motion ? 'smooth' : 'auto', sc = el.closest('.vscroll');
  if (el.closest('.shelf')) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: beh });
  if (!sc || sc.scrollHeight <= sc.clientHeight + 4) { if (!el.closest('.shelf')) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: beh }); return; }
  // vertical: keep headings / non-selectable text next to the focused item visible, and reach the true top / bottom
  const all = items(sc), r = el.getBoundingClientRect(), s0 = sc.getBoundingClientRect(), cur = sc.scrollTop, rel = cur + r.top - s0.top;
  let t = rel - (sc.clientHeight - r.height) / 2;
  if (el === all[0]) t = 0;
  else if (el === all[all.length - 1]) t = sc.scrollHeight;
  else { let p = el.previousElementSibling; if (p && !p.classList.contains('fx') && p.getBoundingClientRect().height < 160) t = Math.min(t, cur + p.getBoundingClientRect().top - s0.top - 60); }
  sc.scrollTo({ top: Math.max(0, t), behavior: beh });
}
function move(dir, root) {
  const els = items(root); if (!els.length) return;
  if (!fxEl || !root.contains(fxEl)) { setFx(els[0]); return; }
  const r = fxEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = Infinity;
  for (const e of els) {
    if (e === fxEl) continue;
    const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy; let s;
    if (dir === 'right' || dir === 'left') {
      if ((dir === 'right' ? dx : -dx) <= r.width * .2) continue;
      if (q.top > r.bottom - 4 || q.bottom < r.top + 4) continue;
      s = Math.abs(dx) + Math.abs(dy) * 2;
    } else {
      if ((dir === 'down' ? dy : -dy) <= r.height * .2) continue;
      s = Math.abs(dy) + Math.abs(dx) * 2.2;
    }
    if (s < bs) { bs = s; best = e; }
  }
  if (best) { setFx(best); D.sfx('move'); }
}
function slide(el, dir) {
  const k = el.dataset.slide; if (!k) return false;
  if (el.dataset.opts) {
    const o = el.dataset.opts.split('|'); let i = o.indexOf(String(S.pref[k])); i = (i + dir + o.length) % o.length;
    D.setPref(k, isNaN(+o[i]) ? o[i] : +o[i]);
  } else {
    const mn = +el.dataset.min, mx = +el.dataset.max, st = +el.dataset.step;
    D.setPref(k, Math.max(mn, Math.min(mx, Math.round((S.pref[k] + dir * st) * 1000) / 1000)));
  }
  D.sfx('move'); V.refresh(); return true;
}
const GLOBAL = {
  toggle(k) { D.setPref(k, !S.pref[k]); V.refresh(); },
  choice(arg, el) { slide(el, 1); },
  page(id) { if (id === 'family' && S.pref.pin) D.requirePin().then(ok => ok && V.open('set', id)); else V.open('set', id); },
  open(id) {
    if (/^\d+$/.test(id)) return V.open('game', id);
    // non-Steam game: Play / home-screen switch / store page (only when Steam has the game) / remove
    const g = S.games.find(x => x.id === id) || {}, d = S.data[id] || {}, r = fxEl.getBoundingClientRect(), it = [];
    it.push({ icon: 'play', label: 'Play', run: () => D.launchGame({ kind: 'game', id, name: g.name, raw: g }, null) });
    it.push({ icon: 'home', label: D.onHome(id) ? 'Hide from home screen' : 'Show on home screen', run: () => { D.toggleHome(id); V.refresh(); } });
    if (d.steamId) it.push({ icon: 'cart', label: 'Store page', run: () => V.open('game', d.steamId) });
    it.push({ icon: 'trash', label: 'Remove from library', run: () => api.gameAction(id, 'removens') });
    D.openMenu(it, { top: Math.min(r.top, innerHeight - 320) + 'px', left: Math.min(r.left + 120, innerWidth - 500) + 'px', transformOrigin: 'top left' }, esc(g.name || 'Game'), 'view');
  },
};
function act(el) {
  if (!el) return; const v = top(), n = el.dataset.act; if (!n) return;
  const fn = (v && v.acts && v.acts[n]) || GLOBAL[n];
  if (fn) { D.sfx('ok'); fn.call(v, el.dataset.arg, el); }
}

/* --------------------------------------------------------------- view stack */
function mount(first) {
  const v = top(), root = $('#view');
  root.className = 'on ' + (v.cls || '') + (first ? ' first' : '');
  root.innerHTML = `<div class="vbg"></div><div class="vhead"><div class="vt">${v.icon ? `<span class="vti">${icon(v.icon)}</span>` : ''}${esc(v.title || '')}</div><div class="vhint"><span><b data-g="A">A</b> Select</span><span><b data-g="B">B</b> Back</span></div></div><div class="vscroll"><div class="vbody ${v.body || 'col'}">${v.html()}</div></div>`;
  fxEl = null; bg(v);
  const k = v.fk; let el = (k && $(`#view .fx[data-k="${CSS.escape(k)}"]`)) || (v.first && $(`#view .fx[data-k="${CSS.escape(v.first)}"]`)) || $('#view .fx');
  if (el) setFx(el, false);
  v.after && v.after();
}
function bg(v) { const b = $('#view .vbg'); if (b) { const u = v.bg && v.bg(); b.style.backgroundImage = u ? `url("${u}")` : 'none'; b.classList.toggle('on', !!u); } }
V.open = (name, arg) => {
  const v = VIEWS[name](arg); v.name = name; STACK.push(v); S.mode = 'view'; mount(true); v.load && v.load(); D.sfx('open');
  return v;
};
V.back = () => {
  const v = top(); if (!v) return; if (v.onBack && v.onBack()) return;
  v.leave && v.leave(); STACK.pop(); D.sfx('back');
  if (!STACK.length) { $('#view').classList.remove('on'); S.mode = 'home'; fxEl = null; D.viewsClosed(); } else mount(false);
};
V.closeAll = () => { while (STACK.length) { const v = STACK.pop(); v.leave && v.leave(); } $('#view').classList.remove('on'); fxEl = null; if (S.mode === 'view') S.mode = 'home'; D.viewsClosed(); };
V.active = () => STACK.length > 0;
V.refresh = function (v) {
  const t = top(); if (!t || (v && v !== t)) return;
  const body = $('#view .vbody'), sc = $('#view .vscroll'); if (!body) return;
  const st = sc.scrollTop, k = (fxEl && fxEl.closest('#view') && fxEl.dataset.k) || t.fk;
  body.innerHTML = t.html(); sc.scrollTop = st; bg(t);
  const el = (k && $(`#view .fx[data-k="${CSS.escape(k)}"]`)) || $('#view .fx');
  fxEl = null; if (el) { el.classList.add('f'); fxEl = el; t.fk = el.dataset.k; }
  t.after && t.after();
};
V.key = k => {
  const v = top(); if (!v) return;
  if (k === 'back') return V.back();
  if (v.key && v.key(k)) return;
  if (['left', 'right', 'up', 'down'].includes(k)) {
    if ((k === 'left' || k === 'right') && fxEl && fxEl.dataset.slide && slide(fxEl, k === 'left' ? -1 : 1)) return;
    return move(k, $('#view'));
  }
  if (k === 'ok') return act(fxEl);
  if (k === 'options') return v.opt && v.opt(fxEl);
  if (k === 'lb' || k === 'rb') return v.tab && v.tab(k === 'lb' ? -1 : 1);
};
V.focus = el => setFx(el, false);
V.click = el => { if (!el.closest('#view')) return; setFx(el, false); act(el); };

/* --------------------------------------------------- dialogs / keyboard / media */
function overlay(id) { return $('#' + id); }
let dlgS = null;
V.dlg = o => {
  const el = overlay('dlg'); dlgS = { prev: S.mode, prevFx: fxEl && fxEl.dataset.k, btns: o.buttons };
  el.innerHTML = `<div class="dbox"><div class="dt">${esc(o.title)}</div>${o.msg ? `<div class="dm">${esc(o.msg)}</div>` : ''}<div class="dbtn">${o.buttons.map((b, i) => `<div class="fx btn w" data-k="d${i}" data-act="dbtn" data-arg="${i}">${esc(b.label)}</div>`).join('')}</div></div>`;
  el.classList.add('on'); S.mode = 'dlg'; setFx($('.fx', el), false); D.sfx('open');
};
function closeDlg() { overlay('dlg').classList.remove('on'); S.mode = dlgS.prev; const k = dlgS.prevFx; dlgS = null; fxEl = null; const e = k && $(`#view .fx[data-k="${CSS.escape(k)}"]`); if (e) setFx(e, false); }
V.dlgKey = k => {
  const el = overlay('dlg');
  if (k === 'back') { D.sfx('back'); return closeDlg(); }
  if (['left', 'right', 'up', 'down'].includes(k)) return move(k, el);
  if (k === 'ok' && fxEl) { const b = dlgS.btns[+fxEl.dataset.arg]; D.sfx('ok'); closeDlg(); b && b.run && b.run(); }
};

let osk = null;
const KEYS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function oskHtml() {
  const o = osk.o, sh = osk.shift;
  if (o.numeric) {
    const k = c => `<div class="fx okey" data-k="k${c}" data-act="key" data-arg="${c}">${c}</div>`;
    return `<div class="orows num">${['123', '456', '789'].map(r => `<div class="orow">${[...r].map(k).join('')}</div>`).join('')}<div class="orow"><div class="fx okey" data-k="kbs" data-act="bs">${icon('backspace')}</div>${k('0')}<div class="fx okey ok2" data-k="kdone" data-act="done">&#10003;</div></div><div class="orow"><div class="fx okey wd" data-k="kcancel" data-act="cancel">Cancel</div></div></div>`;
  }
  const sym = osk.sym, R = sym ? ['1234567890', '@#$%&*+=()', '!?:;"\'/\\_~', '[]{}<>^|`'] : KEYS;
  const row = (r, n) => `<div class="orow">${n === 3 ? `<div class="fx okey wd ${sh ? 'on' : ''}" data-k="kshift" data-act="shift">${icon('shiftup')}</div>` : ''}${[...r].map(c => { const ch = sh && !sym ? c.toUpperCase() : c; return `<div class="fx okey" data-k="k${c}" data-act="key" data-arg="${esc(ch)}">${esc(ch)}</div>`; }).join('')}${n === 3 ? `<div class="fx okey wd" data-k="kbs" data-act="bs">${icon('backspace')}</div>` : ''}</div>`;
  return `<div class="orows">${R.map(row).join('')}<div class="orow"><div class="fx okey wd ${sym ? 'on' : ''}" data-k="ksym" data-act="sym">${sym ? 'ABC' : '.?123'}</div><div class="fx okey" data-k="kcomma" data-act="key" data-arg=",">,</div><div class="fx okey sp" data-k="kspace" data-act="key" data-arg=" ">Space</div><div class="fx okey" data-k="kdot" data-act="key" data-arg=".">.</div><div class="fx okey" data-k="kdash" data-act="key" data-arg="-">-</div><div class="fx okey wd ok2" data-k="kdone" data-act="done">Done</div></div><div class="ohint"><span><b data-g="LT">LT</b> Backspace</span><span><b data-g="RT">RT</b> Space</span><span><b data-g="Y">Y</b> Shift</span><span><b data-g="LB">LB</b> Symbols</span><span><b data-g="RB">RB</b> Done</span><span><b data-g="B">B</b> Cancel</span></div></div>`;
}
function oskShow() {
  const o = osk.o, val = o.secret ? '&bull;'.repeat(osk.val.length) : esc(osk.val);
  $('#osk .oin').innerHTML = (val || `<span class="ph">${esc(o.placeholder || '')}</span>`) + '<span class="caret"></span>';
}
V.osk = o => new Promise(res => {
  const el = overlay('osk');
  osk = { o, val: o.value || '', shift: false, res, prev: S.mode, prevFx: fxEl && fxEl.closest('#view') ? fxEl.dataset.k : null };
  el.classList.toggle('compact', !!o.compact); document.body.classList.toggle('oskc', !!o.compact); el.innerHTML = `<div class="obox"><div class="otl">${esc(o.title || '')}</div><div class="oin"></div>${oskHtml()}</div>`;
  el.classList.add('on'); S.mode = 'osk'; oskShow(); setFx($('.okey', el), false); D.sfx('open');
});
function oskClose(val) {
  const o = osk; osk = null; overlay('osk').classList.remove('on'); document.body.classList.remove('oskc'); S.mode = o.prev; fxEl = null;
  const e = o.prevFx && $(`#view .fx[data-k="${CSS.escape(o.prevFx)}"]`); if (e) setFx(e, false);
  o.res(val);
}
const oskType = ch => { const o = osk.o; if (o.max && osk.val.length >= o.max) return; osk.val += ch; oskShow(); o.live && o.live(osk.val); if (o.numeric && o.max && osk.val.length >= o.max && o.auto) oskClose(osk.val); };
const oskBs = () => { osk.val = osk.val.slice(0, -1); oskShow(); osk.o.live && osk.o.live(osk.val); };
V.oskInput = key => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) { osk.nav = true; return V.oskKey(key.slice(5).toLowerCase()); }
  if (key === 'Enter') { if (osk.nav) return V.oskKey('ok'); D.sfx('ok'); oskClose(osk.val); }
  else if (key === 'Escape') { D.sfx('back'); oskClose(null); }
  else if (key === 'Backspace') oskBs();
  else if (key.length === 1) { osk.nav = false; oskType(key); }
};
const oskRedraw = fk => { $('#osk .obox').innerHTML = `<div class="otl">${esc(osk.o.title || '')}</div><div class="oin"></div>${oskHtml()}`; oskShow(); const e = $(`#osk .fx[data-k="${fk}"]`) || $('#osk .okey'); setFx(e, false); D.sfx('move'); };
V.oskKey = k => {
  const el = overlay('osk');
  if (k === 'back') { D.sfx('back'); return oskClose(null); }
  if (k === 'options') return oskBs();
  if (k === 'search' && !osk.o.numeric) { osk.shift = !osk.shift; return oskRedraw('kshift'); }
  if (k === 'lb' && !osk.o.numeric) { osk.sym = !osk.sym; return oskRedraw('ksym'); }
  if (k === 'rb') { D.sfx('ok'); return oskClose(osk.val); }
  if (['left', 'right', 'up', 'down'].includes(k)) return move(k, el);
  if (k === 'ok' && fxEl) {
    const a = fxEl.dataset.act; D.sfx('ok');
    if (a === 'key') oskType(fxEl.dataset.arg);
    else if (a === 'bs') oskBs();
    else if (a === 'shift') { osk.shift = !osk.shift; $('#osk .obox').innerHTML = `<div class="otl">${esc(osk.o.title || '')}</div><div class="oin"></div>${oskHtml()}`; oskShow(); setFx($('#osk .fx[data-k="kshift"]'), false); }
    else if (a === 'sym') { osk.sym = !osk.sym; $('#osk .obox').innerHTML = `<div class="otl">${esc(osk.o.title || '')}</div><div class="oin"></div>${oskHtml()}`; oskShow(); setFx($('#osk .fx[data-k="ksym"]'), false); }
    else if (a === 'done') oskClose(osk.val);
    else if (a === 'cancel') oskClose(null);
  }
};

D.requirePin = async () => {
  if (!S.pref.pin) return true;
  for (let i = 0; i < 3; i++) {
    const v = await V.osk({ title: i ? 'Incorrect PIN. Try again' : 'Enter PIN', numeric: true, secret: true, max: 4, auto: true });
    if (v === null) return false;
    if (await sha(v) === S.pref.pin) return true;
  }
  D.toast('Too many wrong attempts.'); return false;
};

/* lightbox */
let lb = null;
V.lightbox = (list, i) => {
  const el = overlay('lb'); lb = { list, i, prev: S.mode }; S.mode = 'lightbox'; el.classList.add('on'); lbShow(); D.sfx('open');
};
function lbShow() {
  const it = lb.list[lb.i];
  $('#lb').innerHTML = `<img src="${esc(it.src)}"><div class="lbc"><div>${esc(it.cap || '')}</div><div>${lb.i + 1} / ${lb.list.length}</div></div>${lb.list.length > 1 ? '<div class="lba l">&lsaquo;</div><div class="lba r">&rsaquo;</div>' : ''}`;
  $('#lb img').animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,.9,.24,1)' });
}
V.lbKey = k => {
  if (k === 'back') { $('#lb').classList.remove('on'); S.mode = lb.prev; lb = null; D.sfx('back'); return; }
  if (k === 'left' && lb.i > 0) { lb.i--; lbShow(); D.sfx('move'); }
  if (k === 'right' && lb.i < lb.list.length - 1) { lb.i++; lbShow(); D.sfx('move'); }
};

/* trailer player */
let pl = null;
const tfmt = t => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
V.player = (url, title) => {
  const el = overlay('pl'); pl = { prev: S.mode, speed: 1, idle: 0, vol: Math.min(1, S.pref.vol * 1.4) }; S.mode = 'player';
  el.innerHTML = `<video src="${esc(url)}" autoplay playsinline></video>
    <div class="plt"><div class="plx fx-no" data-a="close">${icon('chev')}</div><div class="pltt">${esc(title || 'Video')}</div></div>
    <div class="plmid"><div class="plspin"></div><div class="plpp">${icon('pause')}</div></div>
    <div class="plc"><div class="plbar" data-a="seek"><i class="pbuf"></i><i class="pcur"></i><b class="pknob"></b></div>
      <div class="plr"><span class="tcur">0:00</span><div class="plbtns"><div class="pb" data-a="b10">&minus;10</div><div class="pb big" data-a="play">${icon('pause')}</div><div class="pb" data-a="f10">+10</div></div><span class="tdur">0:00</span></div>
      <div class="plx2"><div class="plvol" data-a="vol">${icon('volume')}<div class="plvb"><i></i></div></div><div class="plsp" data-a="speed">1×</div><div class="plh"><b data-g="A">A</b> Select &nbsp; D-pad Move &nbsp; <b data-g="LB">LB</b> / <b data-g="RB">RB</b> Seek 10 s &nbsp; <b data-g="X">X</b> Speed &nbsp; <b data-g="Y">Y</b> Mute &nbsp; <b data-g="B">B</b> Close</div></div></div>`;
  el.classList.add('on'); el.classList.remove('idle'); D.stopOst(); D.stopTrailer();
  const vd = $('video', el); vd.volume = pl.vol; vd.muted = S.pref.muted; pl.v = vd;
  const q = s => $(s, el), setPP = () => { const ic = vd.paused ? icon('play') : icon('pause'); q('.pb.big').innerHTML = ic; q('.plpp').innerHTML = ic; el.classList.toggle('paused', vd.paused); };
  const wake = () => { el.classList.remove('idle'); clearTimeout(pl.idleT); pl.idleT = setTimeout(() => { if (!vd.paused) el.classList.add('idle'); }, 3200); };
  pl.wake = wake; pl.setPP = setPP;
  const upd = () => { const d = vd.duration || 0, c = vd.currentTime || 0; q('.pcur').style.width = (d ? c / d * 100 : 0) + '%'; q('.pknob').style.left = (d ? c / d * 100 : 0) + '%'; q('.tcur').textContent = tfmt(c); q('.tdur').textContent = d && isFinite(d) ? tfmt(d) : '--:--'; try { if (vd.buffered.length) q('.pbuf').style.width = (vd.buffered.end(vd.buffered.length - 1) / (d || 1) * 100) + '%'; } catch {} q('.plvb i').style.width = (vd.muted ? 0 : vd.volume * 100) + '%'; };
  vd.ontimeupdate = upd; vd.onprogress = upd; vd.onloadedmetadata = upd; vd.onvolumechange = upd; vd.onplay = () => { setPP(); wake(); }; vd.onpause = () => { setPP(); wake(); };
  vd.onwaiting = () => el.classList.add('buf'); vd.onplaying = () => el.classList.remove('buf'); vd.oncanplay = () => el.classList.remove('buf');
  vd.onended = () => { el.classList.remove('idle'); el.classList.add('paused'); setPP(); };
  vd.onerror = () => { q('.pltt').textContent = 'This video could not be played.'; el.classList.remove('idle', 'buf'); };
  el.onmousemove = wake; el.onclick = e => {
    const t = e.target.closest('[data-a]'); wake();
    if (!t) return vd.paused ? vd.play() : vd.pause();
    const a = t.dataset.a;
    if (a === 'seek') { const r = t.getBoundingClientRect(); if (vd.duration) vd.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * vd.duration; }
    else if (a === 'play') (vd.paused ? vd.play() : vd.pause()); else if (a === 'b10') vd.currentTime = Math.max(0, vd.currentTime - 10); else if (a === 'f10') vd.currentTime += 10; else if (a === 'speed') V.plKey('options'); else if (a === 'close') V.plKey('back');
    else if (a === 'vol') { const r = t.querySelector('.plvb').getBoundingClientRect(); if (e.clientX >= r.left) { vd.muted = false; vd.volume = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); } else vd.muted = !vd.muted; }
  };
  pl.f = 3; setPP(); upd(); wake(); plFocus();
};
const PLF = ['close', 'seek', 'b10', 'play', 'f10', 'vol', 'speed'];
const plFocus = () => { const el = $('#pl'); if (!el || !pl) return; $$('[data-a]', el).forEach(n => n.classList.toggle('pf', n.dataset.a === PLF[pl.f])); };
V.plKey = k => {
  if (!pl) return; const vd = pl.v, el = $('#pl'); pl.wake(); if (pl.f == null) pl.f = 3;
  const cur = PLF[pl.f], seekBy = d => { vd.currentTime = Math.max(0, Math.min(vd.duration || 1e9, vd.currentTime + d)); };
  if (k === 'back') { clearTimeout(pl.idleT); el.classList.remove('on'); setTimeout(() => { el.innerHTML = ''; }, 300); S.mode = pl.prev; pl = null; D.playOst(D.cur()); D.sfx('back'); return; }
  if (k === 'lb') seekBy(-10); else if (k === 'rb') seekBy(10);
  else if (k === 'options') { const S2 = [1, 1.25, 1.5, 2, .75]; pl.speed = S2[(S2.indexOf(pl.speed) + 1) % S2.length]; vd.playbackRate = pl.speed; $('.plsp', el).textContent = pl.speed + '×'; }
  else if (k === 'search') vd.muted = !vd.muted;
  else if (k === 'lt') seekBy(-30); else if (k === 'rt') seekBy(30);
  else if (k === 'ok') {
    if (cur === 'close') return V.plKey('back');
    if (cur === 'b10') seekBy(-10); else if (cur === 'f10') seekBy(10);
    else if (cur === 'vol') vd.muted = !vd.muted;
    else if (cur === 'speed') return V.plKey('options');
    else vd.paused ? vd.play() : vd.pause();
  }
  else if (k === 'left' || k === 'right') {
    const d = k === 'left' ? -1 : 1;
    if (cur === 'seek') seekBy(d * 10); else if (cur === 'vol') { vd.muted = false; vd.volume = Math.max(0, Math.min(1, vd.volume + d * .1)); }
    else { const n = Math.max(2, Math.min(PLF.length - 1, pl.f + d)); if (cur === 'close') pl.f = 3; else pl.f = n; D.sfx('move'); }
  }
  else if (k === 'up') { pl.f = cur === 'close' ? 0 : cur === 'seek' ? 0 : 1; D.sfx('move'); }
  else if (k === 'down') { pl.f = cur === 'close' ? 1 : cur === 'seek' ? 3 : pl.f; D.sfx('move'); }
  plFocus();
};

/* =========================================================== SETTINGS PAGES */
const SETTINGS = [
  ['guide', 'doc', "User's Guide, Health and Safety, and Other Information"], ['access', 'access', 'Accessibility'], ['network', 'globe', 'Network'], ['bluetooth', 'link', 'Bluetooth'],
  ['profile', 'face', 'Profile'], ['users', 'face', 'Users and Accounts'], ['family', 'people', 'Family and Parental Controls'], ['system', 'cube', 'System'], ['storage', 'disk', 'Storage'],
  ['sound', 'volume', 'Sound'], ['screen', 'screen', 'Screen and Video'], ['accessories', 'keyboard', 'Accessories'],
  ['saved', 'pad', 'Saved Data and Game/App Settings'], ['notifs', 'bell', 'Notifications'], ['captures', 'camera', 'Captures and Broadcasts'],
  ['interface', 'grid', 'Interface'], ['library', 'layers', 'Library and Home Screen'], ['ingame', 'pad', 'In-Game'], ['social', 'people', 'Friends and Chat'],
  ['custom', 'sparkle', 'Customization'], ['controller', 'pad', 'Controller and Steam Input'], ['power', 'bolt', 'Power and Performance'],
];
const pct = v => Math.round(v * 100) + '%';
const onoff = v => v ? 'On' : 'Off';
const CONTROLS = [['Move', 'D-pad / Left stick / Arrow keys'], ['Select', D.g('A') + ' / Enter / Space'], ['Back', D.g('B') + ' / Esc / Backspace / Right click'], ['Options', D.g('X')],
  ['Search', 'Y / F'], ['Switch tab', 'LB, RB / Q, E / Tab'], ['Control Center', 'Guide, Start / F1 / Home'], ['Backspace (keyboard screen)', 'X'],
  ['Screenshot', 'F12, or Ctrl+Alt+S from anywhere'], ['Return to betterSBP after a game', 'Ctrl+Alt+D'], ['Quit', 'Ctrl+Q']];

const PAGES = {
  guide: () => ({ title: "User's Guide, Health and Safety, and Other Information", d: null, load() { api.sys().then(d => { this.d = d; V.refresh(this); }); },
    html() {
      const d = this.d || {};
      return head('Controls') + CONTROLS.map(([a, b]) => info(a, b)).join('') + head('Health and safety') +
        card('Take a break of at least 10 minutes every hour. Play in a well-lit room, sit at a comfortable distance from the screen, and stop if you feel dizzy, nauseous or get headaches. A small number of people experience seizures when exposed to flashing lights or patterns; if you or a family member has a history of this, talk to a doctor before playing.') +
        head('About') + info('betterSBP', d.app ? 'Version ' + d.app : '') + info('Electron', d.versions ? d.versions.electron : '') + info('Chromium', d.versions ? d.versions.chrome : '') +
        info('Steam folder', d.steamPath || 'Not found') + info('Data folder', d.cacheDir || '');
    } }),

  access: () => ({ title: 'Accessibility',
    html: () => head('Display') + rowT('a1', 'screen', 'Large text', 'largeText', 'Makes all text and buttons about 15% bigger.') +
      rowT('a2', 'access', 'High contrast', 'contrast', 'Stronger outlines and a darker background for easier reading.') +
      rowT('a3', 'layers', 'Animations', 'motion', 'Turn off to remove screen transitions and movement.') +
      head('Feedback') + rowT('a4', 'volume', 'Sound effects', 'sfx', 'Menu navigation sounds.') + rowT('a5', 'pad', 'Controller vibration', 'haptics', 'A light buzz when you move through menus.') }),

  network: () => ({ title: 'Network', d: null, t: null, w: null, busy: '', iv: null,
    load() { api.net().then(d => { this.d = d; V.refresh(this); }); this.run(); this.scan(); },
    after() { clearInterval(this.iv); this.iv = setInterval(() => { if (top() === this && !this.busy) { this.scan(); api.net().then(d => { this.d = d; }); } }, 9000); },
    leave() { clearInterval(this.iv); },
    scan() { Promise.resolve(api.wifiList()).then(w => { this.w = w || { ok: false }; if (top() === this) V.refresh(this); }); },
    run() { this.t = 'testing'; V.refresh(this); api.netTest().then(r => { this.t = r; V.refresh(this); }); },
    html() {
      const d = this.d, t = this.t, w = this.w, st = x => x === 'testing' ? 'Testing…' : (x && x.ok ? `Connected (${x.ms} ms)` : 'Not reachable');
      let o = head('Connection status') + info('Internet', t ? st(t === 'testing' ? t : t.internet) : '…') + info('Steam servers', t ? st(t === 'testing' ? t : t.steam) : '…') +
        rowA('n-test', 'restart', 'Test Internet Connection', { act: 'test', sub: 'Checks your connection and Steam.' }) + head('Wi-Fi');
      if (this.busy) o += info(this.busy, 'Please wait…');
      if (!w) o += info('Looking for networks', '…');
      else if (!w.ok) o += info('Wi-Fi', w.msg || 'No Wi-Fi adapter found. A wired connection works too.');
      else {
        o += w.list.length ? w.list.map((n, i) => rowA('w-' + i, n.secure ? 'lock' : 'wifi', n.ssid, { act: 'wnet', arg: i, sub: n.connected ? 'Connected · ' + n.signal + '% signal' : (n.saved ? 'Saved · ' : '') + n.signal + '% signal' + (n.secure ? '' : ' · Open'), right: n.connected ? '<span class="cki">' + icon('check') + '</span>' : '' })).join('') : info('No networks found', 'Move closer to your router');
        o += rowA('w-scan', 'restart', 'Scan again', { act: 'wscan' }) + rowA('w-hid', 'plus', 'Join a hidden network', { act: 'whid', sub: 'Type its name and password.' });
      }
      o += head('Details') + (d && d.wifi ? info('Wi-Fi network', d.wifi.ssid) + (d.wifi.signal != null ? info('Signal strength', d.wifi.signal + '%') : '') + (d.wifi.rate ? info('Link speed', d.wifi.rate + ' Mbps') : '') : '') +
        (d ? d.ifaces.map(i => info(i.name, i.ip)).join('') || info('IP address', 'Not connected') : info('Adapters', '…'));
      return o + head('More') + rowA('n-bt', 'link', 'Bluetooth', { act: 'bt', sub: 'Pair headphones, controllers and keyboards.' });
    },
    async join(ssid, auth, pw) {
      this.busy = 'Connecting to ' + ssid; V.refresh(this);
      const r = await api.wifiConnect(ssid, pw, auth); this.busy = ''; D.toast((r && r.msg) || (r && r.ok ? 'Connected.' : 'Could not connect.')); this.scan(); api.net().then(d => { this.d = d; V.refresh(this); });
    },
    acts: {
      test() { this.run(); }, wscan() { this.w = null; V.refresh(this); this.scan(); }, bt() { V.openSettingsPage('bluetooth'); },
      wnet(i) {
        const n = this.w.list[+i], me = this;
        if (n.connected) return D.openMenu([{ icon: 'x', label: 'Disconnect', run: async () => { await api.wifiDisconnect(); D.toast('Disconnected.'); me.scan(); } }, { icon: 'trash', label: 'Forget this network', run: async () => { await api.wifiForget(n.ssid); D.toast('Forgot ' + n.ssid + '.'); me.scan(); } }], { top: '22%', left: '30rem', transformOrigin: 'top left' }, n.ssid, 'view');
        if (n.saved || !n.secure) { const it = [{ icon: 'wifi', label: 'Connect', run: () => me.join(n.ssid, n.auth, '') }]; if (n.saved) it.push({ icon: 'trash', label: 'Forget this network', run: async () => { await api.wifiForget(n.ssid); D.toast('Forgot ' + n.ssid + '.'); me.scan(); } }); return D.openMenu(it, { top: '22%', left: '30rem', transformOrigin: 'top left' }, n.ssid, 'view'); }
        V.osk({ title: 'Password for ' + n.ssid, secret: true, max: 63 }).then(p => { if (p) me.join(n.ssid, n.auth, p); });
      },
      whid() { const me = this; V.osk({ title: 'Network name', max: 32 }).then(s => { if (s && s.trim()) V.osk({ title: 'Password (leave empty if open)', secret: true, max: 63 }).then(p => { if (p !== null) me.join(s.trim(), p ? 'WPA2-Personal' : 'Open', p); }); }); },
    } }),

  bluetooth: () => ({ title: 'Bluetooth', l: null, busy: '', iv: null,
    load() { this.scan(); }, after() { clearInterval(this.iv); this.iv = setInterval(() => { if (top() === this && !this.busy) this.scan(); }, 12000); }, leave() { clearInterval(this.iv); },
    scan() { Promise.resolve(api.btList()).then(l => { this.l = l || { ok: false }; if (top() === this) V.refresh(this); }); },
    html() {
      const l = this.l; let o = head('Devices');
      if (this.busy) o += info(this.busy, 'Please wait…');
      if (!l) return o + info('Looking for devices', 'This takes a few seconds…');
      if (!l.ok) return o + info('Bluetooth', l.msg || 'Bluetooth is not available.') + rowA('b-scan', 'restart', 'Try again', { act: 'bscan' });
      const dev = (n, i) => rowA('b-' + i, 'link', n.name || 'Unknown device', { act: 'bdev', arg: i, sub: n.connected ? 'Connected' : n.paired ? 'Paired' : 'Available to pair', right: n.connected ? '<span class="cki">' + icon('check') + '</span>' : '' });
      const mine = l.list.map((n, i) => [n, i]).filter(x => x[0].paired), near = l.list.map((n, i) => [n, i]).filter(x => !x[0].paired);
      o += mine.length ? mine.map(x => dev(...x)).join('') : info('No paired devices', 'Put a device in pairing mode, then scan');
      o += head('Nearby') + (near.length ? near.map(x => dev(...x)).join('') : info('Nothing new nearby', 'Turn on pairing mode on your device')) + rowA('b-scan', 'restart', 'Scan again', { act: 'bscan' });
      return o;
    },
    async job(msg, p) { this.busy = msg; V.refresh(this); const r = await p; this.busy = ''; D.toast((r && r.msg) || (r && r.ok ? 'Done.' : 'That did not work.')); this.scan(); },
    acts: {
      bscan() { this.l = null; V.refresh(this); this.scan(); },
      bdev(i) {
        const n = this.l.list[+i], me = this, M = { top: '22%', left: '30rem', transformOrigin: 'top left' };
        if (!n.paired) return D.openMenu([{ icon: 'plus', label: 'Pair', run: () => me.job('Pairing with ' + n.name, api.btPair(n.id)) }], M, n.name, 'view');
        D.openMenu([{ icon: 'link', label: n.connected ? 'Reconnect' : 'Connect', run: () => me.job('Connecting to ' + n.name, api.btConnect(n.id)) }, { icon: 'trash', label: 'Remove device', run: () => me.job('Removing ' + n.name, api.btUnpair(n.id)) }], M, n.name, 'view');
      },
    } }),

  users: () => ({ title: 'Users and Accounts', d: null,
    load() { api.sys().then(d => { this.d = d; V.refresh(this); }); Promise.resolve(api.chatStatus && api.chatStatus()).then(c => { if (c) { S.chat = c; V.refresh(this); } }); },
    html() {
      const d = this.d || {}, u = d.user, c = S.chat || { state: 'out' }, on = c.state === 'in';
      return head('Steam account') +
        (on ? `<div class="fx srow acctrow" data-k="u-me"><div class="ucirc sm">${c.avatar ? `<img src="${esc(c.avatar)}">` : icon('user')}</div><div class="stx"><div class="t">${esc(c.name || c.account || 'Signed in')}</div><div class="s">Signed in to Steam</div></div></div>`
          : info('Status', c.state === 'connecting' ? 'Signing in…' : 'Not signed in')) +
        (on ? rowA('u-prof', 'edit', 'Edit profile', { act: 'prof' }) + rowA('u-out2', 'power', 'Sign out of Steam', { act: 'signout', sub: 'Chat, friends and downloads need an account.' })
            : rowA('u-in', 'steam', 'Sign in to Steam', { act: 'signin', sub: 'With your gamepad, a QR code or your password.' })) +
        head('Steam ID') + info('Steam ID', c.me || '—') +
        head('Local Steam profile') + rowA('u-loc', 'user', 'Use the profile of the Steam app on this PC', { act: 'loc', right: S.pref.useLocal ? 'On' : 'Off', sub: 'Off by default. Your in-app sign-in decides who you are. Turn on to also read the name and picture of the account last used in the Steam app (needs a restart).' }) +
        head('Session') + rowA('u-out', 'power', 'Close betterSBP', { act: 'quit', sub: 'Steam keeps running if it was open.' });
    },
    acts: {
      signin() { V.open('steamlogin'); }, prof() { V.openSettingsPage('profile'); },
      signout() { api.chatLogout && api.chatLogout(); S.chat = { state: 'out' }; D.toast('Signed out of Steam.'); V.refresh(); },
      quit() { api.quit(); },
      loc() { const on = !S.pref.useLocal; D.setPref('useLocal', on); api.cfgSet && api.cfgSet({ useLocalProfile: on }); D.toast(on ? 'Restart betterSBP to use the local profile.' : 'Local profile off. Restart betterSBP to apply.'); V.refresh(); },
    } }),

  family: () => ({ title: 'Family and Parental Controls',
    html() { return rowT('f-share', 'people', 'Show family-shared games in my library', 'familyShare', 'Shared games appear in your library and can be launched like your own.') + this.h2(); },
    h2: () => head('Game launch lock') + rowA('f-pin', 'access', 'Launch PIN', { act: 'pin', right: S.pref.pin ? 'On' : 'Off', sub: 'When on, a 4-digit PIN is needed to start any game and to open this page.' }) +
      head('Play time') + rowC('f-rem', 'clock', 'Break reminder', 'remind', [0, 30, 60, 120], m => m ? 'Every ' + (m >= 60 ? m / 60 + ' h' : m + ' min') : 'Off', 'Shows a reminder while betterSBP is open.') +
      head('Hidden games') + card('Games you hide stay installed but disappear from the home row. Manage them in Saved Data and Game/App Settings.'),
    acts: {
      pin() {
        const ask = t => V.osk({ title: t, numeric: true, secret: true, max: 4, auto: true });
        const setNew = async () => { const a = await ask('Choose a 4-digit PIN'); if (a === null || a.length < 4) return; const b = await ask('Enter it again'); if (a !== b) { D.toast('PINs did not match.'); return; } D.setPref('pin', await sha(a)); D.toast('PIN set.'); V.refresh(); };
        if (!S.pref.pin) setNew();
        else V.dlg({ title: 'Launch PIN', msg: 'A PIN is currently set.', buttons: [{ label: 'Change PIN', run: setNew }, { label: 'Remove PIN', run: () => { D.setPref('pin', ''); D.toast('PIN removed.'); V.refresh(); } }, { label: 'Cancel' }] });
      } } }),

  system: () => ({ title: 'System', d: null, load() { api.sys().then(d => { this.d = d; V.refresh(this); }); },
    html() {
      const d = this.d || {}, up = d.uptime ? Math.floor(d.uptime / 3600) + ' h ' + Math.floor(d.uptime % 3600 / 60) + ' min' : '—';
      return head('This PC') + info('Device name', d.host || '—') + info('System', d.platform ? `${d.platform === 'win32' ? 'Windows' : d.platform} ${d.release || ''} (${d.arch || ''})` : '—') +
        info('Processor', d.cpu ? `${d.cpu} (${d.cores} threads)` : '—') + info('Memory', d.mem ? `${gb(d.mem - d.free)} used of ${gb(d.mem)}` : '—') + info('Graphics', d.gpu || '—') +
        info('Screen', `${screen.width} × ${screen.height}`) + info('Time since startup', up) +
        head('betterSBP') + rowT('y-start', 'power', 'Start betterSBP when Windows starts', 'startup', 'Opens fullscreen after you sign in.') +
        rowA('y-rel', 'restart', 'Restart betterSBP', { act: 'rel' }) + rowA('y-quit', 'circle', 'Close betterSBP', { act: 'quit' });
    }, acts: { rel() { api.relaunch(); }, quit() { api.quit(); } } }),

  storage: () => ({ title: 'Storage', d: null, load() { api.storage().then(d => { this.d = d; V.refresh(this); }); },
    html() {
      const d = this.d; if (!d) return card('Reading drives…');
      let o = head('Steam library drives');
      o += d.libs.length ? d.libs.map(l => l.total ? `<div class="srow info stor"><div class="stx"><div class="t">${esc(l.path)}</div>${bar((1 - l.free / l.total) * 100)}</div><div class="sr2">${gb(l.free)} free of ${gb(l.total)}</div></div>` : info(l.path, '—')).join('') : info('No Steam library found', '');
      o += head('Largest installed games') + (d.games.slice(0, 8).map(g => info(g.name, gb(g.size))).join('') || info('No games installed', ''));
      o += head('betterSBP data') + info('Artwork and info cache', gb(d.cache.art)) + info('Soundtrack cache', gb(d.cache.ost)) +
        rowA('t-art', 'restart', 'Clear artwork cache', { act: 'clr', arg: 'art', sub: 'Artwork is downloaded again when needed.' }) + rowA('t-ost', 'music', 'Clear soundtrack cache', { act: 'clr', arg: 'ost', sub: 'Soundtracks are searched and downloaded again.' });
      return o;
    },
    acts: { clr(k) { V.dlg({ title: k === 'art' ? 'Clear artwork cache?' : 'Clear soundtrack cache?', msg: 'This frees disk space. Nothing in your Steam library is touched.', buttons: [{ label: 'Clear', run: () => { if (k === 'ost') D.stopOst(true); api.clearCache(k).then(() => { D.toast('Cache cleared.'); if (k === 'art') D.reloadAll(); this.load(); }); } }, { label: 'Cancel' }] }); } } }),

  sound: () => ({ title: 'Sound',
    html: () => head('Volume') + rowS('o1', 'volume', 'betterSBP volume', 'vol', 0, 1, .05, pct, 'Menu sounds, game music and trailers. Game volume is set in Windows.') +
      rowT('o2', 'volume', 'Mute everything', 'muted') + head('Options') + rowT('o3', 'music', 'Game music', 'music', 'Plays a soundtrack when you hover a game.') +
      rowT('o4', 'bell', 'Sounds', 'sfx', 'Menu click and navigation sounds.') + rowT('o5', 'video', 'Trailer sound', 'trailerSound', 'Only used when a game has no soundtrack.') }),

  screen: () => ({ title: 'Screen and Video',
    html: () => head('Display') + rowT('v1', 'screen', 'Fullscreen', 'fullscreen', 'Turn off to run betterSBP in a window.') + rowT('v0', 'bolt', 'Performance mode', 'lite', 'Turns off blur, glass and background motion. Much lighter on your PC.') +
      rowS('v2', 'screen', 'Interface size', 'scale', 70, 130, 5, v => v + '%', 'Scales everything on screen.') +
      head('Effects') + rowT('v3', 'layers', 'Animations', 'motion') + rowT('v4', 'video', 'Background trailers', 'trailers', 'Plays a game trailer behind the title after a short pause.') +
      rowC('v5', 'clock', 'Trailer delay', 'trailerDelay', [1, 3, 6], v => v + ' s') + info('Resolution', `${innerWidth} × ${innerHeight}`) }),

  accessories: () => ({ title: 'Accessories', iv: null,
    after() { clearInterval(this.iv); this.iv = setInterval(() => { if (top() === this) V.refresh(this); }, 900); }, leave() { clearInterval(this.iv); },
    html() {
      const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean), N = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Guide'];
      let o = head('Controllers');
      o += pads.length ? pads.map((p, i) => info(p.id.replace(/\s*\(.*$/, '').slice(0, 44) || 'Controller ' + (i + 1), 'Connected') +
        info('Buttons pressed', p.buttons.map((b, j) => b.pressed ? (N[j] || 'B' + j) : null).filter(Boolean).join(' ') || 'Press a button to test')).join('') : info('No controller detected', 'Press a button on your controller');
      return o + rowA('x-vib', 'pad', 'Test vibration', { act: 'vib' }) + rowT('x-hap', 'pad', 'Controller vibration in menus', 'haptics') +
        head('Button layout') + rowC('x-lay', 'pad', 'Button symbols', 'padLayout', ['auto', 'xbox', 'ps'], x => ({ auto: 'Detect my controller', xbox: 'Xbox (A B X Y)', ps: 'PlayStation (✕ ○ □ △)' }[x]), 'Shown in every button hint across betterSBP.') + head('Keyboard and mouse') + info('Keyboard', 'Always available') + info('Mouse', 'Click anything, scroll to move') +
        head('Pairing') + rowA('x-bt', 'keyboard', 'Pair a new Bluetooth device', { act: 'bt', sub: 'Pair headphones, controllers and keyboards here.' });
    },
    acts: { vib() { const p = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean), a = p && p.vibrationActuator; if (a) a.playEffect('dual-rumble', { duration: 400, strongMagnitude: .8, weakMagnitude: .6 }); else D.toast('No vibration support on this controller.'); }, bt() { V.openSettingsPage('bluetooth'); } } }),

  saved: () => ({ title: 'Saved Data and Game/App Settings',
    html() {
      const g = S.games, tg = (k, id) => `<div class="sw ${S.pref[k].includes(id) ? 'on' : ''}"><i></i></div>`;
      return head('Library data') + rowA('d-art', 'restart', 'Refresh artwork and info for all games', { act: 'refresh', sub: 'Downloads backgrounds, logos and descriptions again.' }) +
        rowA('d-ost', 'music', 'Clear soundtrack cache', { act: 'ostclr' }) + head('Game music (turn on to mute a game)') +
        (g.map(x => rowA('m' + x.id, 'music', x.name, { act: 'tg', arg: 'noMusic:' + x.id, right: tg('noMusic', x.id) })).join('') || info('No games installed', '')) +
        head('Hidden games') + (g.map(x => rowA('h' + x.id, 'grid', x.name, { act: 'tg', arg: 'hidden:' + x.id, right: tg('hidden', x.id) })).join('') || info('No games installed', ''));
    },
    acts: {
      refresh() { api.clearCache('art').then(() => { D.reloadAll(); D.toast('Refreshing artwork…'); }); },
      ostclr() { D.stopOst(true); api.clearCache('ost').then(() => D.toast('Soundtrack cache cleared.')); },
      tg(arg) { const [k, id] = arg.split(':'), a = S.pref[k], i = a.indexOf(id); i < 0 ? a.push(id) : a.splice(i, 1); D.setPref(k, a); D.rebuild(); V.refresh(); },
    } }),

  notifs: () => ({ title: 'Notifications',
    html: () => head('Pop-ups') + rowT('p0', 'bell', 'Friend and Discord pop-ups', 'popups', 'Corner pop-ups when a friend comes online, starts a game or messages you.') + rowT('p1', 'bell', 'Show notification pop-ups', 'toasts', 'Messages still appear in the list below.') +
      head('Recent') + (S.notes.length ? S.notes.map(n => info(n.msg, new Date(n.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))).join('') + rowA('p-clr', 'circle', 'Clear all', { act: 'clr' }) : info('No notifications', '')),
    acts: { clr() { S.notes.length = 0; V.refresh(); } } }),

  interface: () => ({ title: 'Interface',
    html: () => head('YouTube') + rowT('y-ads', 'film', 'Block ads', 'ytAds', 'Removes video and feed ads.') + rowT('y-sb', 'film', 'Skip sponsor segments', 'ytSponsor', 'Uses the SponsorBlock community database.') + rowT('y-sh', 'film', 'Hide Shorts', 'ytShorts') + rowC('y-look', 'film', 'YouTube look', 'ytLook', ['tv', 'console'], v => v === 'console' ? 'Game console' : 'TV', 'Game console looks like YouTube on PlayStation. Reopen YouTube to apply.') + head('Top bar') + rowT('i1', 'clock', 'Show clock', 'showClock', 'The time in the top right corner.') + rowT('i2', 'clock', '24-hour clock', 'clock24', 'Off shows AM / PM.') + rowT('i2b', 'bolt', 'Show battery', 'showBattery', 'Charge level on the home screen and in the quick menu (laptops).') +
      head('Start-up') + rowC('i3', 'home', 'Open on', 'startTab', [0, 1], x => x ? 'Media' : 'Games', 'Which tab is selected when betterSBP opens.') +
      head('Game page') + rowT('i4', 'video', 'Background trailers', 'trailers', 'Plays a game trailer behind the title after a short pause.') + rowT('i5', 'music', 'Game music', 'music', 'A soundtrack plays when you hover a game.') }),

  library: () => ({ title: 'Library and Home Screen',
    html() {
      const ns = S.games.filter(g => g.nonSteam);
      return head('Home row') + rowC('l1', 'sort', 'Order games by', 'homeSort', ['recent', 'az'], x => x === 'az' ? 'A to Z' : 'Recently played', 'How the games on the home screen are ordered.') +
        head('Non-Steam games') + rowT('l2', 'plus', 'Import shortcuts added in Steam', 'importShortcuts', 'Shows the non-Steam games you added to your Steam library (needs a restart).') +
        (ns.length ? ns.map(g => rowA('lh-' + g.id, 'home', g.name, { act: 'home', arg: g.id, right: D.onHome(g.id) ? 'On home screen' : 'Library only' })).join('') : info('No non-Steam games yet', 'Add one from the Library')) +
        head('Steam library') + rowT('l3', 'people', 'Include Family Sharing games', 'familyShare', 'Games shared with you by family members (needs a restart).');
    }, acts: { home(id) { D.toggleHome(id); V.refresh(); } } }),

  ingame: () => ({ title: 'In-Game',
    html: () => head('While a game is running') + rowT('g1', 'pad', 'Guide button opens the menu', 'guideDash', 'The PS / Xbox / Guide button opens the overlay menu over your game (and betterSBP when no game runs).') +
      rowT('g2', 'bolt', 'Lean Steam mode', 'leanSteam', 'Keeps Steam as quiet as possible while it runs a game (hides its web helper).') + rowT('g3', 'bell', 'Pop-ups over games', 'popups', 'Friend and Discord pop-ups in the corner while you play.') +
      head('Shortcuts') + info('Screenshot', 'F12, or Ctrl+Alt+S from anywhere') + info('Back to betterSBP', 'Ctrl+Alt+D') + info('Overlay menu', 'Guide button') }),

  social: () => ({ title: 'Friends and Chat',
    html() {
      const c = S.chat || {}; return head('Status') + rowC('s1', 'people', 'Show me as', 'myState', [1, 3, 7], x => ({ 1: 'Online', 3: 'Away', 7: 'Invisible' })[x] || 'Online', 'What your friends see.') + (c.state === 'in' ? '' : info('Not signed in', 'Sign in to Steam to apply')) +
        head('Friends list') + rowT('s2', 'people', 'Show offline friends', 'showOffline') +
        head('Pop-ups') + rowT('s3', 'bell', 'Friend comes online', 'popOnline') + rowT('s4', 'bell', 'Friend starts a game', 'popGame') + rowT('s5', 'bell', 'New message', 'popMsg');
    } }),

  captures: () => ({ title: 'Captures and Broadcasts', d: null, load() { api.sys().then(d => { this.d = d; V.refresh(this); }); },
    html() {
      return head('Screenshots') + rowA('c-shot', 'camera', 'Take a screenshot now', { act: 'shot', sub: 'Shortcut: F12 in betterSBP, or Ctrl+Alt+S anywhere.' }) + rowA('c-gal', 'grid', 'Open Gallery', { act: 'gal' }) +
        info('Saved to', this.d ? this.d.capDir : '…') + head('Gallery sources') + rowT('c-st', 'grid', 'Steam screenshots', 'galSteam') + rowT('c-win', 'grid', 'Windows screenshots', 'galWin', 'Pictures > Screenshots folder.') +
        head('Broadcasting') + card('Live streaming is handled by Steam, OBS or Windows Game Bar. Your captures from those apps appear in the Gallery.');
    },
    acts: { shot() { D.capture(); }, gal() { V.open('gallery'); } } }),
};

/* ================================================================ VIEWS */
const VIEWS = {
  settings: () => ({ title: 'Settings', html: () => {
    const ESS = ['users', 'network', 'bluetooth', 'sound', 'screen', 'storage', 'interface', 'notifs', 'accessories', 'power'], lim = S.pref.simple && !S.pref.advanced;
    return rowT('s-simple', 'sparkle', 'Simple mode', 'simple', 'Fewer icons and settings. Turn off to see everything.') + SETTINGS.filter(x => !lim || ESS.includes(x[0])).map(([id, ic, t]) => rowA('s-' + id, ic, t, { act: 'page', arg: id })).join('') +
      (S.pref.simple ? rowT('s-adv', 'gear', 'Show all settings', 'advanced', 'Adds advanced pages like Customization, In-Game and Library options.') : '') + rowA('s-setup', 'home', 'Run setup again', { act: 'setup', sub: 'Accounts, Wi-Fi and your preferences, step by step.' });
  }, acts: { setup() { V.open('setup'); } } }),
  set: id => PAGES[id](),

  library: () => {
    const v = { title: 'Library', body: 'wide', tabI: 0, filter: '', tabs: ['All', 'Installed', 'Recently played', 'Most played'],
      load() { api.library().then(r => { S.lib = r; V.refresh(this); clearTimeout(this.rt); if (r && r.note && /Connecting|still loading/.test(r.note)) this.rt = setTimeout(() => { if (top() === this) this.load(); }, 3000); }); },
      leave() { clearTimeout(this.rt); },
      list() {
        let l = (S.lib ? S.lib.games : []).slice(); const q = this.filter.toLowerCase();
        if (q) l = l.filter(g => g.name.toLowerCase().includes(q));
        if (this.tabI === 1) l = l.filter(g => g.installed);
        if (this.tabI === 2) l = l.filter(g => g.last).sort((a, b) => b.last - a.last);
        else if (this.tabI === 3) l = l.filter(g => g.minutes).sort((a, b) => b.minutes - a.minutes);
        else l.sort((a, b) => a.name.localeCompare(b.name));
        const so = this.sort; if (so === 'recent') l.sort((a, b) => (b.last || 0) - (a.last || 0)); else if (so === 'played') l.sort((a, b) => (b.minutes || 0) - (a.minutes || 0)); else if (so === 'za') l.sort((a, b) => b.name.localeCompare(a.name));
        return l;
      },
      html() {
        let o = `<div class="pills">${this.tabs.map((t, i) => `<div class="fx pill ${i === this.tabI ? 'on' : ''}" data-k="lt${i}" data-act="tab" data-arg="${i}">${t}</div>`).join('')}<div class="fx pill" data-k="lsort" data-act="sort">Sort by: ${({ recent: 'Most Recent', played: 'Most Played', za: 'Z-A' })[this.sort] || 'A-Z'}</div><div class="fx pill" data-k="lsearch" data-act="search">${icon('search')}${this.filter ? esc(this.filter) : 'Search'}</div></div>`;
        if (!S.lib) return o + `<div class="snone">Loading your library…</div>`;
        const l = this.list();
        if (S.lib.note) o += `<div class="note">${esc(S.lib.note)}</div>`;
        o += `<div class="countl">${['All', 'Installed', 'Recently played', 'Most played', 'Favorites'][this.tabI] || this.tabs[this.tabI]}: ${l.length}</div>`;
        o += l.length ? `<div class="grid g7">${l.map(g => `<div class="fx gc" data-k="g${g.id}" data-act="open" data-arg="${g.id}"><img loading="lazy" src="${libArt(g)}" onerror="D.fb(this,'${g.id}')"><div class="gcn">${esc(g.name)}<small>${g.minutes ? fmtMin(g.minutes) + ' played' : 'Not played'}</small></div>${g.installed ? '<b class="inst">Installed</b>' : ''}</div>`).join('')}</div>` : `<div class="snone">Nothing here</div>`;
        return o;
      },
      tab(d) { this.tabI = (this.tabI + d + this.tabs.length) % this.tabs.length; this.fk = 'lt' + this.tabI; V.refresh(this); },
      acts: { tab(i) { this.tabI = +i; V.refresh(this); }, sort() { const t = this, o = [['az', 'A-Z'], ['za', 'Z-A'], ['recent', 'Most Recent'], ['played', 'Most Played']]; D.openMenu(o.map(([k, n]) => ({ icon: t.sort === k || (!t.sort && k === 'az') ? 'check' : 'circle', label: n, run: () => { t.sort = k; t.fk = 'lsort'; V.refresh(t); } })), { top: '22%', left: '30rem', transformOrigin: 'top left' }, 'Sort by', 'view'); }, search() { V.osk({ title: 'Search library', value: this.filter }).then(r => { if (r !== null) { this.filter = r; V.refresh(this); } }); } } };
    return v;
  },

  store: () => ({ title: 'Store', body: 'wide', d: null, q: '', res: null,
    load() { api.storeFeatured().then(d => { this.d = d || { shelves: [] }; V.refresh(this); }); },
    card(i, k) { return `<div class="fx sc" data-k="c${k}-${i.id}" data-act="open" data-arg="${i.id}"><img loading="lazy" src="${esc(i.img || headerU(i.id))}" onerror="this.onerror=null;this.src='${headerU(i.id)}'"><div class="sn">${esc(i.name)}</div>${priceH(i)}</div>`; },
    html() {
      let o = `<div class="pills"><div class="fx pill" data-k="s-search" data-act="search">${icon('search')}${this.q ? esc(this.q) : 'Search the store'}</div>${this.res ? '<div class="fx pill" data-k="s-clear" data-act="clear">Clear search</div>' : ''}</div>`;
      if (this.res) return o + (this.res.length ? `<div class="grid g4">${this.res.map(i => this.card(i, 'r')).join('')}</div>` : '<div class="snone">No results</div>');
      if (!this.d) return o + '<div class="snone">Loading the store…</div>';
      if (!this.d.shelves.length) return o + '<div class="snone">The store could not be reached. Check your connection.</div>';
      return o + this.d.shelves.map((s, n) => head(s.title) + `<div class="shelf">${s.items.map(i => this.card(i, n)).join('')}</div>`).join('');
    },
    acts: {
      search() { V.osk({ title: 'Search the store', value: this.q }).then(r => { if (r) { this.q = r; this.res = []; V.refresh(this); api.storeSearch(r).then(x => { this.res = x; this.fk = 's-search'; V.refresh(this); }); } }); },
      clear() { this.q = ''; this.res = null; this.fk = 's-search'; V.refresh(this); },
    } }),

  game: id => {
    const inst = () => S.games.some(g => g.id === String(id));
    return { title: '', cls: 'gameV', body: 'wide', d: null, ach: undefined,
      load() { api.storeApp(id).then(d => { this.d = d || {}; V.refresh(this); }); if (inst()) api.achievements(id).then(a => { this.ach = a || null; V.refresh(this); }); },
      bg() { const s = this.d && this.d.shots && this.d.shots[0]; return s ? s.full : headerU(id); },
      html() {
        const d = this.d, nm = d && d.name || nameOf(id), lib = S.lib && S.lib.games.find(g => g.id === String(id)), own = inst() || !!lib;
        if (!d) return `<div class="gh"><div class="gl"><div class="gtitle">${esc(nm)}</div><div class="snone l">Loading…</div></div></div>`;
        const meta = [...(d.genres || []).slice(0, 3), d.developers && d.developers[0], d.release].filter(Boolean);
        const price = d.free ? '<div class="px"><span class="now">Free to play</span></div>' : d.price ? priceH({ price: d.price.final, orig: d.price.initial, discount: d.price.discount }) : '';
        let o = `<div class="gh"><div class="gl"><div class="gtitle">${esc(nm)}</div><div class="meta">${meta.map(esc).join(' <i></i> ')}</div>${own ? `<div class="ownr">${inst() ? 'Installed' : 'In your library'}${lib && lib.minutes ? ' · ' + fmtMin(lib.minutes) + ' played' : ''}</div>` : price}<div class="desc">${esc(d.desc || '')}</div><div class="brow">`;
        o += inst() ? `<div class="fx btn w pri2" data-k="b-play" data-act="play">Play</div>` : own ? `<div class="fx btn w pri2" data-k="b-inst" data-act="install">Install</div>` : `<div class="fx btn w pri2" data-k="b-buy" data-act="buy">${d.free ? 'Get in Steam' : 'Buy in Steam'}</div>`;
        if (d.trailer) o += `<div class="fx btn w" data-k="b-trailer" data-act="trailer">${icon('video')} Trailer</div>`;
        o += `</div></div><div class="gr"><img src="${coverU(id)}" onerror="this.onerror=null;this.src='${headerU(id)}'"></div></div>`;
        if (this.ach) o += `<div class="achs"><div class="pi">${icon('trophy')}</div><div class="pc"><small>Progress</small><b>${Math.round(this.ach.earned / this.ach.total * 100)}%</b></div>${bar(this.ach.earned / this.ach.total * 100, 'wide')}<div class="pc r"><small>Earned</small><b>${this.ach.earned}/${this.ach.total}</b></div></div>`;
        if (d.shots && d.shots.length) o += head('Screenshots') + `<div class="shelf">${d.shots.map((s, i) => `<div class="fx shot" data-k="sh${i}" data-act="shot" data-arg="${i}"><img loading="lazy" src="${esc(s.thumb)}"></div>`).join('')}</div>`;
        o += head('Details') + `<div class="details">` + [['Developer', (d.developers || []).join(', ')], ['Publisher', (d.publishers || []).join(', ')], ['Release date', d.release], ['Genres', (d.genres || []).join(', ')], ['Features', (d.categories || []).join(', ')], ['Metacritic', d.metacritic], ['Languages', (d.languages || '').slice(0, 140)]].filter(r => r[1]).map(r => info(r[0], r[1])).join('') + '</div>';
        return o;
      },
      acts: {
        play() { const it = { kind: 'game', id: String(id), name: nameOf(id) }; D.launchGame(it, fxEl); },
        install() { D.startInstall(id, nameOf(id)); },
        buy() { api.openWeb('https://store.steampowered.com/app/' + id); },
        trailer() { V.player(this.d.trailer, this.d.name); },
        shot(i) { V.lightbox(this.d.shots.map(s => ({ src: s.full, cap: this.d.name })), +i); },
      } };
  },

  gallery: () => ({ title: 'Gallery', body: 'wide', d: null, tabI: 0, tabs: ['All', 'Steam', 'betterSBP captures', 'Windows'], src: [null, 'steam', 'dash', 'windows'],
    load() { api.gallery().then(d => { this.d = d || []; V.refresh(this); }); },
    list() { const s = this.src[this.tabI]; return (this.d || []).filter(x => !s || x.source === s); },
    html() {
      let o = `<div class="pills">${this.tabs.map((t, i) => `<div class="fx pill ${i === this.tabI ? 'on' : ''}" data-k="gt${i}" data-act="tab" data-arg="${i}">${t}</div>`).join('')}</div>`;
      if (!this.d) return o + '<div class="snone">Loading…</div>';
      const l = this.list();
      if (!l.length) return o + `<div class="snone">No screenshots yet.<br><small>Press F12 to capture, or take screenshots in your games with Steam (F12).</small></div>`;
      return o + `<div class="grid g4">${l.map((x, i) => `<div class="fx shotc" data-k="p${x.id}" data-act="view" data-arg="${i}"><img loading="lazy" src="${esc(x.src)}"><div class="shn">${x.appid ? esc(nameOf(x.appid)) : x.source === 'dash' ? 'betterSBP capture' : 'Windows'}<small>${dstr(x.time)}</small></div></div>`).join('')}</div>`;
    },
    tab(d) { this.tabI = (this.tabI + d + this.tabs.length) % this.tabs.length; this.fk = 'gt' + this.tabI; V.refresh(this); },
    acts: { tab(i) { this.tabI = +i; V.refresh(this); }, view(i) { const l = this.list(); V.lightbox(l.map(x => ({ src: x.src, cap: (x.appid ? nameOf(x.appid) + ' · ' : '') + dstr(x.time) })), +i); } } }),

  friends: () => ({ title: 'Friends', d: null,
    load() { api.friends().then(d => { this.d = d; V.refresh(this); }); },
    st(f) { return f.game ? `Playing ${f.game}` : ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'][f.state] || 'Steam friend'; },
    row(f) {
      const on = f.state > 0, av = f.avatar ? `<img src="${esc(f.avatar)}">` : `<span>${esc((f.name || '?')[0].toUpperCase())}</span>`;
      return `<div class="fx srow frow" data-k="f${f.id}" data-act="friend" data-arg="${f.id}"><div class="fav">${av}${f.state >= 0 ? `<i class="${on ? 'on' : ''}${f.game ? ' play' : ''}"></i>` : ''}</div><div class="stx"><div class="t">${esc(f.name)}</div>${f.state >= 0 ? `<div class="s ${f.game ? 'g' : ''}">${esc(this.st(f))}</div>` : ''}</div></div>`;
    },
    html() {
      const d = this.d; if (!d) return card('Loading friends…');
      S.chatNames = S.chatNames || {}; d.friends.forEach(f => { S.chatNames[f.id] = f.name; });
      let o = d.live ? '' : rowA('f-si', 'shield', 'Sign in to Steam', { act: 'signin', sub: 'See who is online and chat, without opening Steam.' });
      o += d.note && !d.live ? `<div class="note">${esc(d.note)}</div>` : '';
      if (!d.friends.length) return o + '<div class="snone">No friends to show.</div>';
      if (d.mode === 'api') {
        const g = d.friends.filter(f => f.game), on = d.friends.filter(f => !f.game && f.state > 0), off = S.pref.showOffline === false ? [] : d.friends.filter(f => !f.game && f.state <= 0);
        [['In game', g], ['Online', on], ['Offline', off]].forEach(([t, l]) => { if (l.length) o += head(t + ' — ' + l.length) + l.map(f => this.row(f)).join(''); });
      } else o += head('Friends — ' + d.friends.length) + d.friends.map(f => this.row(f)).join('');
      return o;
    },
    acts: { signin() { V.open('steamlogin'); }, friend(id) {
      const f = this.d.friends.find(x => x.id === id), el = fxEl, r = el.getBoundingClientRect();
      D.openMenu([
        { icon: 'user', label: 'View profile', run: () => V.open('profile', id) },
        { icon: 'people', label: 'Message', run: () => { S.chatNames = S.chatNames || {}; S.chatNames[id] = f.name; V.open(S.chat && S.chat.state === 'in' ? 'chat' : 'steamlogin', id); } },
      ], { top: Math.min(r.top, innerHeight - 260) + 'px', right: '60rem', transformOrigin: 'top right' }, esc(f.name), 'view');
    } } }),

  trophies: () => ({ title: 'Trophies', body: 'col', rows: {}, t: null,
    load() {
      const q = S.games.map(g => g.id); let busy = 0, done = 0; const tot = q.length;
      const next = () => { while (busy < 3 && q.length) { const id = q.shift(); busy++; api.achievements(id).then(a => { this.rows[id] = a || null; }).catch(() => { this.rows[id] = null; }).finally(() => { busy--; done++; clearTimeout(this.t); this.t = setTimeout(() => V.refresh(this), 250); if (done >= tot) V.refresh(this); else next(); }); } };
      if (!tot) { this.rows = {}; V.refresh(this); } else next();
    },
    html() {
      const ids = Object.keys(this.rows).filter(i => this.rows[i]).sort((a, b) => this.rows[b].earned / this.rows[b].total - this.rows[a].earned / this.rows[a].total);
      const e = ids.reduce((s, i) => s + this.rows[i].earned, 0), t = ids.reduce((s, i) => s + this.rows[i].total, 0), pend = S.games.length - Object.keys(this.rows).length;
      let o = `<div class="stats"><div class="stat"><small>Overall completion</small><b>${t ? Math.round(e / t * 100) : 0}%</b></div><div class="stat"><small>Trophies earned</small><b>${e}</b></div><div class="stat"><small>Games with trophies</small><b>${ids.length}</b></div></div>`;
      if (pend > 0) o += `<div class="note">Loading… ${pend} left</div>`;
      o += ids.map(i => { const a = this.rows[i]; return `<div class="fx srow trow" data-k="t${i}" data-act="ach" data-arg="${i}"><img src="${headerU(i)}"><div class="stx"><div class="t">${esc(nameOf(i))}</div>${bar(a.earned / a.total * 100)}</div><div class="sr2">${a.earned}/${a.total} · ${Math.round(a.earned / a.total * 100)}%</div></div>`; }).join('');
      if (!ids.length && pend <= 0) o += `<div class="snone">No trophy data found.<br><small>Your Steam profile's game details must be public.</small></div>`;
      return o;
    },
    acts: { ach(id) { V.open('ach', id); } } }),

  ach: id => ({ title: nameOf(id), a: null, load() { api.achievements(id).then(a => { this.a = a; V.refresh(this); }); },
    html() {
      const a = this.a; if (!a) return card('Loading…');
      const l = a.list.slice().sort((x, y) => (y.done - x.done) || (y.time - x.time));
      return head(`${a.earned} of ${a.total} unlocked`) + l.map((x, i) => `<div class="fx srow arow ${x.done ? '' : 'lock'}" data-k="a${i}"><img src="${esc(x.icon)}"><div class="stx"><div class="t">${esc(x.name)}</div><div class="s">${esc(x.desc || 'Hidden')}</div></div><div class="sr2">${x.done && x.time ? dstr(x.time) : x.done ? 'Unlocked' : 'Locked'}</div></div>`).join('');
    } }),

  notes: () => ({ title: 'Notifications', html: () => (S.notes.length ? S.notes.map(n => info(n.msg, new Date(n.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))).join('') : '<div class="snone">No new notifications</div>') }),
};
V.openSettingsPage = id => { V.open('settings'); V.open('set', id); };
V.VIEWS = VIEWS; V.PAGES = PAGES; V.SETTINGS = SETTINGS;
V.k = { sub, sic, rowA, rowT, rowC, rowS, info, head, card, bar, priceH, headerU, coverU, fmtMin, gb, ago, dstr, nameOf, CDN, setFx, fx: () => fxEl, top };
// image fallback chain: cover -> header -> remove (the card then shows its name)
D.fb = (img, id) => { const t = +img.dataset.t || 0; if (t >= 2) { img.remove(); return; } if (AM[id] && img.src === AM[id]) { delete AM[id]; amSave(); } img.dataset.t = t + 1; if (t === 0 && AM[id]) { img.src = AM[id]; return; } fbQ.push({ img, id }); fbPump(); };
})();
