// Second batch of in-app screens: PlayStation-style Store, game page, news reader,
// downloads, Media apps (All Apps / TV & Video / App Library), wishlist, icon Gallery.
(() => {
'use strict';
const D = window.D, S = D.S, $ = D.$, $$ = D.$$, esc = D.esc, api = D.api, icon = window.icon, V = D.V, K = V.k, VIEWS = V.VIEWS;
const { head, info, rowA, rowT, rowC, card, bar, priceH, headerU, coverU, fmtMin, gb, dstr, nameOf, CDN } = K;
const heroU = id => CDN + id + '/library_hero.jpg';
const logoU = id => CDN + id + '/logo.png';
const hue = s => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const imgT = (src, id) => `<img loading="lazy" src="${esc(src)}" onerror="D.fb(this,'${id}')">`;
const chip = (k, ic, t, act, arg, on, n) => `<div class="fx chip ${on ? 'on' : ''}" data-k="${k}" data-act="${act}" data-arg="${esc(arg == null ? '' : arg)}">${icon(ic)}<span>${esc(t)}</span>${n ? `<i class="cnt">${n}</i>` : ''}</div>`;
const empty = (ic, t, s2, btn) => `<div class="emptyc"><div class="ill">${icon(ic)}</div><div class="et">${esc(t)}</div>${s2 ? `<div class="es">${esc(s2)}</div>` : ''}${btn || ''}</div>`;
const ptag = i => i.price ? `<div class="ptag${i.discount ? ' sale' : ''}">${i.discount ? `-${i.discount}% ` : ''}${esc(i.price)}</div>` : '';
const pcard = (i, pre = 'b') => `<div class="fx pcd" data-k="${pre}${i.id}" data-act="open" data-arg="${i.id}">${imgT(coverU(i.id), i.id)}<div class="pcn">${esc(i.name)}</div>${ptag(i)}</div>`;
const wcard = (i, pre) => `<div class="fx wc" data-k="${pre}${i.id}" data-act="open" data-arg="${i.id}"><img loading="lazy" src="${esc(i.img || headerU(i.id))}" onerror="this.onerror=null;this.src='${headerU(i.id)}'"><div class="wn">${esc(i.name)}</div>${ptag(i)}</div>`;
const gcol = (n, a = 38) => `linear-gradient(145deg,hsl(${hue(n)},60%,${a}%),hsl(${(hue(n) + 40) % 360},60%,13%))`;
const activeDl = () => S.dl.filter(x => ['queued', 'starting', 'downloading', 'login'].includes(x.state)).length;
const when = D.when;

/* =================================================================== STORE */
const COLL = [['Top sellers', 'fire', 'best'], ['New & trending', 'sparkle', 'new'], ['On sale', 'bolt', 'special'], ['Coming soon', 'clock', 'upcoming'], ['Free to play', 'tag', 'free']];
const SORT_L = { best: 'Best selling', new: 'New & trending', special: 'On sale', upcoming: 'Coming soon', free: 'Free to play' };
VIEWS.store = arg => {
  const v = { title: 'betterSBP Store', icon: 'bag', body: 'wide', d: null, tabI: arg && arg.tag ? 3 : 0, tabs: ['Latest', 'Collections', 'Deals', 'Browse'], q: '', res: null, tags: null,
    bs: { tag: null, tagName: '', sort: 'best', items: null, total: 0, busy: false }, ds: { items: null, busy: false },
    load() {
      Promise.resolve(api.storeRecs && api.storeRecs()).then(r => { S.recs = r; V.refresh(this); });
      Promise.resolve(api.storeFeatured()).then(d => { this.d = d || { shelves: [] }; V.refresh(this); });
      Promise.resolve(api.storeTags ? api.storeTags() : {}).then(t => {
        this.tags = t || {};
        if (arg && arg.tag) { this.bs.tagName = arg.tag; this.bs.tag = this.tags[arg.tag] || null; this.browse(true); }
        else if (this.tabI === 3) this.browse(true);
        V.refresh(this);
      });
    },
    browse(reset) {
      const b = this.bs; if (b.busy) return; if (reset) { b.items = null; b.total = 0; } b.busy = true; V.refresh(this);
      Promise.resolve(api.storeBrowse({ tag: b.tag, sort: b.sort, start: reset ? 0 : (b.items || []).length })).then(r => { b.busy = false; b.items = (reset ? [] : (b.items || [])).concat(r.items || []); b.total = r.total || 0; V.refresh(this); });
    },
    deals() {
      const b = this.ds; if (b.busy) return; b.busy = true;
      Promise.resolve(api.storeBrowse({ sort: 'special', start: 0 })).then(r => { b.busy = false; b.items = r.items || []; V.refresh(this); });
    },
    setTab(i) { this.tabI = i; this.fk = 'st' + i; this.res = null; if (i === 2 && !this.ds.items) this.deals(); if (i === 3 && !this.bs.items && !this.bs.busy) this.browse(true); V.refresh(this); },
    tab(d) { this.setTab((this.tabI + d + this.tabs.length) % this.tabs.length); },
    bar() {
      const n = activeDl(), w = S.pref.wish.length;
      return `<div class="stbar"><div class="sttabs">${this.tabs.map((t, i) => `<div class="fx sttab ${i === this.tabI && !this.res ? 'on' : ''}" data-k="st${i}" data-act="tab" data-arg="${i}">${t}</div>`).join('')}</div>` +
        `<div class="sticons"><div class="fx sticon" data-k="si-search" data-act="search">${icon('search')}</div><div class="fx sticon" data-k="si-wish" data-act="wish">${icon('heart')}${w ? `<i class="cnt">${w}</i>` : ''}</div>` +
        `<div class="fx sticon" data-k="si-cart" data-act="cart">${icon('cart')}</div><div class="fx sticon" data-k="si-dl" data-act="dls">${icon('download')}${n ? `<i class="cnt">${n}</i>` : ''}</div><div class="fx sticon" data-k="si-acct" data-act="acct">${icon('face')}</div></div></div>`;
    },
    latest() {
      if (!this.d) return '<div class="snone">Loading the store…</div>';
      const sh = this.d.shelves || [];
      if (!sh.length) return empty('globe', "Can't reach the store", 'Check your internet connection and try again.');
      const by = t => (sh.find(x => x.title === t) || { items: [] }).items;
      const hot = [...by('Top Sellers'), ...by('Special Offers'), ...by('New Releases')].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).slice(0, 6);
      const m = (i, area, kind) => i ? `<div class="fx mtile ${kind}" style="grid-area:${area}" data-k="h${i.id}" data-act="open" data-arg="${i.id}">${imgT(kind === 'tall' ? coverU(i.id) : kind === 'wd' ? CDN + i.id + '/library_hero.jpg' : headerU(i.id), i.id)}${ptag(i)}<div class="mtn">${esc(i.name)}</div></div>` : '';
      const rc = S.recs && S.recs.items || [];
      let o = (rc.length ? head('Recommended for you') + `<div class="shelf">${rc.slice(0, 12).map(i => wcard(i, 'rc')).join('')}</div>` : '') + head("What's hot") + `<div class="mosaic">${m(hot[0], 'a', 'tall')}${m(hot[1], 'b', 'sm')}${m(hot[2], 'c', 'sm')}${m(hot[3], 'd', 'wd')}${m(hot[4], 'e', 'sm')}${m(hot[5], 'f', 'sm')}</div>`;
      [['Coming Soon', 'Coming soon', 'cs'], ['Special Offers', 'Special offers', 'so'], ['New Releases', 'New releases', 'nr'], ['Top Sellers', 'Top sellers', 'ts']].forEach(([k, t, p]) => { const l = by(k); if (l.length) o += head(t) + `<div class="shelf">${l.map(i => wcard(i, p)).join('')}</div>`; });
      return o;
    },
    collections() {
      const tags = Object.keys(this.tags || {});
      return head('Collections') + `<div class="grid g4">${COLL.map(([t, ic, s]) => `<div class="fx coll" style="background:${`linear-gradient(145deg,hsl(${hue(t)},62%,40%),hsl(${(hue(t) + 40) % 360},60%,14%))`}" data-k="co-${s}" data-act="coll" data-arg="sort:${s}">${icon(ic)}<b>${t}</b></div>`).join('')}</div>` +
        (tags.length ? head('Genres and tags') + `<div class="grid g4">${tags.map(t => `<div class="fx coll sm" style="background:linear-gradient(145deg,hsl(${hue(t)},55%,36%),hsl(${(hue(t) + 40) % 360},55%,13%))" data-k="co-t${t}" data-act="coll" data-arg="tag:${esc(t)}">${icon('tag')}<b>${esc(t)}</b></div>`).join('')}</div>` : '');
    },
    dealsT() {
      const b = this.ds; if (!b.items) return '<div class="snone">Finding deals…</div>';
      return head('Special offers') + (b.items.length ? `<div class="grid g5">${b.items.map(i => pcard(i, 'd')).join('')}</div>` : empty('bolt', 'No deals right now', 'Check back soon.'));
    },
    browseT() {
      const b = this.bs;
      let o = `<div class="brhead"><div class="fx sticon" data-k="br-sort" data-act="sort">${icon('sort')}</div><div class="brt">${b.tagName ? esc(b.tagName) + ' games' : 'All games'}</div><div class="brs">Sort by: ${SORT_L[b.sort]}</div></div>`;
      if (!b.items) return o + '<div class="snone">Loading games…</div>';
      o += b.items.length ? `<div class="grid g5">${b.items.map(i => pcard(i, 'g')).join('')}</div>` : empty('search', 'Nothing found', 'Try another sort or genre.');
      if (b.items.length && b.items.length < b.total) o += `<div class="moreb"><div class="fx pill" data-k="br-more" data-act="more">${b.busy ? 'Loading…' : 'Show more'}</div></div>`;
      return o;
    },
    html() {
      let o = this.bar();
      if (this.res) return o + head(`Results for "${this.q}"`) + (this.res.length ? `<div class="grid g5">${this.res.map(i => pcard(i, 'r')).join('')}</div>` : empty('search', 'No results', 'Try a different name.')) + `<div class="moreb"><div class="fx pill" data-k="s-clear" data-act="clear">Clear search</div></div>`;
      return o + [this.latest, this.collections, this.dealsT, this.browseT][this.tabI].call(this);
    },
    acts: {
      tab(i) { this.setTab(+i); },
      open(id) { V.open('game', id); },
      search() { V.osk({ title: 'Search the store', value: this.q }).then(r => { if (r) { this.q = r; this.res = []; V.refresh(this); Promise.resolve(api.storeSearch(r)).then(x => { this.res = x || []; this.fk = 'si-search'; V.refresh(this); }); } }); },
      clear() { this.q = ''; this.res = null; this.fk = 'si-search'; V.refresh(this); },
      wish() { V.open('wish'); },
      cart() { V.open('cart'); },
      acct() {
        const w = u => () => api.openWeb(u), B = 'https://store.steampowered.com/';
        const r = K.fx().getBoundingClientRect(), nm = S.chat && S.chat.state === 'in' ? S.chat.name : (S.profile && S.profile.name) || 'Steam account';
        D.openMenu([
          { icon: 'face', label: nm, sub: S.chat && S.chat.state === 'in' ? 'Signed in' : 'Sign in to buy and sync', run: () => V.open('steamlogin') },
          { icon: 'heart', label: 'Wishlist', run: () => V.open('wish') },
          { icon: 'cart', label: 'Shopping cart', run: () => V.open('cart') },
          { icon: 'clock', label: 'Purchase history', run: () => V.open('history') },
          { icon: 'sparkle', label: 'Redeem a Steam key', run: () => V.osk({ title: 'Steam product key', max: 40 }).then(k => { if (k && k.trim()) Promise.resolve(api.redeemKey(k)).then(r => D.toast((r && r.msg) || 'Done.')); }) },
          { icon: 'bag', label: 'Add funds to wallet', run: w(B + 'steamaccount/addfunds') },
          { icon: 'gear', label: 'Account details', run: () => V.openSettingsPage('users') },
          { icon: 'people', label: 'Steam Community', run: w('https://steamcommunity.com/') },
        ], { top: (r.bottom + 12) + 'px', right: '4rem', transformOrigin: 'top right' }, 'Store account', 'view');
      },
      dls() { V.open('downloads'); },
      more() { this.browse(false); },
      coll(a) {
        const [k, val] = a.split(':'), b = this.bs;
        if (k === 'sort') { b.sort = val; b.tag = null; b.tagName = ''; } else { b.tag = (this.tags || {})[val] || null; b.tagName = val; b.sort = 'best'; }
        this.setTab(3); this.browse(true);
      },
      sort() {
        const el = K.fx(), r = el.getBoundingClientRect(), b = this.bs;
        D.openMenu([
          ...Object.keys(SORT_L).map(k => ({ icon: b.sort === k ? 'check' : 'sort', label: SORT_L[k], run: () => { b.sort = k; this.browse(true); } })),
          { icon: 'tag', label: b.tagName ? 'Genre: ' + b.tagName : 'Choose a genre…', run: () => this.genreMenu() },
        ], { top: Math.min(r.bottom + 10, innerHeight - 420) + 'px', left: r.left + 'px', transformOrigin: 'top left' }, 'Sort by', 'view');
      },
    },
    genreMenu() {
      const b = this.bs, list = [{ icon: 'grid', label: 'All genres', run: () => { b.tag = null; b.tagName = ''; this.browse(true); } }, ...Object.keys(this.tags || {}).map(t => ({ icon: 'tag', label: t, run: () => { b.tag = this.tags[t]; b.tagName = t; this.browse(true); } }))];
      setTimeout(() => D.openMenu(list.slice(0, 9), { top: '24%', left: '8rem', transformOrigin: 'top left' }, 'Genre', 'view'), 360);
    },
  };
  return v;
};

VIEWS.wish = () => ({ title: 'Wishlist', icon: 'heart', body: 'wide', items: null, steam: false,
  load() { if (S.chat && S.chat.state === 'in') Promise.resolve(api.wishGet()).then(r => { if (r && r.ok) { this.steam = true; this.items = r.items; S.pref.wish = r.items.map(x => ({ id: x.id, name: x.name })); } else this.items = S.pref.wish; V.refresh(this); }); else { this.items = S.pref.wish; V.refresh(this); } },
  html() { const l = this.items; if (!l) return '<div class="snone">Loading your wishlist…</div>'; return l.length ? `<div class="grid g5">${l.map(w => pcard({ id: w.id, name: w.name, img: w.img }, 'w')).join('')}</div>` : empty('heart', 'Your wishlist is empty', 'Open a game in the store and choose Wishlist.'); },
  acts: { open(id) { V.open('game', id); } } });

/* ---- shopping cart: your real Steam cart. Paying needs Steam's secure payment form, which opens inside betterSBP. */
VIEWS.cart = () => ({ title: 'Shopping cart', icon: 'cart', body: 'col', d: null,
  load() { if (!(S.chat && S.chat.state === 'in')) { this.d = { ok: false, msg: 'Sign in to Steam to use your cart.', items: [] }; return V.refresh(this); } Promise.resolve(api.cartGet()).then(r => { this.d = r; V.refresh(this); }); },
  html() {
    const d = this.d; if (!d) return '<div class="snone">Loading your cart…</div>';
    if (!d.ok) return `<div class="note">${esc(d.msg || 'Could not load the cart.')}</div>` + rowA('ct-si', 'steam', 'Sign in to Steam', { act: 'signin' });
    if (!d.items.length) return empty('cart', 'Your cart is empty', 'Choose Buy on a game in the store to add it here.');
    return d.items.map(i => `<div class="fx srow dlrow" data-k="ci${i.line}" data-act="item" data-arg="${i.line}">${i.img ? `<img src="${esc(i.img)}" onerror="this.style.visibility='hidden'">` : ''}<div class="stx"><div class="t">${esc(i.name)}</div><div class="s">${esc(i.price)}</div></div><div class="sr2">${icon('x')}</div></div>`).join('') +
      info('Subtotal', d.total || '') + rowA('ct-pay', 'bag', 'Continue to payment', { act: 'pay', sub: 'Steam\'s secure payment form opens inside betterSBP (card, PayPal or wallet).' });
  },
  acts: { signin() { V.open('steamlogin'); }, pay() { api.openWeb('https://store.steampowered.com/checkout/?purchasetype=self'); },
    item(line) { V.dlg({ title: 'Remove from cart?', msg: (this.d.items.find(x => x.line === line) || {}).name || '', buttons: [{ label: 'Remove', run: () => Promise.resolve(api.cartRemove(line)).then(r => { if (r && r.ok) this.load(); else D.toast((r && r.msg) || 'Could not remove it.'); }) }, { label: 'Cancel' }] }); } } });

VIEWS.history = () => ({ title: 'Purchase history', icon: 'clock', body: 'col', d: null,
  load() { Promise.resolve(api.accountHistory()).then(r => { this.d = r; V.refresh(this); }); },
  html() { const d = this.d; if (!d) return '<div class="snone">Loading…</div>'; if (!d.ok) return `<div class="note">${esc(d.msg || 'Sign in to Steam to see your purchases.')}</div>`; return (d.balance ? info('Steam wallet', d.balance) : '') + (d.rows.length ? d.rows.map(r => `<div class="srow"><div class="stx"><div class="t">${esc(r.items || r.type)}</div><div class="s">${esc([r.date, r.type, r.total].filter(Boolean).join(' · '))}</div></div></div>`).join('') : '<div class="snone">No purchases found.</div>'); } });

const buyApp = async (id, name, pkg, free) => {
  if (!(S.chat && S.chat.state === 'in')) { D.toast('Sign in to Steam first.'); return V.open('steamlogin'); }
  if (free) { D.toast('Adding to your library…'); const r = await api.freeLicense(id); if (r && r.ok) { D.toast(name + ' was added to your library.'); S.lib = null; } else D.toast((r && r.msg) || 'Steam did not add it.'); return; }
  if (!pkg) return D.toast('This item can not be bought from here (no purchase option found).');
  const r = await api.cartAdd(pkg); if (r && r.ok) { D.toast('Added to your cart.'); V.open('cart'); } else D.toast((r && r.msg) || 'Steam did not accept it.');
};

/* ============================================================== ALL REVIEWS */
VIEWS.allreviews = a => ({ title: (a.name || 'Game') + ' · Reviews', icon: 'star', body: 'col', f: 'all',
  html() {
    const all = a.list || [], up = all.filter(r => r.up).length, l = all.filter(r => this.f === 'all' || (this.f === 'up') === r.up); this.l = l;
    return (a.summary ? info('Overall', a.summary.desc + ' (' + a.summary.pct + '%) · ' + (a.summary.total || 0).toLocaleString() + ' reviews') : '') + info('Shown here', all.length + ' · ' + up + ' recommend · ' + (all.length - up) + ' do not') +
      rowA('rv-f', 'filter', 'Show: ' + ({ all: 'All reviews', up: 'Recommended only', dn: 'Not recommended only' }[this.f]), { act: 'filt' }) +
      (l.length ? l.map((r, i) => `<div class="fx srow rvr" data-k="ar${i}" data-act="rev" data-arg="${i}"><div class="rvi ${r.up ? 'up' : 'dn'}">${icon(r.up ? 'check' : 'x')}</div><div class="stx"><div class="t">${r.up ? 'Recommended' : 'Not recommended'} · ${r.hours} h played · ${r.votes} found helpful</div><div class="s">${esc(r.text.slice(0, 200))}</div></div></div>`).join('') : '<div class="snone">No reviews match.</div>');
  },
  acts: {
    filt() { this.f = this.f === 'all' ? 'up' : this.f === 'up' ? 'dn' : 'all'; V.refresh(this); },
    rev(i) { const r = this.l[+i]; V.dlg({ title: (r.up ? 'Recommended' : 'Not recommended') + ' · ' + r.hours + ' h played', msg: r.text, buttons: [{ label: 'Close' }] }); },
  } });
/* ============================================================== DLC MANAGER */
VIEWS.dlcmgr = a => { const id = String(a.id), name = a.name; return ({ title: (name || 'Game') + ' · Add-ons', icon: 'layers', body: 'col', l: null, own: [],
  load() {
    Promise.resolve(api.storeApp(id)).then(async d => {
      const ids = (d && d.dlcIds) || []; this.l = ids.length ? (await api.dlcList(ids, true)) || [] : [];
      this.own = (await api.chatOwns(this.l.map(x => x.id))) || []; V.refresh(this);
    }).catch(() => { this.l = []; V.refresh(this); });
  },
  html() {
    if (!this.l) return '<div class="snone">Loading add-ons…</div>';
    if (!this.l.length) return '<div class="snone">This game has no add-ons on Steam.</div>';
    const signed = S.chat && S.chat.state === 'in', o = new Set(this.own);
    return info('Add-ons', this.l.length + ' available' + (signed ? ' · ' + this.own.length + ' owned' : '')) + this.l.map((x, i) => `<div class="fx srow" data-k="dl${i}" data-act="item" data-arg="${i}"><div class="stx"><div class="t">${esc(x.name)}</div><div class="s">${o.has(x.id) ? 'Owned · installs with the game' : esc((x.discount ? '-' + x.discount + '%  ' : '') + (x.price || 'Not for sale'))}</div></div><div class="sr2">${o.has(x.id) ? icon('check') : 'Buy'}</div></div>`).join('') + rowA('dl-v', 'restart', 'Download owned add-ons (verify files)', { act: 'verify', sub: 'Makes the downloader fetch every add-on you own for this game.' });
  },
  acts: {
    async item(i) { const x = this.l[+i]; if (this.own.includes(x.id)) return D.toast(x.name + ' is already in your library.'); const d = await api.storeApp(x.id); const e = d && (d.editions || [])[0]; buyApp(x.id, x.name, e && e.pkg, d && d.free); },
    verify() { const g = S.games.find(g => g.id === id); if (!g) return D.toast('Install the game first.'); D.startInstall ? D.startInstall(id, name) : D.toast('Opening the downloader…'); },
  } }); };

/* ============================================================== GAME PAGE */
VIEWS.game = id => {
  id = String(id);
  const inst = () => S.games.some(g => g.id === id);
  const v = { title: '', cls: 'gameV', body: 'wide', d: null, ach: undefined, news: null, hero: null,
    load() {
      Promise.resolve(api.storeApp(id)).then(d => { this.d = d || {}; V.refresh(this); this.pickHero(); });
      if (inst()) Promise.resolve(api.achievements(id)).then(a => { this.ach = a || null; V.refresh(this); });
      if (api.newsGame) Promise.resolve(api.newsGame(id)).then(n => { this.news = n || []; V.refresh(this); });
      Promise.resolve(api.moreLike(id)).then(l => { this.like = l || []; V.refresh(this); });
      Promise.resolve(api.reviewsFull(id)).then(r => { r = r || {}; this.rvAll = r.list || []; this.rv = this.rvAll.slice(0, 4); this.rsum = r.summary || null; this.rwhy = r.why || ''; V.refresh(this); }).catch(() => { this.rv = []; this.rvAll = []; V.refresh(this); });
    },
    pickHero() {
      const d = this.d || {}, c = [heroU(id), d.background, d.shots && d.shots[0] && d.shots[0].full].filter(Boolean);
      const next = () => { const u = c.shift(); if (!u) return; const im = new Image(); im.onload = () => { this.hero = u; V.refresh(this); }; im.onerror = next; im.src = u; };
      next();
    },
    bg() { return this.hero; },
    leave() { this.stopTv(); },
    stopTv() { clearTimeout(this._tvT); const x = $('#view video.tvbg'); if (x) { x.pause(); x.remove(); } },
    // the store page plays the game's trailer silently behind the page, like the PlayStation Store
    armTv() {
      const d = this.d, u = d && d.movies && d.movies[0] && d.movies[0].url; if (!u || this._tv === u || S.pref.trailers === false) return; this._tv = u;
      this._tvT = setTimeout(() => { const b = $('#view .vbg'); if (!b || $('#view video.tvbg')) return; const x = document.createElement('video'); x.src = u; x.muted = true; x.loop = true; x.autoplay = true; x.playsInline = true; x.className = 'tvbg'; x.oncanplay = () => x.classList.add('on'); x.onerror = () => x.remove(); b.after(x); x.play().catch(() => {}); }, 2500);
    },
    after() { this.armTv(); const t = $('#view .vt'); if (t) t.innerHTML = `<span class="vti img"><img src="${coverU(id)}" onerror="this.remove()"></span>${esc((this.d && this.d.name) || nameOf(id))}`; },
    html() {
      const d = this.d, nm = (d && d.name) || nameOf(id), lib = S.lib && S.lib.games.find(g => g.id === id), own = inst() || !!lib;
      if (!d) return `<div class="gp"><div class="gpl"><div class="gtitle">${esc(nm)}</div><div class="snone l">Loading…</div></div></div>`;
      const wl = S.pref.wish.some(w => w.id === id), price = d.free ? 'Free' : d.price ? d.price.final : '';
      const type = ({ game: 'Game', dlc: 'Add-on', demo: 'Demo', music: 'Soundtrack', video: 'Video', application: 'Application' })[d.type] || 'Game';
      const main = inst() ? `<div class="fx btn w pri2" data-k="b-main" data-act="play">${icon('play')}Play</div>`
        : own ? `<div class="fx btn w pri2" data-k="b-main" data-act="install">${icon('download')}Install</div>`
        : `<div class="fx btn w pri2" data-k="b-main" data-act="buy">${d.free ? 'Get' : 'Buy'}${price && !d.free ? ' · ' + esc(price) : ''}</div>`;
      const meta = [...(d.genres || []).slice(0, 3), d.developers && d.developers[0]].filter(Boolean);
      let o = `<div class="gp"><div class="gpl"><div class="gtag">${type}</div><div class="glg"><img src="${logoU(id)}" onerror="this.parentNode.classList.add('nologo');this.remove()"><div class="gtitle">${esc(nm)}</div></div>`;
      o += `<div class="gtl">${esc(d.desc || '')}</div>`;
      if (own) o += `<div class="ownr">${inst() ? 'Installed' : 'In your library'}${lib && lib.minutes ? ' · ' + fmtMin(lib.minutes) + ' played' : ''}</div>`;
      else if (d.price && d.price.discount) o += priceH({ price: d.price.final, orig: d.price.initial, discount: d.price.discount });
      o += `<div class="brow">${main}` + (!own ? `<div class="fx btn w ${wl ? 'on' : ''}" data-k="b-wish" data-act="wl">${icon(wl ? 'check' : 'heart')}${wl ? 'Wishlisted' : 'Wishlist +'}</div>` : '') +
        (d.trailer || (d.movies && d.movies.length) ? `<div class="fx btn w" data-k="b-trailer" data-act="trailer">${icon('video')} Trailer</div>` : '') + `<div class="fx btn rnd2" data-k="b-more" data-act="more">${icon('more')}</div></div>`;
      const rt = [d.metacritic ? `<div class="rbox"><b>${d.metacritic}</b><small>Metacritic</small></div>` : '', d.age ? `<div class="rbox"><b>${esc(d.age)}+</b><small>Age</small></div>` : ''].join('');
      const rtx = [d.notes, d.dlc ? d.dlc + ' add-ons available' : '', (d.categories || []).includes('In-App Purchases') ? 'In-game purchases' : '', meta.join(' · ')].filter(Boolean).map(esc).join('<span class="sep"></span>');
      if (rt || rtx) o += `<div class="grate">${rt}<div class="rtx">${rtx}</div></div>`;
      o += `</div><div class="gip">` + [['Publisher', (d.publishers || d.developers || [])[0], 'doc'], ['Reviews', d.reviews ? `${d.reviews.label} (${d.reviews.pct}%)` : d.reviewDesc ? `${d.reviewDesc} (${d.reviewPct}%)` : '', 'star'], ['Release', d.release, 'clock'], ['Storage', d.storage ? d.storage.replace(/\s*available.*/i, '') : '', 'disk'], ['Genres', (d.genres || []).slice(0, 2).join(', '), 'tag']]
        .filter(r => r[1]).map(r => `<div class="gir">${icon(r[2])}<span>${esc(r[1])}</span></div>`).join('') + `</div></div>`;
      if (this.ach) o += `<div class="achs"><div class="pi">${icon('trophy')}</div><div class="pc"><small>Progress</small><b>${Math.round(this.ach.earned / this.ach.total * 100)}%</b></div>${bar(this.ach.earned / this.ach.total * 100, 'wide')}<div class="pc r"><small>Earned</small><b>${this.ach.earned}/${this.ach.total}</b></div></div>`;
      const mv = d.movies || [], sh = d.shots || [];
      if (mv.length || sh.length) o += head('Media') + `<div class="shelf">${mv.map((m, i) => `<div class="fx shot mov" data-k="mv${i}" data-act="movie" data-arg="${i}"><img loading="lazy" src="${esc(m.thumb)}"><i class="playb">${icon('play')}</i></div>`).join('')}${sh.map((s, i) => `<div class="fx shot" data-k="sh${i}" data-act="shot" data-arg="${i}"><img loading="lazy" src="${esc(s.thumb)}"></div>`).join('')}</div>`;
      if (this.news && this.news.length) o += head('Official news') + `<div class="shelf">${this.news.slice(0, 6).map((n, i) => `<div class="fx nc2" data-k="nw${i}" data-act="news" data-arg="${i}"><img loading="lazy" src="${esc(n.image || headerU(id))}" onerror="this.onerror=null;this.src='${headerU(id)}'"><div class="nct"><b>${esc(n.title)}</b><small>${esc(when(n.date))}</small></div></div>`).join('')}</div>`;
      if (!own && d.editions && d.editions.length > 1) o += head('Choose edition') + `<div class="shelf">${d.editions.map((e, i) => `<div class="fx ed" data-k="ed${i}" data-act="buy" data-arg="${i}"><b>${esc(e.name || 'Standard')}</b><span>${e.discount ? `<i class="disc">-${e.discount}%</i>` : ''}${esc(e.price)}</span></div>`).join('')}</div>`;
      if (this.rsum) o += head('Reviews') + `<div class="fx srow" data-k="rv-sum" data-act="allrev"><div class="rvi ${this.rsum.pct >= 70 ? 'up' : this.rsum.pct >= 40 ? '' : 'dn'}">${this.rsum.pct}%</div><div class="stx"><div class="t">${esc(this.rsum.desc)}</div><div class="s">${(this.rsum.total || 0).toLocaleString()} user reviews · ${(this.rsum.up || 0).toLocaleString()} positive · ${(this.rsum.down || 0).toLocaleString()} negative</div></div></div>`;
      if (this.rv && !this.rv.length && !this.rsum) o += head('Reviews') + `<div class="snone">${this.rwhy === 'no reviews yet' ? 'No reviews yet.' : 'Reviews could not be loaded' + (this.rwhy ? ' (' + esc(this.rwhy) + ')' : '') + '.'}</div>` + rowA('rv-retry', 'restart', 'Try again', { act: 'rvretry' });
      if (this.rv && this.rv.length) o += (this.rsum ? '' : head('Reviews')) + this.rv.map((r, i) => `<div class="fx srow rvr" data-k="rv${i}" data-act="rev" data-arg="${i}"><div class="rvi ${r.up ? 'up' : 'dn'}">${icon(r.up ? 'check' : 'x')}</div><div class="stx"><div class="t">${r.up ? 'Recommended' : 'Not recommended'} · ${r.hours} h played</div><div class="s">${esc(r.text.slice(0, 160))}</div></div></div>`).join('');
      if (this.rvAll && this.rvAll.length) o += rowA('g-allrv', 'star', 'Read more reviews (' + this.rvAll.length + ')', { act: 'allrev' });
      if (this.like && this.like.length) o += head('More like this') + `<div class="shelf">${this.like.map(i => wcard(i, 'ml')).join('')}</div>`;
      o += head('Details') + `<div class="details">` + [['Developer', (d.developers || []).join(', ')], ['Publisher', (d.publishers || []).join(', ')], ['Release date', d.release], ['Features', (d.categories || []).join(', ')], ['Languages', (d.languages || '').slice(0, 140)]].filter(r => r[1]).map(r => info(r[0], r[1])).join('') + '</div>';
      return o;
    },
    acts: {
      open(i) { V.open('game', i); },
      rvretry() { this.rv = null; this.rsum = null; this.rwhy = ''; V.refresh(this); api.reviewsFull(id).then(r => { r = r || {}; this.rvAll = r.list || []; this.rv = this.rvAll.slice(0, 4); this.rsum = r.summary || null; this.rwhy = r.why || ''; V.refresh(this); }); },
      allrev() { V.open('allreviews', { id, name: (this.d && this.d.name) || nameOf(id), list: this.rvAll, summary: this.rsum }); },
      rev(i) { const r = this.rv[+i]; V.dlg({ title: (r.up ? 'Recommended' : 'Not recommended') + ' · ' + r.hours + ' h played', msg: r.text, buttons: [{ label: 'Close' }] }); },
      play() { D.launchGame({ kind: 'game', id, name: nameOf(id) }, K.fx()); },
      install() { D.startInstall(id, (this.d && this.d.name) || nameOf(id)); },
      buy(i) { const d = this.d || {}, e = (d.editions || [])[+i >= 0 ? +i : 0]; buyApp(id, d.name, e && e.pkg, d.free); },
      wl() { const w = S.pref.wish, i = w.findIndex(x => x.id === id); i < 0 ? w.push({ id, name: this.d.name }) : w.splice(i, 1); D.setPref('wish', w); D.toast(i < 0 ? 'Added to your wishlist.' : 'Removed from your wishlist.'); if (S.chat && S.chat.state === 'in') Promise.resolve(api.wishSet(id, i < 0)).then(r => { if (r && !r.ok) D.toast('Saved here, but Steam did not accept the change.'); }); V.refresh(this); },
      trailer() { const d = this.d; V.player((d.movies && d.movies[0] && d.movies[0].url) || d.trailer, d.name); },
      movie(i) { const m = this.d.movies[+i]; V.player(m.url, m.name || this.d.name); },
      shot(i) { V.lightbox(this.d.shots.map(s => ({ src: s.full, cap: this.d.name })), +i); },
      news(i) { V.open('news', this.news[+i]); },
      more() {
        const r = K.fx().getBoundingClientRect(), it = [{ icon: 'people', label: 'Community hub', run: () => V.open('ghub', id) }];
        if (inst()) it.push({ icon: 'folder', label: 'Browse local files', run: () => api.gameAction(id, 'files') });
        D.openMenu(it, { top: Math.min(r.bottom + 10, innerHeight - 220) + 'px', left: r.left + 'px', transformOrigin: 'top left' }, null, 'view');
      },
    } };
  return v;
};

/* ============================================================ NEWS READER */
VIEWS.news = n => ({ title: n.gameName || '', icon: 'news', cls: 'gameV', body: 'read', a: null,
  load() { Promise.resolve(api.newsArticle ? api.newsArticle(n.gameId, n.gid) : null).then(a => { this.a = a || {}; V.refresh(this); }); },
  bg() { return (this.a && this.a.image) || n.image || D.hdr(n.gameId); },
  html() {
    const a = this.a || {}, bl = a.blocks && a.blocks.length ? a.blocks : [{ t: 'p', v: n.snippet || '' }];
    let o = `<div class="fx nb t" data-k="nb-t"><div class="nrm">${esc(n.gameName || '')} <i></i> ${esc(when(a.date || n.date))}${a.author ? ' <i></i> ' + esc(a.author) : ''}</div><div class="nrt">${esc(a.title || n.title)}</div></div>`;
    if (!this.a) return o + '<div class="snone l">Loading the article…</div>';
    let skipped = false;
    bl.forEach((b, i) => {
      if (b.t === 'img') { if (!skipped && a.image === b.v) { skipped = true; } o += `<div class="fx nb im" data-k="nb${i}" data-act="img" data-arg="${esc(b.v)}"><img loading="lazy" src="${esc(b.v)}" onerror="this.parentNode.remove()"></div>`; }
      else if (b.t === 'h') o += `<div class="fx nb h" data-k="nb${i}">${esc(b.v)}</div>`;
      else if (b.t === 'li') o += `<div class="fx nb li" data-k="nb${i}"><i></i>${esc(b.v)}</div>`;
      else o += `<div class="fx nb p" data-k="nb${i}">${esc(b.v)}</div>`;
    });
    return o;
  },
  acts: { img(src) { V.lightbox([{ src, cap: n.title }], 0); } } });

/* ============================================================== DOWNLOADS */
const fmtB = b => !b ? '0 MB' : b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB';
const STATE = { queued: 'Waiting', starting: 'Starting', downloading: 'Downloading', paused: 'Paused', error: 'Problem', done: 'Installed', login: 'Needs sign-in' };
VIEWS.downloads = () => ({ title: 'Downloads', icon: 'download', body: 'col',
  load() { Promise.resolve(api.dlList && api.dlList()).then(l => { S.dl = l || []; V.refresh(this); }); },
  html() {
    const l = S.dl.slice().sort((a, b) => ['downloading', 'starting', 'queued', 'login', 'paused', 'error', 'done'].indexOf(a.state) - ['downloading', 'starting', 'queued', 'login', 'paused', 'error', 'done'].indexOf(b.state));
    if (!l.length) return empty('download', 'No downloads', 'Install a game from your Library or the Store and it will download here, without opening Steam.', `<div class="fx pill" data-k="dl-lib" data-act="lib">${icon('grid')}Open Library</div>`) +
      (S.chat && S.chat.state === 'in' ? '' : head('Account') + rowA('dl-acc', 'user', 'Steam account for downloads', { act: 'acc', right: S.dlLogin || 'Sign in', sub: 'Sign in to your Steam account to download games. Your password is never saved.' }));
    return l.map(i => {
      const pct = Math.round(i.progress || 0), act = ['downloading', 'starting', 'queued'].includes(i.state);
      const sub = i.state === 'downloading' ? `${fmtB(i.bytes)} of ${fmtB(i.total)}${i.speed ? ' · ' + fmtB(i.speed) + '/s' : ''} · ${esc(i.msg || '')}` : esc(i.msg || STATE[i.state] || '');
      return `<div class="fx srow dlrow ${i.state}" data-k="d${i.id}" data-act="dl" data-arg="${i.id}"><img src="${headerU(i.id)}" onerror="this.style.visibility='hidden'"><div class="stx"><div class="t">${esc(i.name)}</div>${bar(i.state === 'done' ? 100 : pct, act ? 'live' : '')}<div class="s">${sub}</div></div><div class="sr2"><span class="dst ${i.state}">${i.state === 'done' ? icon('check') : i.state === 'paused' ? icon('pause') : i.state === 'error' ? icon('info') : pct + '%'}</span></div></div>`;
    }).join('') + (S.chat && S.chat.state === 'in' ? '' : head('Account') + rowA('dl-acc', 'user', 'Steam account for downloads', { act: 'acc', right: S.dlLogin || 'Sign in', sub: 'Sign in to your Steam account to download games. Your password is never saved.' }));
  },
  after() { if (S.dlLogin === undefined && api.dlLibs) { S.dlLogin = ''; Promise.resolve(api.dlLibs()).then(r => { S.dlLogin = r.login || ''; V.refresh(this); }); } },
  acts: {
    lib() { V.open('library'); },
    acc() { V.open('steamlogin'); },
    dl(id) {
      const i = S.dl.find(x => x.id === id), el = K.fx(), r = el.getBoundingClientRect(); if (!i) return;
      const it = [];
      if (i.prompt) it.push({ icon: 'user', label: i.prompt.kind === 'user' ? 'Enter account name' : i.prompt.kind === 'password' ? 'Enter password' : 'Enter Steam Guard code', run: () => { V.osk({ title: i.prompt.kind === 'password' ? 'Steam password (sent only to Steam)' : i.prompt.kind === 'guard' ? 'Steam Guard code' : 'Steam account name', secret: i.prompt.kind === 'password', max: 64 }).then(v => { if (v) api.dlAnswer(id, i.prompt.kind, v); }); } });
      if (i.state === 'error' || i.state === 'login' || i.prompt) it.push({ icon: 'steam', label: 'Install with Steam instead', run: () => { api.gameAction && api.gameAction(id, 'install'); } });
      if (['downloading', 'starting', 'queued'].includes(i.state)) it.push({ icon: 'pause', label: 'Pause', run: () => api.dlPause(id) });
      if (['paused', 'error', 'login'].includes(i.state)) it.push({ icon: 'play', label: 'Resume', run: () => api.dlResume(id) });
      if (i.state === 'done') it.push({ icon: 'play', label: 'Play', run: () => D.launchGame({ kind: 'game', id, name: i.name }, null) });
      if (i.state !== 'done') { it.push({ icon: 'x', label: 'Cancel (keep files)', run: () => api.dlCancel(id, false) }); it.push({ icon: 'trash', label: 'Cancel and delete files', run: () => V.dlg({ title: 'Delete partial download?', msg: i.name, buttons: [{ label: 'Delete', run: () => api.dlCancel(id, true) }, { label: 'Keep' }] }) }); }
      else it.push({ icon: 'x', label: 'Remove from list', run: () => api.dlCancel(id, false) });
      D.openMenu(it, { top: Math.min(r.top, innerHeight - 300) + 'px', left: '50%', transformOrigin: 'top left' }, esc(i.name), 'view');
    },
  } });
V.refreshDl = () => { const t = K.top(); if (t && t.name === 'downloads') V.refresh(t); };

/* ======================================================= MEDIA: APPS & VIDEO */
const appTile = a => `<div class="fx appt" data-k="ap-${a.id}" data-act="app" data-arg="${a.id}" style="--g0:${a.grad[0]};--g1:${a.grad[1]}"><div class="appi${a.logo ? ' lg' : ''}">${a.logo ? logo(a.logo) : icon(a.icon)}</div><div class="appn">${esc(a.name)}</div></div>`;
const appActs = { app(id) { const a = D.APPS.find(x => x.id === id); if (a) { V.closeAll(); D.launchApp(a); } }, open(id) { V.open('game', id); }, goall() { V.back(); V.open('apps'); } };
VIEWS.apps = () => ({ title: 'All Apps', icon: 'grid', body: 'wide',
  html: () => { const A = D.APPS, vm = A.filter(a => ['Video', 'Music'].includes(a.tag)), ot = A.filter(a => !vm.includes(a)); return head('Video and music apps') + `<div class="grid g5 apps">${vm.map(appTile).join('')}</div>` + (ot.length ? head('Photos, web and utilities') + `<div class="grid g5 apps">${ot.map(appTile).join('')}</div>` : ''); },
  acts: appActs });
VIEWS.applib = () => ({ title: 'App Library', icon: 'applib', body: 'wide',
  html() { const l = S.pref.appsUsed.map(id => D.APPS.find(a => a.id === id)).filter(Boolean); return l.length ? head('Recently opened') + `<div class="grid g5 apps">${l.map(appTile).join('')}</div>` : empty('applib', "There's nothing here yet", 'Visit All Apps to get started.', `<div class="fx btn w pri2" data-k="al-go" data-act="goall">Go to All Apps</div>`); },
  acts: appActs });
VIEWS.tv = () => ({ title: 'TV & Video', icon: 'film', body: 'wide',
  load() { if (!S.vids && api.videos) Promise.resolve(api.videos()).then(v => { S.vids = v || []; V.refresh(this); }); },
  html() {
    const yt = D.APPS[0];
    let o = head('YouTube') + `<div class="shelf"><div class="fx wc yt" data-k="tv-yt" data-act="app" data-arg="youtube" style="--g0:${yt.grad[0]};--g1:${yt.grad[1]}"><div class="appi lg">${logo('youtube')}</div><div class="wn">YouTube</div></div></div>`;
    const tr = S.games.map(g => { const d = S.data[g.id], m = d && d.details && d.details.movies; return m && m[0] ? { g, m: m[0] } : null; }).filter(Boolean);
    if (tr.length) o += head('Trailers from your games') + `<div class="shelf">${tr.map(x => `<div class="fx wc" data-k="tr${x.g.id}" data-act="trailer" data-arg="${esc(x.m.url)}"><img loading="lazy" src="${esc(x.m.thumb || headerU(x.g.id))}"><i class="playb">${icon('play')}</i><div class="wn">${esc(x.g.name)}</div></div>`).join('')}</div>`;
    if (S.vids && S.vids.length) o += head('Your videos') + `<div class="shelf">${S.vids.slice(0, 12).map(x => `<div class="fx wc" data-k="vd${x.id}" data-act="trailer" data-arg="${esc(x.src)}"><video muted preload="metadata" src="${esc(x.src)}#t=0.6"></video><i class="playb">${icon('play')}</i><div class="wn">${esc(x.name)}</div></div>`).join('')}</div>`;
    return o;
  },
  acts: { app: appActs.app, open: appActs.open, trailer(url) { V.player(url); } } });

/* ================================================================= GALLERY */
const SRC_IC = { steam: 'steam', dash: 'camera', windows: 'windows', store: 'sparkle' };
VIEWS.gallery = () => ({ title: 'Gallery', icon: 'camera', body: 'wide', d: null, vids: null, tabI: 0,
  tabs: [['all', 'grid', 'All'], ['steam', 'steam', 'Steam'], ['dash', 'camera', 'Captures'], ['windows', 'windows', 'Windows'], ['video', 'film', 'Videos'], ['disc', 'sparkle', 'Discover']],
  load() { Promise.resolve(api.gallery()).then(d => { this.d = d || []; V.refresh(this); }); Promise.resolve(api.videos ? api.videos() : []).then(v => { this.vids = v || []; S.vids = this.vids; V.refresh(this); }); },
  discover() {
    const out = [];
    S.games.forEach(g => { const sh = S.data[g.id] && S.data[g.id].details && S.data[g.id].details.shots; (sh || []).slice(0, 3).forEach((x, i) => out.push({ id: 'dc' + g.id + i, src: x.full, thumb: x.thumb, appid: g.id, time: 0, source: 'store' })); });
    if (!out.length && S.store && S.store.shelves[0]) S.store.shelves[0].items.slice(0, 8).forEach(i => out.push({ id: 'dc' + i.id, src: i.img, thumb: i.img, appid: i.id, time: 0, source: 'store', name: i.name }));
    return out;
  },
  list() { const k = this.tabs[this.tabI][0]; if (k === 'video') return this.vids || []; if (k === 'disc') return this.discover(); return (this.d || []).filter(x => k === 'all' || x.source === k); },
  cnt(k) { return k === 'all' ? (this.d || []).length : k === 'video' ? (this.vids || []).length : k === 'disc' ? 0 : (this.d || []).filter(x => x.source === k).length; },
  html() {
    let o = `<div class="chips">${this.tabs.map((t, i) => chip('gt' + i, t[1], t[2], 'tab', i, i === this.tabI, this.cnt(t[0]))).join('')}</div>`;
    const k = this.tabs[this.tabI][0];
    if (!this.d) return o + '<div class="snone">Loading…</div>';
    let l = this.list(), note = '';
    if (!l.length) {
      const msg = { all: ['No captures yet', 'Press F12 in betterSBP, or Ctrl+Alt+S anywhere, to take a screenshot. Steam screenshots (F12 in a game) appear here too.'], steam: ['No Steam screenshots', 'Press F12 while playing a game in Steam.'], dash: ['No betterSBP captures', 'Press F12 in betterSBP or Ctrl+Alt+S anywhere.'], windows: ['No Windows screenshots', 'Win+PrtSc saves into Pictures > Screenshots.'], video: ['No videos found', 'Recordings from Xbox Game Bar (Win+Alt+R) appear here.'], disc: ['Nothing to discover yet', 'Screenshots appear once your games finish loading.'] }[k];
      o += empty(this.tabs[this.tabI][1], msg[0], msg[1]);
      if (k !== 'disc') { l = this.discover(); note = 'Get inspired: screenshots from your games'; }
      if (!l.length) return o;
    }
    if (note) o += head(note);
    if (k === 'video') return o + `<div class="grid g4">${l.map((x, i) => `<div class="fx shotc vid" data-k="v${x.id}" data-act="play" data-arg="${i}"><video muted preload="metadata" src="${esc(x.src)}#t=0.6"></video><i class="srcb">${icon('film')}</i><i class="playb">${icon('play')}</i><div class="shn">${esc(x.name)}<small>${esc(x.from)} · ${dstr(x.time)}</small></div></div>`).join('')}</div>`;
    return o + `<div class="grid g4">${l.map((x, i) => `<div class="fx shotc" data-k="p${x.id}" data-act="view" data-arg="${i}">${`<img loading="lazy" src="${esc(x.thumb || x.src)}" onerror="this.style.visibility='hidden'">`}<i class="srcb">${icon(SRC_IC[x.source] || 'camera')}</i><div class="shn">${x.appid ? esc(nameOf(x.appid)) : esc(x.name || '')}<small>${x.time ? dstr(x.time) : 'From the store'}</small></div></div>`).join('')}</div>`;
  },
  tab(d) { this.tabI = (this.tabI + d + this.tabs.length) % this.tabs.length; this.fk = 'gt' + this.tabI; V.refresh(this); },
  acts: {
    tab(i) { this.tabI = +i; V.refresh(this); },
    view(i) { const l = this.list(); V.lightbox(l.map(x => ({ src: x.src, cap: (x.appid ? nameOf(x.appid) + (x.time ? ' · ' : '') : '') + (x.time ? dstr(x.time) : '') })), +i); },
    play(i) { V.player(this.list()[+i].src); },
  } });

/* ============================================================ SETTINGS PAGES */
V.SETTINGS.splice(7, 0, ['downloads', 'download', 'Downloads']);
V.PAGES.downloads = () => ({ title: 'Downloads', d: null,
  load() { Promise.resolve(api.dlLibs ? api.dlLibs() : { libs: [], login: '' }).then(d => { this.d = d; S.dlLogin = d.login || ''; V.refresh(this); }); },
  html() {
    const d = this.d || { libs: [] };
    return head('Download from betterSBP') + rowA('dl-open', 'download', 'Open Downloads', { act: 'open', right: activeDl() ? activeDl() + ' active' : '' }) +
      (S.chat && S.chat.state === 'in' ? '' : rowA('dl-acc', 'user', 'Steam account for downloads', { act: 'acc', right: d.login || 'Not set', sub: 'Your Steam login name. Better: sign in to Steam once under Friends or Settings and downloads use that same login.' })) +
      rowT('dl-sp', 'shield', 'Use my Steam login for downloads', 'dlSavePass', 'Keeps your Steam password encrypted on this PC (Windows keystore) so downloads never ask again. Off: asked once per session.') +
      rowA('dl-lib', 'disk', 'Install location', { act: 'lib', right: S.pref.dlLib || 'Ask each time', sub: 'Games are installed into this Steam library folder.' }) +
      head('How it works') + card('betterSBP downloads games with Valve\'s SteamCMD, so the Steam window is not needed. Steam does not need to be running. You can only download games you own.');
  },
  acts: {
    open() { V.open('downloads'); },
    acc() { V.osk({ title: 'Steam account name (login name)', value: S.dlLogin || '', max: 64 }).then(r => { if (r !== null) { api.dlLogin(r.trim()); S.dlLogin = r.trim(); this.d.login = r.trim(); V.refresh(this); } }); },
    lib() { const L = (this.d && this.d.libs) || []; D.openMenu([{ icon: 'circle', label: 'Ask each time', run: () => { D.setPref('dlLib', ''); V.refresh(this); } }, ...L.map(l => ({ icon: 'disk', label: l.path, sub: gb(l.free) + ' free', run: () => { D.setPref('dlLib', l.path); V.refresh(this); } }))], { top: '30%', left: '50%', transformOrigin: 'top left' }, 'Install location', 'view'); },
  } });
// extra toggles on existing pages
const sysH = V.PAGES.system, accH = V.PAGES.accessories;
V.PAGES.system = () => { const p = sysH(), h0 = p.html; p.html = function () { return h0.call(this) + head('While playing') + rowT('y-low', 'power', 'Save resources while a game runs', 'lowPower', 'Pauses music, animations and background work and lowers betterSBP\'s priority so your game gets the CPU.') + rowT('y-boot', 'power', 'Start screen', 'bootScreen', 'Shows the welcome screen when betterSBP opens.') + rowC('y-lm', 'play', 'Launch games', 'launchMode', ['direct', 'steam'], x => x === 'direct' ? 'Directly (no Steam)' : 'Through Steam', 'Directly starts the game from betterSBP without opening Steam at all. If a game refuses to start without Steam, betterSBP offers to launch it through Steam next time.') + rowT('y-lean', 'bolt', 'Lean Steam mode', 'leanSteam', 'Starts Steam silently without its web browser (steamwebhelper) and keeps it at low priority while you play. Overlay and in-Steam store pages are unavailable.'); }; return p; };
V.PAGES.accessories = () => { const p = accH(), h0 = p.html; p.html = function () { return h0.call(this) + head('Guide button') + rowT('x-guide', 'pad', 'Guide button opens betterSBP', 'guideDash', 'While betterSBP is open, if Steam grabs the controller\'s Guide/PS button, betterSBP closes it and takes you back here.') + card('For the cleanest result, open Steam > Settings > Controller and turn off the options that open Steam with the Guide button.'); }; return p; };
})();
