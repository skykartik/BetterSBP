const { dialog, session, safeStorage, app, BrowserWindow, WebContentsView, ipcMain, protocol, shell, net, globalShortcut, nativeImage, screen, desktopCapturer } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const steam = require('./steam');
const createDownloads = require('./downloads');
const netctl = require('./netctl');
const createChat = require('./chat'), createXbox = require('./xbox'), createDiscord = require('./discord');
const watchGuide = require('./guide');
let chat = null, lastIn = null, xbox = null;

// Set to true to let the Power menu really sleep / shut down / restart the PC.
const POWER_ENABLED = false;
const WIN = process.platform === 'win32';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{
  scheme: 'dash',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true },
}]);

// One fixed data folder, so rebuilding / re-extracting the app never loses your Steam login or settings.
try {
  const base = app.getPath('appData'), ud = path.join(base, 'betterSBP');
  if (!fs.existsSync(path.join(ud, 'config.json')) && !fs.existsSync(path.join(ud, 'steam-token.bin'))) {
    for (const old of ['betterSBP', 'better-sbp', 'dash-app', 'dash', 'Dash', 'Electron']) {
      const o = path.join(base, old); if (o === ud || !fs.existsSync(path.join(o, 'config.json')) && !fs.existsSync(path.join(o, 'steam-token.bin'))) continue;
      fs.mkdirSync(ud, { recursive: true });
      for (const f of ['config.json', 'steam-token.bin']) { try { fs.copyFileSync(path.join(o, f), path.join(ud, f)); } catch {} }
      try { fs.cpSync(path.join(o, 'steam-user'), path.join(ud, 'steam-user'), { recursive: true }); } catch {}
      break;
    }
  }
  app.setPath('userData', ud);
} catch {}
let noSteam = false, popWin = null, win = null, root = null, user = null, stats = {}, games = [], cacheDir = '', cfg = {}, ostStarted = false;

const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const clean = s => String(s || '')
  .replace(/\[\/?[a-z0-9*]+[^\]]*\]/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ artwork
const ART = {
  hero: ['library_hero.jpg', 'page_bg_generated_v6b.jpg', 'library_header.jpg'],
  logo: ['logo.png'],
  cover: ['library_600x900.jpg', 'library_capsule.jpg', 'capsule_616x353.jpg', 'header.jpg'],
  header: ['header.jpg', 'capsule_616x353.jpg', 'library_header.jpg'],
};
const BASES = [
  'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/',
  'https://cdn.akamai.steamstatic.com/steam/apps/',
];

async function ensureArt(id, kind) {
  const dir = mk(path.join(cacheDir, 'art', id));
  const hit = fs.readdirSync(dir).find(f => f.startsWith(kind + '.'));
  if (hit) return `dash://art/${id}/${hit}`;
  const marker = path.join(dir, 'none-' + kind);
  if (fs.existsSync(marker) && Date.now() - fs.statSync(marker).mtimeMs < 864e5) return null;
  const loc = root && steam.localArt(root, id, kind);
  if (loc) {
    const ext = path.extname(loc);
    fs.copyFileSync(loc, path.join(dir, kind + ext));
    return `dash://art/${id}/${kind}${ext}`;
  }
  for (const name of ART[kind]) for (const base of BASES) {
    try {
      const r = await net.fetch(base + id + '/' + name);
      if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) continue;
      const ext = path.extname(name);
      fs.writeFileSync(path.join(dir, kind + ext), Buffer.from(await r.arrayBuffer()));
      return `dash://art/${id}/${kind}${ext}`;
    } catch {}
  }
  // fallbacks: Steam store page images, then Wikipedia
  try {
    const d = await getDetails(id), u = (d && d.artUrls) || {}, A = (await storeAssets(id).catch(() => null)) || {};
    const cands = kind === 'hero' ? [A.hero, u.hero, u.shot, u.header, u.wikiOrig] : kind === 'cover' ? [A.cover, u.cover, A.header, u.header, u.wikiThumb, u.hero] : kind === 'header' ? [A.header, u.header, u.cover, u.shot] : kind === 'logo' ? [A.logo] : [];
    for (const url of cands.filter(Boolean)) {
      try {
        const r = await net.fetch(url);
        if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) continue;
        const ext = (path.extname(new URL(url).pathname) || '.jpg').slice(0, 5);
        fs.writeFileSync(path.join(dir, kind + ext), Buffer.from(await r.arrayBuffer()));
        return `dash://art/${id}/${kind}${ext}`;
      } catch {}
    }
  } catch {}
  fs.writeFileSync(marker, '');
  return null;
}

// ------------------------------------------------------------ store details
const HIDE_TYPES = new Set(['application', 'tool', 'music', 'video', 'dlc', 'advertising', 'hardware', 'mod', 'series']);

async function wiki(name) {
  const t = String(name || '').replace(/[™®©]/g, '').trim(); if (!t) return null;
  for (const q of [t + ' (video game)', t]) {
    try {
      const r = await net.fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q.replace(/ /g, '_')), { headers: { 'Api-User-Agent': 'betterSBP/0.4' } });
      if (!r.ok) continue; const j = await r.json();
      if (j.type === 'disambiguation' || !j.extract) continue;
      if (!/game|video|studio|develop|released/i.test(j.description + ' ' + j.extract)) continue;
      return { extract: clean(j.extract), thumb: j.thumbnail && j.thumbnail.source, orig: j.originalimage && j.originalimage.source };
    } catch {}
  }
  return null;
}
const DET_V = 4;
const stripWiki = t => clean(String(t || '').replace(/\{\{[^}]*\|([^}|]*)\}\}/g, '$1').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, '').replace(/\{\{|\}\}/g, '')).replace(/\s*\|.*$/, '').trim();
// Extra metadata sources for games Steam has little about: SteamSpy, PCGamingWiki, Wikipedia infobox.
async function extraMeta(id, nm, d) {
  const need = () => !(d.developers && d.developers.length) || !(d.publishers && d.publishers.length) || !(d.genres && d.genres.length) || !d.release;
  const tj = async (u, ms = 6000) => { try { const r = await net.fetch(u, { signal: AbortSignal.timeout(ms) }); return r.ok ? r.json() : null; } catch { return null; } };
  if (need() && /^\d+$/.test(id)) {
    const s = await tj('https://steamspy.com/api.php?request=appdetails&appid=' + id);
    if (s && s.name) {
      if (!(d.developers && d.developers.length) && s.developer) d.developers = s.developer.split(/,\s*/);
      if (!(d.publishers && d.publishers.length) && s.publisher) d.publishers = s.publisher.split(/,\s*/);
      if (!(d.genres && d.genres.length) && s.genre) d.genres = s.genre.split(/,\s*/);
      if (s.tags && typeof s.tags === 'object') d.tags = Object.keys(s.tags).slice(0, 8);
      if (s.owners) d.owners = s.owners;
    }
  }
  if (need() && /^\d+$/.test(id)) {
    const p = await tj('https://www.pcgamingwiki.com/w/api.php?action=cargoquery&format=json&tables=Infobox_game&fields=Developers,Publishers,Released,Genres&where=' + encodeURIComponent('Steam_AppID HOLDS "' + id + '"'));
    const t = p && p.cargoquery && p.cargoquery[0] && p.cargoquery[0].title;
    if (t) {
      const L = x => String(x || '').split(',').map(a => a.replace(/^.*?:/, '').trim()).filter(Boolean);
      if (!(d.developers && d.developers.length) && t.Developers) d.developers = L(t.Developers);
      if (!(d.publishers && d.publishers.length) && t.Publishers) d.publishers = L(t.Publishers);
      if (!(d.genres && d.genres.length) && t.Genres) d.genres = L(t.Genres);
      if (!d.release && t.Released) d.release = String(t.Released).split(',')[0].replace(/^Windows:/, '').trim();
    }
  }
  if (need() && nm) {
    const q = await tj('https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=1&gsrsearch=' + encodeURIComponent(nm + ' video game') + '&prop=revisions&rvprop=content&rvslots=main&rvsection=0');
    const pg = q && q.query && q.query.pages && Object.values(q.query.pages)[0], wt = pg && pg.revisions && pg.revisions[0] && (pg.revisions[0].slots ? pg.revisions[0].slots.main['*'] : pg.revisions[0]['*']) || '';
    const f = k => { const m = new RegExp('\\|\\s*' + k + '\\s*=\\s*([^\\n]+)', 'i').exec(wt); return m ? stripWiki(m[1]) : ''; };
    if (wt) {
      if (!(d.developers && d.developers.length) && f('developer')) d.developers = [f('developer')];
      if (!(d.publishers && d.publishers.length) && f('publisher')) d.publishers = [f('publisher')];
      if (!(d.genres && d.genres.length) && f('genre')) d.genres = f('genre').split(/,\s*/).slice(0, 3);
      if (!d.release && f('released')) d.release = f('released').replace(/^.*?(\d{4}).*$/, '$1');
    }
  }
  // last resort: reviews summary gives a rating even for sparse apps
  if (/^\d+$/.test(id) && !d.reviewDesc) {
    const r = await tj(`https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0`);
    const q = r && r.query_summary; if (q && q.total_reviews) { d.reviewDesc = q.review_score_desc; d.reviewPct = Math.round(100 * q.total_positive / q.total_reviews); }
  }
  return d;
}
async function getDetails(id, nameHint) {
  const f = path.join(mk(path.join(cacheDir, 'details')), id + ((prefs().lang || 'english') === 'english' ? '' : '_' + prefs().lang) + '.json');
  const c = J(f, null);
  if (c && c.v === DET_V && Date.now() - c.t < 7 * 864e5) return c.d;
  let d = { type: 'unknown' };
  try {
    const r = await net.fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&l=${prefs().lang || 'english'}`);
    const e = (await r.json())[id];
    if (e && e.success) {
      const x = e.data, mv = (x.movies || [])[0];
      d = {
        type: x.type,
        desc: clean(x.short_description) || clean(x.about_the_game).slice(0, 360),
        developers: x.developers || [], publishers: x.publishers || [],
        genres: (x.genres || []).map(g => g.description),
        categories: (x.categories || []).map(g => g.description).slice(0, 8),
        release: x.release_date && x.release_date.date, metacritic: x.metacritic && x.metacritic.score, website: x.website || null,
        trailer: mv ? ((mv.mp4 && (mv.mp4['480'] || mv.mp4.max)) || (mv.webm && (mv.webm['480'] || mv.webm.max)) || null) : null,
        movies: (x.movies || []).slice(0, 4).map(m => ({ name: clean(m.name), thumb: m.thumbnail, url: (m.mp4 && (m.mp4.max || m.mp4['480'])) || (m.webm && (m.webm.max || m.webm['480'])) || null })).filter(m => m.url),
        shots: (x.screenshots || []).slice(0, 8).map(s => ({ thumb: s.path_thumbnail, full: s.path_full })),
        artUrls: { header: x.header_image && x.header_image.split('?')[0], cover: x.capsule_imagev5 || x.capsule_image, hero: x.background_raw || null, shot: x.screenshots && x.screenshots[0] && x.screenshots[0].path_full },
      };
    }
    // fill gaps from other sources so nothing is empty
    const nm = nameHint || (games.find(g => g.id === id) || {}).name;
    if (!d.desc || !d.artUrls || !d.artUrls.hero) {
      const w = await wiki(nm);
      if (w) { if (!d.desc) d.desc = w.extract.slice(0, 360); d.artUrls = Object.assign(d.artUrls || {}, { wikiThumb: w.thumb, wikiOrig: w.orig }); }
    }
    try { await extraMeta(id, nm, d); } catch {}
    if (!d.desc) d.desc = nm ? `${nm} is installed in your Steam library.` : '';
    if (!d.genres || !d.genres.length) d.genres = d.categories && d.categories.length ? d.categories.slice(0, 2) : [];
    fs.writeFileSync(f, JSON.stringify({ t: Date.now(), v: DET_V, d }));
  } catch { return c ? c.d : d; }
  return d;
}

// ------------------------------------------------- public Steam community data
const tagOf = (b, t) => { const m = new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`).exec(b); return m ? m[1].trim() : ''; };
// who is signed in = the Steam login of this app. The local Steam client's profile is only used when the user turns that on in Settings.
const sid = () => (chat && chat.me && chat.me().id) || (user && user.steamid) || '';
const acct = () => { const i = sid(); try { return i ? Number(BigInt(i) - 76561197960265728n) : (user && user.accountId) || 0; } catch { return 0; } };
const getJson = async url => (await net.fetch(url)).json();
const getText = async url => (await net.fetch(url)).text();

const achCache = new Map();
async function getAch(appid) {
  if (!sid()) return null;
  if (achCache.has(appid)) return achCache.get(appid);
  let out = null;
  try {
    const x = await getText(`https://steamcommunity.com/profiles/${sid()}/stats/${appid}/?xml=1`);
    const list = [...x.matchAll(/<achievement closed="(\d)">([\s\S]*?)<\/achievement>/g)].map(m => ({
      done: m[1] === '1', name: clean(tagOf(m[2], 'name')), desc: clean(tagOf(m[2], 'description')),
      icon: tagOf(m[2], m[1] === '1' ? 'iconClosed' : 'iconOpen'), time: parseInt(tagOf(m[2], 'unlockTimestamp') || '0', 10) * 1000,
    }));
    if (list.length) out = { earned: list.filter(a => a.done).length, total: list.length, list };
  } catch {}
  achCache.set(appid, out);
  return out;
}

// Games unlocked with a manifest / lua script (SteamTools "stplug-in" lua files, GreenLuma AppList) belong in the library even though Steam does not list them as owned.
async function unlockedApps() {
  if (!root) return [];
  const ids = new Set(), add = f => { const m = /^(\d{2,8})\.(lua|txt)$/i.exec(f); if (m) ids.add(m[1]); };
  for (const d of [path.join(root, 'config', 'stplug-in'), path.join(root, 'AppList'), path.join(root, 'plugin')]) { try { fs.readdirSync(d).forEach(add); } catch {} }
  // depot manifests that belong to an installed game's appmanifest also count
  const names = cfg.unlockNames = cfg.unlockNames || {}, out = [];
  for (const id of ids) {
    if (names[id] === false || SKIP_UNLOCK.has(id)) continue;
    if (!names[id]) {
      try {
        const j = JSON.parse(await getText(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&l=english`));
        const d = j && j[id] && j[id].success && j[id].data;
        names[id] = d && d.type === 'game' ? d.name : (d ? false : undefined);
        if (names[id] === undefined) { delete names[id]; continue; }
        saveCfg();
      } catch { continue; }
    }
    if (names[id]) out.push({ id, name: names[id] });
  }
  return out;
}
const SKIP_UNLOCK = new Set(['228980', '1070560', '1391110', '1493710', '1628350']);
let libCache = { t: 0, v: null };
async function getLibrary() {
  if (libCache.v && Date.now() - libCache.t < 10 * 60e3) return libCache.v;
  let list = null, source = 'local', note = '';
  try {
    const o = chat && await chat.owned();
    if (o && o.length) { list = o.map(g => ({ id: g.id, name: g.name, minutes: 0, last: 0 })); source = 'account'; }
  } catch {}
  if (sid()) {
    try {
      const x = await getText(`https://steamcommunity.com/profiles/${sid()}/games/?tab=all&xml=1`);
      const l = [...x.matchAll(/<game>([\s\S]*?)<\/game>/g)].map(m => ({
        id: tagOf(m[1], 'appID'), name: clean(tagOf(m[1], 'name')), minutes: Math.round(parseFloat((tagOf(m[1], 'hoursOnRecord') || '0').replace(',', '')) * 60), last: 0 })).filter(g => g.id);
      if (l.length) { if (!list) { list = l; source = 'xml'; } else { const m = new Map(l.map(g => [g.id, g])); list.forEach(g => { const x = m.get(g.id); if (x) g.minutes = x.minutes; }); } }
    } catch {}
  }
  try { const un = await unlockedApps(); if (un.length) { list = list || []; const h0 = new Set(list.map(g => g.id)); un.forEach(g => { if (!h0.has(g.id)) list.push({ id: g.id, name: g.name, minutes: 0, last: 0, unlocked: true }); }); if (source === 'local') source = 'unlocked'; } } catch {}
  if (!list) { list = []; { const st = chat && chat.status().state; note = st === 'in' ? 'Your library is still loading from Steam…' : (st === 'connecting' || st === 'qr' || st === 'guard') ? 'Connecting to Steam…' : 'Sign in to Steam to see your whole library, installed or not.'; } }
  const have = new Set(list.map(g => g.id));
  for (const g of games) if (!have.has(g.id)) list.push({ id: g.id, name: g.name, minutes: 0, last: 0, ns: !!g.nonSteam });
  const inst = new Set(games.map(g => g.id));
  const out = {
    source, note,
    games: list.map(g => {
      const s = stats[g.id] || {};
      return { id: g.id, name: g.name, minutes: Math.max(g.minutes, s.playtime || 0), last: s.lastPlayed || g.last || 0, installed: inst.has(g.id), ns: !!g.ns, unlocked: !!g.unlocked };
    }).filter(g => g.name),
  };
  libCache = { t: source === 'account' ? Date.now() : Date.now() - 10 * 60e3 + 8000, v: out };   // an incomplete (not yet signed-in) list is only reused for a few seconds
  return out;
}

async function getProfile(id) {
  id = id || sid();
  if (!id) return { error: 'No Steam account found.' };
  try {
    const x = await getText(`https://steamcommunity.com/profiles/${id}/?xml=1`);
    if (/<error>/.test(x) || !/<steamID64>/.test(x)) return { error: 'This profile is private or unavailable.' };
    const p = {
      id, name: clean(tagOf(x, 'steamID')), avatar: tagOf(x, 'avatarFull'), online: tagOf(x, 'onlineState'), status: clean(tagOf(x, 'stateMessage')),
      realName: clean(tagOf(x, 'realname')), location: clean(tagOf(x, 'location')), since: tagOf(x, 'memberSince'), headline: clean(tagOf(x, 'headline')),
      summary: clean(tagOf(x, 'summary')).slice(0, 400), hours2w: tagOf(x, 'hoursPlayed2Wk'), level: null,
      most: [...x.matchAll(/<mostPlayedGame>([\s\S]*?)<\/mostPlayedGame>/g)].map(m => {
        const a = /\/app\/(\d+)/.exec(tagOf(m[1], 'gameLink')); return { id: a && a[1], name: clean(tagOf(m[1], 'gameName')), hours: tagOf(m[1], 'hoursOnRecord') };
      }).filter(g => g.id).slice(0, 6),
    };
    return p;
  } catch { return { error: 'Could not reach Steam.' }; }
}

async function getFriends() {
  if (!sid()) return { mode: 'none', friends: [], note: 'No Steam account found.' };
  const f = user ? steam.localFriends(root, user.accountId) : [];
  return { mode: 'local', friends: f, note: 'Sign in to Steam (Settings > Users and Accounts) to see who is online and what they are playing.' };
}

// ------------------------------------------------------------------- store
const cc = () => String(cfg.cc || (app.getLocaleCountryCode && app.getLocaleCountryCode()) || 'US').toLowerCase();
const money = (cur, c) => { try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(c / 100); } catch { return (c / 100).toFixed(2) + ' ' + cur; } };
let featCache = { t: 0, v: null };
async function storeFeatured() {
  if (featCache.v && Date.now() - featCache.t < 15 * 60e3) return featCache.v;
  const j = await getJson(`https://store.steampowered.com/api/featuredcategories?cc=${cc()}&l=english`);
  const titles = { top_sellers: 'Top Sellers', specials: 'Special Offers', new_releases: 'New Releases', coming_soon: 'Coming Soon' };
  const shelves = Object.keys(titles).filter(k => j[k] && j[k].items).map(k => ({
    title: titles[k],
    items: j[k].items.filter(i => i.id && i.type !== 'bundle' || i.name).slice(0, 14).map(i => ({
      id: String(i.id), name: i.name, img: i.large_capsule_image || i.header_image,
      price: i.final_price != null ? (i.final_price === 0 ? 'Free' : money(i.currency, i.final_price)) : (k === 'coming_soon' ? 'Coming soon' : ''),
      orig: i.discounted ? money(i.currency, i.original_price) : null, discount: i.discounted ? i.discount_percent : 0,
    })),
  }));
  featCache = { t: Date.now(), v: { shelves } };
  return featCache.v;
}
async function storeSearch(q) {
  const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=${cc()}`);
  return (j.items || []).filter(i => i.type === 'app').slice(0, 24).map(i => ({
    id: String(i.id), name: i.name, price: i.price ? (i.price.final === 0 ? 'Free' : money(i.price.currency, i.price.final)) : '',
    orig: i.price && i.price.final < i.price.initial ? money(i.price.currency, i.price.initial) : null,
    discount: i.price && i.price.initial ? Math.round((1 - i.price.final / i.price.initial) * 100) : 0,
  }));
}
const TAGS = { Action: 19, Adventure: 21, RPG: 122, Strategy: 9, Simulation: 599, Indie: 492, Casual: 597, Racing: 699, Sports: 701, 'Co-op': 1685, Horror: 1667, 'Open World': 1695, Puzzle: 1664, Shooter: 1663, Multiplayer: 3859, Anime: 4085 };
const SORTS = { best: '&filter=topsellers', new: '&filter=popularnew', special: '&specials=1', upcoming: '&filter=comingsoon', free: '&maxprice=free' };
async function storeBrowse({ tag, sort, start }) {
  const url = `https://store.steampowered.com/search/results/?query&start=${start || 0}&count=48&infinite=1&category1=998&cc=${cc()}&l=english${SORTS[sort] || SORTS.best}${tag ? '&tags=' + tag : ''}`;
  const j = await getJson(url), html = String(j.results_html || '');
  const items = [];
  for (const blk of html.split('<a href=').slice(1)) {
    const id = /data-ds-appid="(\d+)"/.exec(blk), t = /<span class="title">([\s\S]*?)<\/span>/.exec(blk);
    if (!id || !t) continue;
    const pct = /discount_pct">-?(\d+)%/.exec(blk), orig = /discount_original_price">([^<]*)</.exec(blk), fin = /discount_final_price(?: free)?">([^<]*)</.exec(blk);
    items.push({ id: id[1].split(',')[0], name: clean(t[1]), price: fin ? clean(fin[1]) : '', orig: orig ? clean(orig[1]) : null, discount: pct ? +pct[1] : 0 });
  }
  return { items, total: j.total_count || items.length, start: start || 0 };
}
async function storeReviews(id) {
  try {
    const j = await getJson(`https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0`), q = j.query_summary || {};
    return q.total_reviews ? { label: q.review_score_desc, pct: Math.round(q.total_positive / q.total_reviews * 100), total: q.total_reviews } : null;
  } catch { return null; }
}
const appCache = new Map();
async function storeApp(id) {
  if (appCache.has(id)) return appCache.get(id);
  const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=${cc()}&l=english`);
  const e = j[id]; if (!e || !e.success) return null;
  const x = e.data, po = x.price_overview, mv = (x.movies || [])[0];
  const out = {
    id, name: x.name, type: x.type, desc: clean(x.short_description), developers: x.developers || [], publishers: x.publishers || [],
    genres: (x.genres || []).map(g => g.description), release: x.release_date && x.release_date.date, free: !!x.is_free,
    price: po ? { final: po.final_formatted || money(po.currency, po.final), initial: po.discount_percent ? (po.initial_formatted || money(po.currency, po.initial)) : null, discount: po.discount_percent } : null,
    shots: (x.screenshots || []).slice(0, 10).map(s => ({ thumb: s.path_thumbnail, full: s.path_full })),
    trailer: mv ? ((mv.mp4 && (mv.mp4.max || mv.mp4['480'])) || (mv.webm && (mv.webm.max || mv.webm['480'])) || null) : null,
    movies: (x.movies || []).slice(0, 5).map(m => ({ name: clean(m.name), thumb: m.thumbnail, url: (m.mp4 && (m.mp4.max || m.mp4['480'])) || (m.webm && (m.webm.max || m.webm['480'])) || null })).filter(m => m.url),
    metacritic: x.metacritic && x.metacritic.score, languages: clean(x.supported_languages || '').replace(/\*languages with full audio support/i, ''),
    platforms: x.platforms || {}, categories: (x.categories || []).slice(0, 6).map(c => c.description),
    age: x.required_age ? String(x.required_age) : '', notes: clean((x.content_descriptors && x.content_descriptors.notes) || ''), dlc: (x.dlc || []).length, dlcIds: (x.dlc || []).slice(0, 8),
    storage: (/(?:Storage|Hard Drive|Hard Disk|Disk Space)[^:]*:\s*([^<\n]+?)(?:<|\n|$)/i.exec(String((x.pc_requirements && x.pc_requirements.minimum) || '')) || [])[1] || '',
    editions: ((x.package_groups || [])[0] ? (x.package_groups[0].subs || []) : []).slice(0, 4).map(p => ({ pkg: p.packageid, name: clean(String(p.option_text || '').replace(/ - .*$/, '')), price: p.price_in_cents_with_discount != null ? (p.price_in_cents_with_discount === 0 ? 'Free' : money(po ? po.currency : 'USD', p.price_in_cents_with_discount)) : '', discount: p.percent_discount || 0 })),
    about: clean(x.about_the_game || '').slice(0, 3500), legal: clean(x.legal_notice || '').slice(0, 900), reqMin: clean((x.pc_requirements && x.pc_requirements.minimum) || '').replace(/Minimum:\s*/i, '').slice(0, 700),
    background: x.background_raw || null, website: x.website || null,
    movies: (x.movies || []).slice(0, 4).map(m => ({ name: clean(m.name), thumb: m.thumbnail, url: (m.mp4 && (m.mp4.max || m.mp4['480'])) || (m.webm && (m.webm.max || m.webm['480'])) || null })).filter(m => m.url),
  };
  out.reviews = await storeReviews(id);
  appCache.set(id, out);
  return out;
}

const nameOf = id => { const g = games.find(x => x.id === String(id)); return g ? g.name : ''; };
const gameCache = new Map();
// non-Steam games: find the same game in the Steam store (by exact name) to borrow its artwork + description; otherwise use the program's own icon
const normN = s => String(s || '').toLowerCase().replace(/[™®©:'’\-_.]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const nsClean = n => String(n || '').replace(/[™®©]/g, '').replace(/\((x64|x86|64-?bit|32-?bit|windows|win64|gog|epic|steam)[^)]*\)/ig, '').replace(/\b(launcher|shipping|win64|x64|x86|game|client|setup|v?\d+(\.\d+){1,3})\b/ig, ' ').replace(/[_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
const nsScore = (a, b) => { const A = new Set(normN(a).split(' ').filter(Boolean)), B = new Set(normN(b).split(' ').filter(Boolean)); if (!A.size || !B.size) return 0; let c = 0; A.forEach(w => B.has(w) && c++); return c / Math.max(A.size, B.size); };
async function nsMatch(id) {
  cfg.nsMatch = cfg.nsMatch || {}; cfg.nsMiss = cfg.nsMiss || {};
  if (cfg.nsMatch[id]) return cfg.nsMatch[id];
  if (cfg.nsMiss[id] && Date.now() - cfg.nsMiss[id] < 6 * 3600e3) return null;
  const g = games.find(x => x.id === id); if (!g) return null;
  try {
    const tries = [...new Set([g.name.replace(/[™®©]/g, '').trim(), nsClean(g.name)].filter(Boolean))];
    let best = null, bs = 0;
    for (const q of tries) { const r = await storeSearch(q); for (const x of r) { const sc = normN(x.name) === normN(q) ? 1 : nsScore(q, x.name); if (sc > bs) { bs = sc; best = x; } } if (bs >= 1) break; }
    if (best && bs >= .6) { cfg.nsMatch[id] = best.id; delete cfg.nsMiss[id]; saveCfg(); return best.id; }
    cfg.nsMiss[id] = Date.now(); saveCfg(); return null;
  } catch { return null; }
}
async function saveImg(url, dir, kind) {
  try {
    const r = await net.fetch(url); if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image')) return null;
    const ext = (path.extname(new URL(url).pathname) || '.jpg').slice(0, 5); fs.rmSync(path.join(dir, kind + ext), { force: true });
    fs.writeFileSync(path.join(dir, kind + ext), Buffer.from(await r.arrayBuffer())); return `dash://art/${path.basename(dir)}/${kind}${ext}`;
  } catch { return null; }
}
// games that are not on Steam: look the name up on the Epic Games Store, then GOG, then Wikipedia
async function webArt(name) {
  const q = nsClean(name) || name, out = {};
  try {
    const r = await net.fetch('https://store.epicgames.com/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: 'query s($k:String,$c:String!,$l:String){Catalog{searchStore(keywords:$k,country:$c,locale:$l,count:6){elements{title description seller{name} keyImages{type url}}}}}', variables: { k: q, c: 'US', l: 'en-US' } }) });
    const j = await r.json(), els = (((j.data || {}).Catalog || {}).searchStore || {}).elements || [];
    let best = null, bs = 0; for (const e of els) { const sc = nsScore(q, e.title); if (sc > bs) { bs = sc; best = e; } }
    if (best && bs >= .6) { const ki = t => (best.keyImages.find(k => k.type === t) || {}).url; out.cover = ki('OfferImageTall') || ki('DieselStoreFrontTall') || ki('Thumbnail'); out.hero = ki('OfferImageWide') || ki('DieselStoreFrontWide') || ki('featuredMedia'); out.logo = ki('ProductLogo') || ki('DieselGameBoxLogo'); out.desc = best.description; out.dev = best.seller && best.seller.name; }
  } catch {}
  if (!out.cover) try {
    const j = await getJson('https://catalog.gog.com/v1/catalog?limit=6&order=desc%3Ascore&productType=in%3Agame&query=like%3A' + encodeURIComponent(q) + '&countryCode=US&locale=en-US&currencyCode=USD');
    let best = null, bs = 0; for (const e of j.products || []) { const sc = nsScore(q, e.title); if (sc > bs) { bs = sc; best = e; } }
    if (best && bs >= .6) { out.cover = best.coverVertical; out.hero = best.galaxyBackgroundImage || best.coverHorizontal; out.dev = (best.developers || [])[0]; }
  } catch {}
  if (!out.cover) try { const w = await wiki(q); if (w) { out.cover = w.thumb; out.hero = w.orig; out.desc = w.extract; } } catch {}
  return out.cover || out.hero ? out : null;
}
async function nsIcon(id, exe) {
  const dir = mk(path.join(cacheDir, 'art', id)), f = path.join(dir, 'cover.png');
  if (fs.existsSync(f)) return `dash://art/${id}/cover.png`;
  try { const ic = await app.getFileIcon(exe, { size: 'large' }); if (!ic.isEmpty()) { fs.writeFileSync(f, ic.toPNG()); return `dash://art/${id}/cover.png`; } } catch {}
  return null;
}
function loadGame(id) {
  if (!/^\d+$/.test(id) && !gameCache.has(id)) gameCache.set(id, (async () => {
    const g = games.find(x => x.id === id) || {}, sidm = await nsMatch(id);
    if (sidm) { const [cover, hero, logo, header, details] = await Promise.all([ensureArt(sidm, 'cover'), ensureArt(sidm, 'hero'), ensureArt(sidm, 'logo'), ensureArt(sidm, 'header'), getDetails(sidm, g.name)]); return { id, steamId: sidm, art: { cover, hero, logo, header }, details: details || {}, stats: null, hidden: false }; }
    const ic = g.exe ? await nsIcon(id, g.exe) : null, dir = mk(path.join(cacheDir, 'art', id));
    let w = null; const wf = path.join(dir, 'web.json');
    try { w = J(wf, null); if (!w || (!w.none && !w.cover && !w.hero) || (w.none && Date.now() - w.t > 6 * 3600e3)) { const x = await webArt(g.name); if (x) { w = { cover: x.cover && await saveImg(x.cover, dir, 'wcover'), hero: x.hero && await saveImg(x.hero, dir, 'whero'), logo: x.logo && await saveImg(x.logo, dir, 'wlogo'), desc: x.desc, dev: x.dev }; } else w = { none: true, t: Date.now() }; fs.writeFileSync(wf, JSON.stringify(w)); } } catch { w = null; }
    if (w && !w.none) { const c = w.cover || w.hero || ic; return { id, steamId: null, art: { cover: c, hero: w.hero || w.cover || null, logo: w.logo || null, header: w.hero || c }, details: { desc: w.desc || '', developers: w.dev ? [w.dev] : [], genres: [] }, stats: null, hidden: false }; }
    return { id, steamId: null, art: { cover: ic, hero: null, logo: null, header: ic }, details: {}, stats: null, hidden: false };
  })());
  if (!gameCache.has(id)) gameCache.set(id, (async () => {
    const [cover, hero, logo, header, details] = await Promise.all([
      ensureArt(id, 'cover'), ensureArt(id, 'hero'), ensureArt(id, 'logo'), ensureArt(id, 'header'), getDetails(id, nameOf(id))]);
    return {
      id, art: { cover, hero, logo, header }, details: details || {},
      stats: stats[id] || null, hidden: HIDE_TYPES.has((details || {}).type),
    };
  })());
  return gameCache.get(id);
}

// --------------------------------------------------------------------- news
const clanImg = u => String(u).replace(/\{STEAM_CLAN_(?:LOC_)?IMAGE\}/g, 'https://clan.cloudflare.steamstatic.com/images/');
function firstImg(raw) { const m = /(?:\[img\]|src=")\s*(\{STEAM_CLAN_(?:LOC_)?IMAGE\}\S+?|https?:\/\/\S+?\.(?:jpg|jpeg|png|gif|webp))(?:\[\/img\]|")/i.exec(raw || ''); return m ? clanImg(m[1]) : null; }
// Turn Steam's BBCode/HTML news into simple blocks the app can draw itself.
function newsBlocks(raw) {
  let t = String(raw || '').replace(/\r/g, '');
  t = t.replace(/\[img\]\s*(.+?)\s*\[\/img\]/gi, (m, u) => `\n\u0001IMG ${clanImg(u)}\n`);
  t = t.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (m, u) => `\n\u0001IMG ${clanImg(u)}\n`);
  t = t.replace(/\[h([1-3])\]/gi, '\n\u0001H ').replace(/\[\/h[1-3]\]/gi, '\n').replace(/<h[1-4][^>]*>/gi, '\n\u0001H ').replace(/<\/h[1-4]>/gi, '\n');
  t = t.replace(/\[\*\]/g, '\n\u0001LI ').replace(/<li[^>]*>/gi, '\n\u0001LI ').replace(/\[\/?(list|olist)\]/gi, '\n').replace(/<\/?(ul|ol)>/gi, '\n');
  t = t.replace(/\[(?:\/p|p)\]|<\/?p[^>]*>|<br\s*\/?>/gi, '\n');
  t = t.replace(/\[url=[^\]]*\]|\[\/url\]|\[previewyoutube[^\]]*\]\[\/previewyoutube\]|\[\/?(?:b|i|u|strike|spoiler|noparse|quote|code|table|tr|td|th|hr)(?:=[^\]]*)?\]|<\/?(?:b|i|u|strong|em|span|a|div)[^>]*>/gi, '');
  const out = [];
  for (const ln of t.split('\n')) {
    const z = ln.trim(); if (!z) continue;
    if (z.startsWith('\u0001IMG ')) out.push({ t: 'img', v: z.slice(5).trim() });
    else if (z.startsWith('\u0001H ')) { const v = clean(z.slice(3)); if (v) out.push({ t: 'h', v }); }
    else if (z.startsWith('\u0001LI ')) { const v = clean(z.slice(4)); if (v) out.push({ t: 'li', v }); }
    else { const v = clean(z); if (v) out.push({ t: 'p', v }); }
  }
  return out.slice(0, 120);
}
const newsFor = async (id, count, maxlength) => {
  const r = await net.fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${id}&count=${count}&maxlength=${maxlength}&format=json`);
  return (await r.json()).appnews.newsitems || [];
};
let newsCache = { t: 0, v: [] };
async function getNews() {
  if (Date.now() - newsCache.t < 30 * 60e3) return newsCache.v;
  const out = [];
  await Promise.all(games.slice(0, 8).map(async g => {
    try {
      for (const n of await newsFor(g.id, 3, 600))
        out.push({ gameId: g.id, gameName: g.name, gid: String(n.gid), title: clean(n.title), snippet: clean(n.contents).slice(0, 260), url: n.url, date: n.date * 1000, image: firstImg(n.contents), author: n.author || '' });
    } catch {}
  }));
  newsCache = { t: Date.now(), v: out.sort((a, b) => b.date - a.date).slice(0, 12) };
  return newsCache.v;
}
async function gameNews(id) {
  try { return (await newsFor(id, 6, 600)).map(n => ({ gameId: String(id), gameName: nameOf(id), gid: String(n.gid), title: clean(n.title), snippet: clean(n.contents).slice(0, 260), url: n.url, date: n.date * 1000, image: firstImg(n.contents) })); } catch { return []; }
}
async function newsArticle(id, gid) {
  try {
    const it = (await newsFor(id, 20, 0)).find(n => String(n.gid) === String(gid));
    if (!it) return null;
    const blocks = newsBlocks(it.contents), im = blocks.find(b => b.t === 'img');
    return { title: clean(it.title), date: it.date * 1000, author: it.author || '', feed: it.feedlabel || '', url: it.url, image: im ? im.v : null, blocks };
  } catch { return null; }
}

// ---------------------------------------------------------------------- OST
let ytPromise = null;
function ensureYtdlp() {
  if (ytPromise) return ytPromise;
  ytPromise = (async () => {
    const test = exe => new Promise(r => cp.execFile(exe, ['--version'], { timeout: 15000, windowsHide: true }, e => r(!e)));
    if (await test('yt-dlp')) return 'yt-dlp';
    const bin = mk(path.join(app.getPath('userData'), 'bin'));
    const exe = path.join(bin, WIN ? 'yt-dlp.exe' : 'yt-dlp');
    if (fs.existsSync(exe) && await test(exe)) return exe;
    if (!WIN) return null;
    try {
      const r = await net.fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
      if (!r.ok) return null;
      fs.writeFileSync(exe, Buffer.from(await r.arrayBuffer()));
      return (await test(exe)) ? exe : null;
    } catch { return null; }
  })().then(x => { if (!x) ytPromise = null; return x; });
  return ytPromise;
}

const ostDir = () => mk(path.join(cacheDir, 'ost'));
function ostFile(id) {
  const f = fs.readdirSync(ostDir()).find(x => x.startsWith(id + '.') && !/\.(part|ytdl|temp)$/.test(x));
  return f ? `dash://ost/${f}` : null;
}
const ostJobs = new Map(), kids = new Set();
function fetchOst(id, name) {
  const have = ostFile(id);
  if (have) return Promise.resolve(have);
  if (cfg.ost === false) return Promise.resolve(null);
  if (ostJobs.has(id)) return ostJobs.get(id);
  const job = (async () => {
    const y = await ensureYtdlp();
    if (!y) return null;
    const clean0 = name.replace(/[™®©:]/g, ' ').replace(/\s+/g, ' ').trim();
    const q = `ytsearch10:${clean0} main theme OST soundtrack`;
    const idx = ((cfg.ostIdx || {})[id] || 0) + 1;
    // the title must contain the game's most distinctive word, so a search for one game can never hand back another game's song
    const word = (clean0.match(/[A-Za-z0-9]{3,}/g) || []).sort((a, b) => b.length - a.length)[0] || '';
    const filt = 'duration>75 & duration<1500' + (word ? ` & title~='(?i)${word}'` : '');
    await new Promise(res => { const kid = cp.execFile(y, [q, '--playlist-items', idx + '-10', '--match-filter', filt, '--max-downloads', '1',
      '-f', 'bestaudio[ext=webm]/bestaudio', '-o', path.join(ostDir(), id + '.%(ext)s'),
      '--no-warnings', '-q', '--no-progress', '--socket-timeout', '15'], { timeout: 180000, windowsHide: true }, () => { kids.delete(kid); res(); }); kids.add(kid); });
    return ostFile(id);
  })().then(r => { if (!r) ostJobs.delete(id); return r; });
  ostJobs.set(id, job);
  return job;
}
async function prefetchOst() {
  if (ostStarted) return; ostStarted = true;
  if (cfg.ostV !== 2) { try { fs.readdirSync(ostDir()).forEach(x => rmrf(path.join(ostDir(), x))); } catch {} cfg.ostV = 2; saveCfg(); }
  const q = [...games];
  await Promise.all([0, 1].map(async () => { while (q.length) { while (lowPower) await new Promise(r => setTimeout(r, 5000)); const g = q.shift(); await fetchOst(g.id, g.name); } }));
}

// ------------------------------------------------- trailer fallback (YouTube)
const trCache = new Map();
async function findTrailer(id, name) {
  const c = trCache.get(id); if (c && Date.now() - c.t < 3 * 36e5) return c.u;
  const y = await ensureYtdlp(); if (!y) return null;
  const u = await new Promise(res => { const k = cp.execFile(y, [`ytsearch1:${String(name).replace(/[™®©]/g, '')} official game trailer`, '-g', '-f', 'best[height<=720][ext=mp4]/best[ext=mp4]/best', '--no-warnings', '-q', '--socket-timeout', '15'],
    { timeout: 40000, windowsHide: true }, (e, out) => { kids.delete(k); res(e ? null : String(out).split('\n')[0].trim() || null); }); kids.add(k); });
  trCache.set(id, { t: Date.now(), u }); return u;
}

// ----------------------------------------------------- launch / watch / power
let lowPower = false, watching = null, lastPad = 0, appView = null;
const prefs = () => cfg.prefs || {};
function setPrio(p) { try { for (const m of app.getAppMetrics()) { try { os.setPriority(m.pid, p); } catch {} } } catch {} }
function enterLowPower() {
  if (lowPower || !win || prefs().lowPower === false) return;
  lowPower = true;
  for (const k of kids) { try { k.kill(); } catch {} }
  try { win.webContents.send('sleep', true); } catch {}
  try { win.webContents.setBackgroundThrottling(true); } catch {}
  try { win.webContents.setAudioMuted(true); } catch {}
  setPrio(os.constants.priority.PRIORITY_LOW);
}
function leaveLowPower() {
  if (!lowPower) return; lowPower = false;
  setPrio(os.constants.priority.PRIORITY_NORMAL);
  if (!win) return;
  try { win.webContents.setBackgroundThrottling(false); } catch {}
  try { win.webContents.setAudioMuted(false); } catch {}
  try { win.webContents.send('sleep', false); } catch {}
}
function runningAppId() {
  return new Promise(res => {
    if (!WIN) return res(0);
    cp.execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'], { encoding: 'utf8', windowsHide: true, timeout: 4000 }, (e, out) => {
      const m = !e && String(out).match(/REG_DWORD\s+0x([0-9a-f]+)/i); res(m ? parseInt(m[1], 16) : 0);
    });
  });
}
function restore() {
  if (!win) return;
  if (watching && watching.stop) watching.stop();
  watching = null; leaveLowPower(); killOverlay(); clearInterval(trimT);
  if (win.isMinimized()) win.restore();
  const front = () => { if (!win || win.isDestroyed()) return; try { if (win.isMinimized()) win.restore(); win.setFullScreen(prefs().fullscreen !== false); win.show(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); app.focus({ steal: true }); win.focus(); win.webContents.focus(); } catch {} };
  front(); [250, 700, 1500].forEach(ms => setTimeout(front, ms));      // Windows sometimes refuses the first attempt right after a game exits
  setTimeout(() => win && !win.isDestroyed() && win.setAlwaysOnTop(false), 1800);
  win.webContents.send('restored');
}
function watchGame(id) {
  let seen = false, t = 0; const tok = watching = { id };
  const tick = async () => {
    if (watching !== tok) return;
    t += lowPower ? 4 : 2;
    const r = await runningAppId();
    if (watching !== tok) return;
    if (String(r) === String(id)) seen = true;
    if ((seen && r === 0) || (!seen && t > 120)) return restore();
    setTimeout(tick, lowPower ? 4000 : 2000);
  };
  setTimeout(tick, 2000);
}
const minimizeSoon = () => setTimeout(() => win && win.minimize(), 700);
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, ms = 6000) => new Promise(res => cp.execFile(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: ms }, (e, out) => res(e ? '' : String(out))));
const steamRunning = async () => /steam\.exe/i.test(await sh('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH']));
async function steamReady() { const o = await sh('reg', ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser']); const m = o.match(/0x([0-9a-f]+)/i); return !!m && parseInt(m[1], 16) !== 0; }
// Keep Steam as light as possible: start it silent without its web browser (steamwebhelper), and keep helpers dead / low priority while a game runs.
let trimT = null;
function trimSteam() {
  if (!WIN) return;
  sh('powershell', ['-NoProfile', '-NonInteractive', '-Command', "Get-Process steamwebhelper -ErrorAction SilentlyContinue | Stop-Process -Force; Get-Process steam -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'BelowNormal' } catch {} }"], 10000);
}
// ---- Launch a game straight from betterSBP, without starting Steam at all
const splitArgs = str => (String(str || '').match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, ''));
function guessExe(dir) {
  const bad = /unins|crash|report|redist|vcredist|dxsetup|setup|helper|ue4|prereq|dotnet|cef|webhelper|eac|battleye|benchmark|server|editor|updater|installer|notification|bootstrap/i; let best = null;
  const walk = (d, depth) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch {} for (const e of ents) { const f = path.join(d, e.name); if (e.isDirectory()) { if (depth < 2 && !/^(_commonredist|redist|redistributable|__installer|engine|redistributables)$/i.test(e.name)) walk(f, depth + 1); } else if (/\.exe$/i.test(e.name) && !bad.test(e.name)) { let sz = 0; try { sz = fs.statSync(f).size; } catch {} if (!best || sz > best.sz) best = { f, sz }; } } };
  walk(dir, 0); return best && best.f;
}
async function resolveExe(g) {
  const dir = path.join(g.library, 'steamapps', 'common', g.installdir), map = cfg.exeMap = cfg.exeMap || {};
  if (map[g.id] && fs.existsSync(map[g.id].exe)) return { dir, ...map[g.id] };
  let li = null; try { li = chat && await chat.launchInfo(g.id); } catch {}
  if (li) { const exe = path.join(dir, li.exe); if (fs.existsSync(exe)) return { dir, exe, args: li.args, wd: li.wd ? path.join(dir, li.wd) : path.dirname(exe) }; }
  const exe = guessExe(dir); return exe ? { dir, exe, args: '', wd: path.dirname(exe) } : null;
}
function watchDir(dir, id) {
  const started = Date.now(); let seen = false, done = false; const tok = watching = { id, dir };
  const d = dir.replace(/'/g, "''");
  const ps = cp.spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', `$d='${d}\\'; while($true){ $n=@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) }).Count; Write-Output "N $n"; Start-Sleep -Seconds 3 }`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const end = quick => { if (done) return; done = true; try { ps.kill(); } catch {} if (watching === tok) { restore(); if (quick && win && !win.isDestroyed()) win.webContents.send('launch:failed', { id }); } };
  ps.stdout.on('data', b => { for (const m of String(b).matchAll(/N (\d+)/g)) { const n = +m[1]; if (n > 0) seen = true; else if (seen) return end(Date.now() - started < 20000); } });
  setTimeout(() => { if (!seen) end(true); }, 90000);
  tok.stop = () => { done = true; try { ps.kill(); } catch {} };
}
async function launchDirect(id, args) {
  const g = games.find(x => String(x.id) === String(id)); if (!g) return false;
  const r = await resolveExe(g); if (!r) return false;
  try { const f = path.join(path.dirname(r.exe), 'steam_appid.txt'); if (!fs.existsSync(f)) fs.writeFileSync(f, String(id)); } catch {}
  const c = cp.spawn(r.exe, splitArgs(r.args).concat(splitArgs(args)), { cwd: r.wd || path.dirname(r.exe), detached: true, stdio: 'ignore', env: { ...process.env, SteamAppId: String(id), SteamGameId: String(id) } });
  c.on('error', () => {}); c.unref(); watchDir(r.dir, id); return true;
}
async function launchSteamGame(id, args) {
  const lean = prefs().leanSteam !== false;
  if (WIN && lean && root && !noSteam && !(await steamRunning())) {
    try { cp.spawn(path.join(root, 'steam.exe'), ['-silent', '-no-browser', '-nofriendsui', '-nochatui', '-nocrashmonitor'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch {}
    for (let i = 0; i < 50; i++) { await sleepMs(600); if (await steamReady()) break; }
  }
  await shell.openExternal('steam://rungameid/' + id + (args ? '//' + encodeURIComponent(args) : ''));
  if (lean) { clearInterval(trimT); let n = 0; trimT = setInterval(() => { if (!watching) { clearInterval(trimT); return; } if (WIN) sh('taskkill', ['/F', '/IM', 'steamwebhelper.exe'], 4000); if (n++ % 10 === 0) trimSteam(); }, 3000); }
}

// ---- in-game overlay: the same UI in a transparent always-on-top window (Control Center), opened by the Guide button
let ovWin = null;
function prepOverlay() {
  if (ovWin && !ovWin.isDestroyed()) return;
  const b = screen.getPrimaryDisplay().bounds;
  ovWin = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, show: false, frame: false, transparent: true, skipTaskbar: true, resizable: false, hasShadow: false, focusable: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: true } });
  ovWin.setAlwaysOnTop(true, 'screen-saver');
  ovWin.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { ov: '1' } });
}
function showOverlay() { prepOverlay(); const w = ovWin; const go = () => { w.show(); w.focus(); w.webContents.send('ov:show'); }; w.webContents.isLoading() ? w.webContents.once('did-finish-load', go) : go(); }
function hideOverlay() { if (ovWin && !ovWin.isDestroyed()) { ovWin.webContents.send('ov:hide'); ovWin.hide(); } }
function killOverlay() { if (ovWin && !ovWin.isDestroyed()) ovWin.destroy(); ovWin = null; }
const overlayOpen = () => !!ovWin && !ovWin.isDestroyed() && ovWin.isVisible();
async function closeGame() {
  let dir = watching && watching.dir; if (!dir) { const id = await runningAppId(), g = games.find(x => String(x.id) === String(id)); if (!g) return false; dir = path.join(g.library, 'steamapps', 'common', g.installdir); }
  dir = dir.replace(/'/g, "''");
  await sh('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-Process | Where-Object { $_.Path -like '${dir}\\*' } | Stop-Process -Force`], 15000);
  return true;
}
ipcMain.handle('ov:close', () => { hideOverlay(); });
ipcMain.handle('ov:shot', () => { hideOverlay(); setTimeout(takeCapture, 450); return true; });
ipcMain.handle('ov:home', () => { hideOverlay(); restore(); });
ipcMain.handle('ov:closegame', async () => { hideOverlay(); return closeGame(); });
ipcMain.handle('ov:status', () => ({ game: watching ? (games.find(g => String(g.id) === String(watching.id)) || {}).name || '' : '' }));
let lastGuide = 0;
function onGuide() {
  if (appView) return closeApp();
  if (prefs().guideDash === false) return;
  if (Date.now() - lastGuide < 450) return; lastGuide = Date.now();
  if (overlayOpen()) return hideOverlay();
  if (watching) return showOverlay();
  if (win && !win.isDestroyed()) { if (!win.isFocused()) restore(); else win.webContents.send('pad:guide'); }
}

// What window has focus? (used to catch Steam grabbing the controller's Guide button)
function foregroundProc() {
  return new Promise(res => {
    if (!WIN) return res('');
    const ps = "Add-Type -Name W -Namespace N -MemberDefinition '[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern int GetWindowThreadProcessId(IntPtr h,out int p);'; $h=[N.W]::GetForegroundWindow(); $p=0; [void][N.W]::GetWindowThreadProcessId($h,[ref]$p); (Get-Process -Id $p).ProcessName";
    cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 6000 }, (e, out) => res(e ? '' : String(out).trim()));
  });
}
let guardBusy = false;
async function guideGuard() {
  if (!WIN || guardBusy || lowPower || watching || appView || prefs().guideDash === false) return;
  if (Date.now() - lastPad > 2500) return;            // only react right after a controller press
  guardBusy = true;
  try {
    await new Promise(r => setTimeout(r, 200));
    const p = await foregroundProc();
    if (/^steam(webhelper)?$/i.test(p)) {
      shell.openExternal('steam://close/bigpicture').catch(() => {});
      restore(); setTimeout(restore, 700);
    }
  } finally { guardBusy = false; }
}

// ------------------------------------------------------------- embedded apps
const PS_UA = 'Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15';
const TV_UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36';
const CHV = process.versions.chrome || '126.0.0.0', CHM = CHV.split('.')[0];
const EDGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHV} Safari/537.36 Edg/${CHV}`;   // matches the real engine so sites that compare UA and client hints are happy
const APPS = { youtube: { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/tv', ua: TV_UA, part: 'persist:youtube' }, discord: { id: 'discord', name: 'Discord', url: 'https://discord.com/app', ua: EDGE_UA, part: 'persist:discord', nopad: true }, xcloud: { id: 'xcloud', name: 'Xbox Cloud Gaming', url: 'https://www.xbox.com/play', ua: EDGE_UA, part: 'persist:xcloud', nopad: true } };
const PAD_JS = `(() => { if (window.__dashPad) return; window.__dashPad = 1;
  const M = { 12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right', 0: 'Enter', 1: 'Escape', 2: 'MediaPlayPause', 9: 'MediaPlayPause', 4: 'Left', 5: 'Right', 8: '__exit', 16: '__exit' };
  const prev = {}, hold = {};
  const send = k => console.log('__DASH__' + k);
  const loop = t => {
    const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
    if (gp) {
      const b = i => gp.buttons[i] && gp.buttons[i].pressed, st = {};
      for (const i in M) st[i] = b(i);
      st[12] = st[12] || gp.axes[1] < -.6; st[13] = st[13] || gp.axes[1] > .6; st[14] = st[14] || gp.axes[0] < -.6; st[15] = st[15] || gp.axes[0] > .6;
      for (const i in st) {
        if (st[i] && !prev[i]) { send(M[i]); hold[i] = t + 380; }
        else if (st[i] && i >= 12 && i <= 15 && t > hold[i]) { send(M[i]); hold[i] = t + 120; }
        prev[i] = st[i];
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;background:rgba(10,12,18,.82);color:#fff;font:600 16px Segoe UI,sans-serif;padding:10px 20px;border-radius:30px;transition:opacity 1s;pointer-events:none';
  hint.textContent = 'B Back   ·   Select / Guide / F1  Return to betterSBP';
  document.body.appendChild(hint); setTimeout(() => hint.style.opacity = 0, 6000);
})();`;

// YouTube enhancements (our own implementation, in the spirit of community TV wrappers such as VacuumTube / TizenTube):
// ad removal from the player / feed data, SponsorBlock skipping, hiding Shorts, and a small "skipped" notice.
const ytJs = o => `(() => { if (window.__dashYT) return; window.__dashYT = 1; const O = ${JSON.stringify(o)};
  const KILL = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakService'];
  const isAd = x => x && typeof x === 'object' && (x.adSlotRenderer || x.promotedSparklesWebRenderer || x.promotedVideoRenderer || x.compactPromotedVideoRenderer || x.displayAdRenderer || x.tvBannerPromoRenderer);
  const isShort = x => x && typeof x === 'object' && (x.reelShelfRenderer || x.shortsLockupViewModel || x.reelItemRenderer || (x.tileRenderer && x.tileRenderer.contentType === 'TILE_CONTENT_TYPE_SHORTS'));
  const strip = (o, d) => { if (!o || typeof o !== 'object' || d > 40) return o;
    if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) { const e = o[i]; if ((O.ads && isAd(e)) || (O.shorts && isShort(e))) o.splice(i, 1); else strip(e, d + 1); } return o; }
    if (O.ads) for (const k of KILL) if (k in o) { try { delete o[k]; } catch {} }
    for (const k in o) { const v = o[k]; if (v && typeof v === 'object') strip(v, d + 1); } return o; };
  const jp = JSON.parse; JSON.parse = function (t, r) { const v = jp.call(this, t, r); try { if (v && typeof v === 'object' && (O.ads || O.shorts)) { if (v.videoDetails && v.videoDetails.videoId) window.__dashVid = v.videoDetails.videoId; strip(v, 0); } } catch {} return v; };
  const rj = Response.prototype.json; Response.prototype.json = function () { return rj.call(this).then(v => { try { if (v && typeof v === 'object' && (O.ads || O.shorts)) { if (v.videoDetails && v.videoDetails.videoId) window.__dashVid = v.videoDetails.videoId; strip(v, 0); } } catch {} return v; }); };
  if (O.sb) { let segs = [], vid = '', note;
    const toast = t => { if (!note) { note = document.createElement('div'); note.style.cssText = 'position:fixed;left:50%;top:6%;transform:translateX(-50%);z-index:2147483647;background:rgba(10,12,18,.85);color:#fff;font:600 18px Segoe UI,sans-serif;padding:10px 22px;border-radius:30px;transition:opacity .4s;opacity:0;pointer-events:none'; document.body.appendChild(note); } note.textContent = t; note.style.opacity = 1; clearTimeout(note._t); note._t = setTimeout(() => note.style.opacity = 0, 2200); };
    const load = id => { vid = id; segs = []; fetch('https://sponsor.ajay.app/api/skipSegments?videoID=' + id + '&categories=' + encodeURIComponent('["sponsor","selfpromo","interaction","intro","outro"]')).then(r => r.ok ? r.json() : []).then(l => { if (vid === id) segs = (l || []).map(x => ({ s: x.segment[0], e: x.segment[1], c: x.category })); }).catch(() => {}); };
    setInterval(() => { const v = document.querySelector('video'); if (!v) return; const id = window.__dashVid || ''; if (id && id !== vid) load(id);
      if (!segs.length || v.paused) return; const t = v.currentTime; for (const g of segs) if (t >= g.s && t < g.e - .3) { v.currentTime = g.e; toast('Skipped ' + ({ sponsor: 'a sponsor', selfpromo: 'self-promotion', interaction: 'a reminder', intro: 'the intro', outro: 'the outro' }[g.c] || 'a segment')); break; } }, 400); }
  const st = document.createElement('style'); st.textContent = '*{scroll-behavior:smooth}'; document.head.appendChild(st);
})();`;
const warmed = {};
function buildApp(a) {
  const v = new WebContentsView({ webPreferences: { partition: a.part, contextIsolation: true, sandbox: false, nodeIntegration: false, backgroundThrottling: false } });   // sandbox off: on some PCs (app run from a restricted folder) the sandboxed renderer cannot start and the page never loads
  const wc = v.webContents; v._app = a; v._ready = false;
  if (a.ua) wc.setUserAgent(a.id === 'youtube' && prefs().ytLook === 'console' ? PS_UA : a.ua);
  const ses = wc.session;
  try { ses.setPermissionRequestHandler((w, perm, cb) => cb(true)); ses.setPermissionCheckHandler(() => true); } catch {}
  if (a.ua === EDGE_UA) { try { ses.webRequest.onBeforeSendHeaders((d, cb) => { const h = d.requestHeaders; h['sec-ch-ua'] = `"Chromium";v="${CHM}", "Microsoft Edge";v="${CHM}", "Not-A.Brand";v="99"`; h['sec-ch-ua-mobile'] = '?0'; h['sec-ch-ua-platform'] = '"Windows"'; cb({ requestHeaders: h }); }); } catch {} }
  wc.on('render-process-gone', () => { if (appView === v) { try { win.webContents.send('popup', { kind: 'app', title: a.name, body: 'The page stopped unexpectedly.' }); } catch {} closeApp(); } else dropWarm(a.id); });
  wc.on('did-fail-load', (e, code, desc, u, main) => { if (main && code !== -3 && win && !win.isDestroyed()) { win.webContents.send('popup', { kind: 'app', title: a.name, body: 'Could not load (' + desc + '). Check your connection.' }); if (appView === v) closeApp(); else dropWarm(a.id); } });
  wc.on('dom-ready', () => { v._ready = true; if (a.id === 'youtube') { const P = prefs(); wc.executeJavaScript(ytJs({ ads: P.ytAds !== false, sb: P.ytSponsor !== false, shorts: P.ytShorts !== false })).catch(() => {}); } if (!a.nopad) wc.executeJavaScript(PAD_JS).catch(() => {}); v._onReady && v._onReady(); });   // Xbox Cloud Gaming needs the real gamepad, so no key-mapping there
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\/([a-z0-9-]+\.)*(youtube|google|gstatic|steampowered|steamcommunity|xbox|microsoft|live|microsoftonline)\.com\//i.test(url)) wc.loadURL(url); return { action: 'deny' }; });
  wc.on('console-message', (...args) => {
    const msg = args[0] && typeof args[0].message === 'string' ? args[0].message : args[2];
    if (typeof msg !== 'string' || !msg.startsWith('__DASH__')) return;
    const k = msg.slice(8);
    if (k === '__exit') return closeApp();
    for (const type of ['keyDown', 'keyUp']) wc.sendInputEvent({ type, keyCode: k });
  });
  wc.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F1' || input.key === 'Home' || (input.control && input.key.toLowerCase() === 'q'))) { e.preventDefault(); closeApp(); }
  });
  if (a.id === 'discord') { const chk = (e, u) => { if (/discord\.com\/(channels|app)/.test(u) && !/login|register|oauth/.test(u) && !(dc && dc.state().state === 'on') && !wc._dcGrab) { wc._dcGrab = true; cfg.discordIn = true; saveCfg(); (dc ? dc.attach(wc) : Promise.resolve(false)).then(ok => { wc._dcGrab = false; if (ok) closeApp(); sendDiscord(); }); } }; wc.on('did-navigate', chk); wc.on('did-navigate-in-page', chk); }
  wc.loadURL(a.url);
  return v;
}
const wcDead = v => !v || !v.webContents || v.webContents.isDestroyed();
function dropWarm(id) { const w = warmed[id]; if (!w) return; clearTimeout(w._t); delete warmed[id]; try { w.webContents.close(); } catch {} }
// start loading an app in the background while its tile is highlighted, so it opens instantly when chosen
function warmApp(id) {
  const a = APPS[id]; if (!a || !win) return false; if (appView && wcDead(appView)) appView = null; if (appView || (warmed[id] && !wcDead(warmed[id]))) return false;
  const v = warmed[id] = buildApp(a); v._t = setTimeout(() => dropWarm(id), 120000); return true;
}
function openApp(id) {
  const a = typeof id === 'object' ? id : APPS[id]; if (!a || !win) return false;
  if (appView && wcDead(appView)) { try { win.contentView.removeChildView(appView); } catch {} appView = null; }
  if (appView) return true;
  const key = a.id || (typeof id === 'string' ? id : null), w = key && warmed[key];
  let v; if (w && !wcDead(w)) { clearTimeout(w._t); delete warmed[key]; v = w; } else v = buildApp(a);
  appView = v;
  const show = () => {
    if (appView !== v || v._shown || !win) return; v._shown = true;
    win.contentView.addChildView(v);
    const fit = () => { if (appView === v) { const [W, H] = win.getContentSize(); v.setBounds({ x: 0, y: 0, width: W, height: H }); } };
    fit(); win.on('resize', fit); v._fit = fit; v.webContents.focus();
    win.webContents.send('app:shown');
  };
  v._onReady = () => setTimeout(show, 250);
  if (v._ready) setTimeout(show, 120);
  setTimeout(show, 9000);      // never leave the person waiting on a slow page: show it anyway
  return true;
}
function closeApp() {
  if (!appView || !win) return;
  const v = appView; appView = null;
  clearTimeout(v._t); try { v._fit && win.removeListener('resize', v._fit); if (v._shown) win.contentView.removeChildView(v); if (!wcDead(v)) v.webContents.close(); } catch {}
  win.webContents.focus(); win.webContents.send('app:closed');
}

// ---------------------------------------------------------------------- IPC
const saveCfg = () => { try { fs.writeFileSync(path.join(app.getPath('userData'), 'config.json'), JSON.stringify(cfg, null, 1)); } catch {} };
const rmrf = p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} };
const dsCache = new Map();
const dirSize = d => { const c = dsCache.get(d); if (c && Date.now() - c.t < 60000) return c.n; let n = 0; const end = Date.now() + 1500; const w = p => { if (Date.now() > end) return; let es = []; try { es = fs.readdirSync(p, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(p, e.name); if (e.isDirectory()) w(f); else { try { n += fs.statSync(f).size; } catch {} } } }; w(d); dsCache.set(d, { t: Date.now(), n }); return n; };
const galReg = new Map(), vidReg = new Map();
const capDir = () => mk(path.join(os.homedir(), 'Pictures', 'betterSBP Captures'));

let dl = null;
const scanAll = () => { const g = steam.scanGames(root); try { const have = new Set((cfg.nonSteam || []).map(n => n.exe)); if (acct() && cfg.importShortcuts !== false) steam.shortcuts(root, acct()).forEach(n => { if (!have.has(n.exe)) g.push({ id: n.id, name: n.name, size: 0, lastPlayed: 0, nonSteam: true, exe: n.exe, args: n.args, library: null, installdir: '', state: 'ns' }); }); } catch {} (cfg.nonSteam || []).forEach(n => g.push({ id: n.id, name: n.name, size: 0, lastPlayed: n.last || 0, nonSteam: true, exe: n.exe, library: null, installdir: '', state: 'ns' })); return g; };
const pubGame = g => ({ id: g.id, name: g.name, size: g.size, lastPlayed: g.lastPlayed, nonSteam: !!g.nonSteam, exe: g.exe, args: g.args });
const refreshGames = () => { if (root) { games = scanAll(); if (acct()) stats = steam.playStats(root, acct()); libCache = { t: 0, v: null }; } if (win) win.webContents.send('games:changed', games.map(pubGame)); };
ipcMain.handle('dl:list', () => dl.list());
ipcMain.handle('dl:libs', () => {
  const out = [];
  for (const l of root ? steam.libraries(root) : []) { try { const st = fs.statfsSync(l); out.push({ path: l, free: st.bsize * st.bavail, total: st.bsize * st.blocks }); } catch { out.push({ path: l, free: 0, total: 0 }); } }
  return { libs: out, login: cfg.steamLogin || '' };
});
ipcMain.handle('dl:add', (e, id, name, lib) => dl.add(id, name, lib));
ipcMain.handle('dl:pause', (e, id) => dl.pause(id));
ipcMain.handle('dl:resume', (e, id) => dl.resume(id));
ipcMain.handle('dl:cancel', (e, id, wipe) => dl.cancel(id, wipe));
ipcMain.handle('dl:answer', (e, id, kind, v) => dl.answer(id, kind, v));
ipcMain.handle('dl:login', (e, u) => dl.setLogin(u));
ipcMain.handle('news:article', (e, id, gid) => newsArticle(String(id), gid));
ipcMain.handle('news:game', (e, id) => gameNews(String(id)));
ipcMain.handle('store:browse', (e, o) => storeBrowse(o || {}).catch(() => ({ items: [], total: 0, start: 0 })));
ipcMain.handle('store:tags', () => TAGS);
ipcMain.handle('trailer:find', (e, id, name) => findTrailer(String(id), name).catch(() => null));
ipcMain.handle('app:open', (e, id) => openApp(id));
ipcMain.handle('app:warm', (e, id) => warmApp(id));
// Steam web pages (store / checkout / community) shown inside betterSBP instead of the system browser.
ipcMain.handle('web:open', (e, url) => {
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || !/(^|\.)(steampowered|steamcommunity)\.com$/i.test(u.hostname)) return false;
  return openApp({ name: 'Steam', url: u.href, ua: '', part: 'persist:steamweb' });
});
ipcMain.handle('pad:active', () => { lastPad = Date.now(); return true; });
ipcMain.handle('videos', () => {
  const items = [], add = (f, src) => { try { items.push({ file: f, src, time: fs.statSync(f).mtimeMs }); } catch {} };
  const scan = (d, src, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isFile() && /\.(mp4|webm|m4v|mov)$/i.test(e.name)) add(f, src); else if (e.isDirectory() && depth > 0) scan(f, src, depth - 1); } };
  scan(path.join(os.homedir(), 'Videos', 'Captures'), 'Game Bar', 1); scan(path.join(os.homedir(), 'Videos'), 'Videos', 1);
  items.sort((a, b) => b.time - a.time); vidReg.clear();
  return items.slice(0, 60).map((it, i) => { vidReg.set(String(i), it.file); return { id: i, src: 'dash://vid/' + i, from: it.src, time: it.time, name: path.basename(it.file).replace(/\.[^.]+$/, '') }; });
});
// ---- in-app file manager: lists folders / drives for the controller-friendly picker
ipcMain.handle('fs:list', async (e, dir) => {
  try {
    if (!dir) {
      const roots = [];
      for (const [label, key] of [['Desktop', 'desktop'], ['Documents', 'documents'], ['Downloads', 'downloads'], ['Videos', 'videos'], ['Pictures', 'pictures'], ['Music', 'music']]) { try { const p = app.getPath(key); if (fs.existsSync(p)) roots.push({ name: label, path: p, dir: true, kind: 'place' }); } catch {} }
      if (WIN) for (const L of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { try { const s = fs.statfsSync(L + ':\\'); if (s.blocks) roots.push({ name: 'Drive ' + L + ':', path: L + ':\\', dir: true, kind: 'drive', free: s.bsize * s.bavail, total: s.bsize * s.blocks }); } catch {} }
      else roots.push({ name: 'Computer', path: '/', dir: true, kind: 'drive' });
      return { ok: true, dir: '', parent: null, items: roots };
    }
    const ents = await fs.promises.readdir(dir, { withFileTypes: true }), items = [];
    for (const d of ents) {
      if (d.name.startsWith('.') || d.name === '$RECYCLE.BIN' || d.name === 'System Volume Information') continue;
      const p = path.join(dir, d.name); let isDir = d.isDirectory();
      if (!isDir && d.isSymbolicLink()) { try { isDir = fs.statSync(p).isDirectory(); } catch {} }
      let size = 0; if (!isDir) { try { size = fs.statSync(p).size; } catch {} }
      items.push({ name: d.name, path: p, dir: isDir, size });
      if (items.length > 4000) break;
    }
    items.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const par = path.dirname(dir); return { ok: true, dir, parent: par === dir ? '' : par, items };
  } catch (er) { return { ok: false, msg: 'Can not open this folder (' + (er.code || er.message) + ').', dir, parent: path.dirname(dir) === dir ? '' : path.dirname(dir), items: [] }; }
});
ipcMain.handle('startmovie:get', () => {
  const sm = (cfg.prefs || {}).startMovie || { mode: 'default' }; if (sm.mode === 'off') return null;
  if (sm.mode === 'default' || !sm.mode) { const d = path.join(__dirname, 'renderer', 'assets', 'startup.webm'); if (!fs.existsSync(d)) return null; vidReg.set('startup', d); return { src: 'dash://vid/startup?' + Date.now(), name: 'betterSBP' }; }
  if (!sm.path) return null;
  const vid = /\.(mp4|webm|m4v|mov|mkv|ogv)$/i;
  try {
    let f = sm.path;
    if (sm.mode === 'folder') { const l = fs.readdirSync(sm.path).filter(n => vid.test(n)); if (!l.length) return null; f = path.join(sm.path, l[Math.floor(Math.random() * l.length)]); }
    if (!fs.existsSync(f)) return null; vidReg.set('startup', f); return { src: 'dash://vid/startup?' + Date.now(), name: path.basename(f) };
  } catch { return null; }
});
ipcMain.handle('cfg:set', (e, patch) => { if (patch && patch.prefs && patch.prefs.dlSavePass === false) { try { chat && chat.savePw(null); } catch {} } if (patch && patch.dropWarm) { dropWarm(patch.dropWarm); delete patch.dropWarm; if (!Object.keys(patch).length) return true; } Object.assign(cfg, patch); saveCfg(); return true; });
ipcMain.handle('library', () => getLibrary());
ipcMain.handle('profile', (e, id) => getProfile(id));
// another player's games / friends (public data only; a private profile just returns an empty list with a reason)
ipcMain.handle('profile:games', async (e, id) => {
  try {
    const x = await getText(`https://steamcommunity.com/profiles/${id || sid()}/games/?tab=all&xml=1`);
    if (/<error>/.test(x)) return { priv: true, games: [] };
    const games = [...x.matchAll(/<game>([\s\S]*?)<\/game>/g)].map(m => ({ id: tagOf(m[1], 'appID'), name: clean(tagOf(m[1], 'name')), h: parseFloat((tagOf(m[1], 'hoursOnRecord') || '0').replace(',', '')) || 0, h2: parseFloat((tagOf(m[1], 'hoursLast2Weeks') || '0').replace(',', '')) || 0 })).filter(g => g.id && g.name);
    return { priv: !games.length, games };
  } catch { return { priv: true, games: [] }; }
});
ipcMain.handle('profile:friends', async (e, id) => {
  try {
    const t = chat ? await chat.webGet(`https://steamcommunity.com/profiles/${id}/friends/`) : await getText(`https://steamcommunity.com/profiles/${id}/friends/`);
    const out = [];
    for (const b of t.split('<div class="friend_block_v2').slice(1)) {
      const i = /data-steamid="(\d+)"/.exec(b), n = /<div class="friend_block_content">\s*([^<\n]+)/.exec(b), a = /<img src="([^"]+)"/.exec(b); if (i && n) out.push({ id: i[1], name: clean(n[1]), avatar: a ? a[1] : '' });
    }
    return { priv: !out.length, friends: out };
  } catch { return { priv: true, friends: [] }; }
});
ipcMain.handle('family:info', async () => { try { return chat ? await chat.family() : { ok: false, msg: 'Sign in to Steam first.' }; } catch (e) { return { ok: false, msg: e.message }; } });
ipcMain.handle('friend:add', (e, s) => chat ? chat.addFriend(s) : { ok: false, msg: 'Sign in to Steam first.' });
ipcMain.handle('friend:respond', (e, id, ok) => chat && chat.respond(id, !!ok));
ipcMain.handle('xbox:add', async (e, tag) => { try { return await xbox.addFriend(tag); } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('friends', async () => {
  const live = chat && chat.friends();
  if (live) return { mode: 'api', live: true, friends: live, note: '', requests: chat.requests() };
  return getFriends();
});
ipcMain.handle('profile:get', async () => { try { return { ok: true, p: await chat.profileGet() }; } catch (e) { return { ok: false, msg: e.message }; } });
ipcMain.handle('profile:save', async (e, patch) => { try { await chat.profileSave(patch || {}); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('profile:avatar', async (e, galId, picked) => {
  if (picked && fs.existsSync(picked)) { try { await chat.avatar(picked); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } }
  if (galId != null && galReg.get(String(galId))) { try { await chat.avatar(galReg.get(String(galId))); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } }
  const r = await dialog.showOpenDialog(win, { title: 'Choose a profile picture', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, cancel: true };
  try { await chat.avatar(r.filePaths[0]); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; }
});
// ---- corner pop-ups (friend online, messages, Discord). In the dashboard they are in-app toasts; over a game they use a click-through window.
function popup(d) {
  if (!d) return;
  if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && !watching) { win.webContents.send('popup', d); return; }
  try {
    const b = screen.getPrimaryDisplay().workArea;
    if (!popWin || popWin.isDestroyed()) {
      popWin = new BrowserWindow({ x: b.x + b.width - 440, y: b.y + 16, width: 424, height: 140, show: false, frame: false, transparent: true, skipTaskbar: true, resizable: false, focusable: false, hasShadow: false, alwaysOnTop: true, webPreferences: { contextIsolation: true } });
      popWin.setAlwaysOnTop(true, 'screen-saver'); popWin.setIgnoreMouseEvents(true);
    }
    const esc = x => String(x || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = `<html><body style="margin:0;background:transparent;font-family:Segoe UI,system-ui,sans-serif;color:#fff"><div style="margin:8px;padding:14px 18px;border-radius:18px;background:rgba(24,27,36,.96);box-shadow:0 8px 30px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,255,255,.1);display:flex;gap:14px;align-items:center">${d.icon ? `<img src="${esc(d.icon)}" style="width:52px;height:52px;border-radius:50%;object-fit:cover">` : ''}<div style="min-width:0"><div style="font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.title)}</div><div style="opacity:.75;font-size:14px;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(d.body)}</div></div></div></body></html>`;
    popWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).then(() => { popWin.showInactive(); clearTimeout(popWin._t); popWin._t = setTimeout(() => { try { popWin.hide(); } catch {} }, 5000); }).catch(() => {});
  } catch {}
}
// ---- real brand logos, fetched once and cached on disk
const LOGO_SRC = {
  xbox: ['https://cdn.simpleicons.org/xbox/107C10', 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Xbox_one_logo.svg', 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Xbox_Series_X_logo.svg'],
  steam: ['https://cdn.simpleicons.org/steam/ffffff', 'https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg'],
  discord: ['https://cdn.simpleicons.org/discord/5865F2', 'https://upload.wikimedia.org/wikipedia/commons/9/98/Discord_logo.svg'],
};
ipcMain.handle('logos', async () => {
  const dir = mk(path.join(cacheDir, 'logos')), out = {};
  await Promise.all(Object.entries(LOGO_SRC).map(async ([k, urls]) => {
    const f = path.join(dir, k + (k === 'xbox' ? '2' : '') + '.svg');
    if (!fs.existsSync(f)) for (const u of urls) { try { const r = await net.fetch(u, { headers: { 'User-Agent': 'betterSBP/0.6 (fan project)' } }); if (!r.ok) continue; const t = await r.text(); if (/<svg/i.test(t)) { fs.writeFileSync(f, t); break; } } catch {} }
    try { out[k] = 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64'); } catch {}
  }));
  return out;
});
// ---- Discord: the real Discord web app, signed in inside betterSBP (email / password / QR on discord.com), no developer app or API needed
let dc = null;
const discordState = () => dc ? dc.state() : { available: true, state: 'off' };
const sendDiscord = () => { if (win && !win.isDestroyed()) win.webContents.send('discord:state', discordState()); };
const dcCall = f => async (e, ...a) => { try { if (!dc) throw new Error('Discord is not ready'); return { ok: true, v: await f(...a) }; } catch (er) { return { ok: false, msg: String(er.message || er) }; } };
ipcMain.handle('discord:status', async () => dc ? dc.status() : { available: true, state: 'off' });
ipcMain.handle('discord:connect', () => openApp('discord'));
ipcMain.handle('discord:disconnect', async () => { try { closeApp(); } catch {} if (dc) await dc.logout(); else { cfg.discordIn = false; saveCfg(); sendDiscord(); } return true; });
ipcMain.handle('discord:guilds', dcCall(() => dc.guilds()));
ipcMain.handle('discord:channels', dcCall(g => dc.channels(g)));
ipcMain.handle('discord:dms', dcCall(() => dc.dms()));
ipcMain.handle('discord:friends', dcCall(() => dc.friends()));
ipcMain.handle('discord:opendm', dcCall(u => dc.openDm(u)));
ipcMain.handle('discord:msgs', dcCall(c => dc.msgs(c)));
ipcMain.handle('discord:send', dcCall((c, t) => dc.send(c, t)));
ipcMain.handle('discord:vjoin', dcCall((g, c, n) => dc.vjoin(g, c, n)));
ipcMain.handle('discord:vact', dcCall(a => dc.vact(a)));
ipcMain.handle('discord:vleave', dcCall(() => dc.vleave()));
ipcMain.handle('chat:status', () => chat ? chat.status() : { available: false, state: 'out' });
ipcMain.handle('chat:login', (e, u, p, r) => chat && chat.login(u, p, r));
ipcMain.handle('chat:guard', (e, c) => chat && chat.guard(c));
ipcMain.handle('xbox:status', () => xbox ? xbox.status() : { state: 'out', err: 'Xbox sign-in is not available.' });
ipcMain.handle('xbox:connect', () => xbox && xbox.connect());
ipcMain.handle('xbox:webconnect', () => xbox && xbox.webConnect());
ipcMain.handle('xbox:cancel', () => xbox && xbox.cancel());
ipcMain.handle('xbox:signout', () => xbox && xbox.signout());
ipcMain.handle('xbox:profile', async (e, id) => { try { return { ok: true, p: await xbox.profile(id) }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('xbox:msgs', async (e, id) => { try { return { ok: true, l: await xbox.messages(id) }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('xbox:send', async (e, id, t) => { try { return { ok: await xbox.send(id, t) }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('xbox:friends', async () => { try { return { ok: true, friends: (xbox && await xbox.friends()) || [] }; } catch (e) { return { ok: false, msg: e.message, friends: [] }; } });
ipcMain.handle('chat:persona', (e, n) => { chat && chat.setState(n); return true; });
ipcMain.handle('chat:qr', () => chat && chat.loginQR());
ipcMain.handle('chat:qrcancel', () => chat && chat.cancelQR());
ipcMain.handle('steam:accounts', () => {
  if (!root) return [];
  return steam.allUsers(root).map(u => { let avatar = null; try { avatar = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'config', 'avatarcache', u.steamid + '.png')).toString('base64'); } catch {} return { ...u, avatar }; });
});
ipcMain.handle('chat:logout', () => chat && chat.logout());
ipcMain.handle('chat:history', (e, id) => chat ? chat.history(String(id)) : []);
ipcMain.handle('chat:send', (e, id, t) => chat ? chat.say(String(id), t).then(() => true).catch(() => false) : false);
ipcMain.handle('achievements', (e, id) => getAch(String(id)));
// "Recommended for you": the tags Steam's store has learned for this signed-in account + your own library, minus what you already own
let recCache = { t: 0, who: '', v: null };
async function storeRecs() {
  const who = sid(); if (!who || !chat || chat.status().state !== 'in') return { items: [], signed: false };
  if (recCache.v && recCache.who === who && Date.now() - recCache.t < 30 * 60e3) return recCache.v;
  let ud = {}; try { ud = JSON.parse(await chat.webGet('https://store.steampowered.com/dynamicstore/userdata/')); } catch {}
  const owned = new Set((ud.rgOwnedApps || []).map(String)); try { ((await chat.owned()) || []).forEach(g => owned.add(g.id)); } catch {}
  const tags = (ud.rgRecommendedTags || []).slice(0, 4), wl = (ud.rgWishlist || []).map(String);
  const seen = new Set(), items = [];
  for (const t of tags) { try { const r = await storeBrowse({ tag: t.tagid, sort: 'best' }); for (const i of r.items) if (!owned.has(i.id) && !seen.has(i.id)) { seen.add(i.id); i.why = t.name; items.push(i); } } catch {} }
  items.sort((a, b) => (b.discount || 0) - (a.discount || 0) * 0 );
  const v = { items: items.slice(0, 30), signed: true, tags: tags.map(t => t.name), wishlist: wl.length };
  if (v.items.length) recCache = { t: Date.now(), who, v };
  return v;
}
ipcMain.handle('store:recs', () => storeRecs().catch(() => ({ items: [], signed: true })));
// Steam Community hub content (screenshots, artwork, guides, Workshop) for a game, read from the public hub pages
const HUB = { shots: a => `app/${a}/screenshots/?p=1&browsefilter=trendweek&appHubSubSection=2`, art: a => `app/${a}/images/?p=1&browsefilter=trendweek&appHubSubSection=4`, guides: a => `app/${a}/guides/?p=1&browsefilter=trend`, workshop: a => `workshop/browse/?appid=${a}&browsesort=trend&section=readytouseitems&p=1` };
const hubCache = new Map();
ipcMain.handle('hub:content', async (e, appid, sec) => {
  const k = appid + sec; if (hubCache.has(k)) return hubCache.get(k);
  try {
    const t = await getText('https://steamcommunity.com/' + HUB[sec](appid)), out = [];
    const strip = u => String(u || '').replace(/&amp;/g, '&');
    if (sec === 'workshop') {
      for (const b of t.split('class="workshopItem"').slice(1)) { const i = /workshopItemPreviewImage[^>]*?src="([^"]+)"/.exec(b), n = /workshopItemTitle[^>]*>([^<]*)/.exec(b), a = /workshopItemAuthorName[^>]*>[\s\S]*?<a[^>]*>([^<]*)/.exec(b), id = /filedetails\/\?id=(\d+)/.exec(b); if (i && n) out.push({ id: id && id[1], img: strip(i[1]), full: strip(i[1]).replace(/\?.*$/, ''), title: clean(n[1]), by: a ? clean(a[1]) : '' }); }
    } else {
      for (const b of t.split('apphub_Card ').slice(1)) { const i = /apphub_CardContentPreviewImage[^>]*?src="([^"]+)"/.exec(b) || /<img[^>]*src="(https:\/\/[^"]*steamusercontent[^"]+)"/.exec(b), n = /apphub_CardContentTitle[^>]*>([^<]*)/.exec(b), a = /apphub_CardContentAuthorName[^>]*>[\s\S]*?<a[^>]*>([^<]*)/.exec(b), id = /data-modal-content-url="[^"]*?id=(\d+)/.exec(b) || /filedetails\/\?id=(\d+)/.exec(b); if (i) out.push({ id: id && id[1], img: strip(i[1]), full: strip(i[1]).replace(/\?.*$/, ''), title: n ? clean(n[1]) : '', by: a ? clean(a[1]) : '' }); }
    }
    if (out.length) hubCache.set(k, out); return out;
  } catch { return []; }
});

// ---------------------------------------------------------------- Steam account: cart, wishlist, free licenses, keys, history (all through the signed-in session)
const needIn = () => { if (!chat || chat.status().state !== 'in') throw new Error('Sign in to Steam first.'); };
const CTRY = () => cc().toUpperCase();
const money2 = o => o && o.amount_in_cents != null ? money(o.currency_code || 'USD', o.amount_in_cents) : '';
async function pkgNames(ids) {
  if (!ids.length) return {};
  try {
    const j = await getJson('https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=' + encodeURIComponent(JSON.stringify({ ids: ids.map(p => ({ packageid: p })), context: { language: 'english', country_code: CTRY() }, data_request: { include_assets: true } })));
    const o = {}; for (const it of ((j.response || {}).store_items || [])) { const a = it.assets || {}, base = a.asset_url_format ? 'https://shared.fastly.steamstatic.com/store_item_assets/' + a.asset_url_format.replace('${FILENAME}', a.header || a.main_capsule || '') : ''; o[it.id || it.packageid] = { name: it.name, img: base, app: it.appid, price: it.best_purchase_option && it.best_purchase_option.formatted_final_price }; }
    return o;
  } catch { return {}; }
}
ipcMain.handle('cart:get', async () => {
  try {
    needIn(); const r = await chat.svc('IAccountCartService', 'GetCart', 1, { input_json: JSON.stringify({ user_country: CTRY() }) }), c = r.cart || {}, li = c.line_items || [];
    const nm = await pkgNames(li.map(x => x.packageid).filter(Boolean));
    return { ok: true, items: li.map(x => ({ line: String(x.line_item_id), pkg: x.packageid, name: (nm[x.packageid] || {}).name || (x.bundleid ? 'Bundle ' + x.bundleid : 'Package ' + x.packageid), img: (nm[x.packageid] || {}).img || '', app: (nm[x.packageid] || {}).app, price: money2(x.price_when_added) })), total: money2(c.subtotal) };
  } catch (e) { return { ok: false, msg: e.message, items: [] }; }
});
ipcMain.handle('cart:add', async (e, pkg) => { try { needIn(); await chat.svc('IAccountCartService', 'AddItemsToCart', 1, { input_json: JSON.stringify({ user_country: CTRY(), items: [{ packageid: +pkg, flags: { is_gift: false, is_private: false } }] }) }, true); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('cart:remove', async (e, line) => { try { needIn(); await chat.svc('IAccountCartService', 'RemoveItemFromCart', 1, { input_json: JSON.stringify({ user_country: CTRY(), line_item_ids: [String(line)] }) }, true); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('license:free', async (e, appid) => { try { needIn(); const r = await chat.storePost('https://store.steampowered.com/freelicense/addfreelicense/' + appid, {}); libCache = { t: 0, v: null }; if (chat.resetOwned) chat.resetOwned(); return { ok: !!(r.ok || r.raw), msg: '' }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('wish:get', async () => {
  try { needIn(); const j = JSON.parse(await chat.webGet(`https://store.steampowered.com/wishlist/profiles/${sid()}/wishlistdata/?p=0`)); return { ok: true, items: Object.entries(j).filter(([k, v]) => v && v.name).map(([k, v]) => ({ id: k, name: v.name, img: v.capsule, prio: v.priority || 0 })).sort((a, b) => (a.prio || 9999) - (b.prio || 9999)) }; } catch (er) { return { ok: false, items: [] }; }
});
ipcMain.handle('wish:set', async (e, appid, on) => { try { needIn(); const r = await chat.storePost('https://store.steampowered.com/api/' + (on ? 'addtowishlist' : 'removefromwishlist'), { appid: String(appid) }); return { ok: r.success === true || r.success === 1 || !!r.wishlistCount || r.wishlistCount === 0 }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('key:redeem', async (e, key) => {
  try {
    needIn(); const r = await chat.storePost('https://store.steampowered.com/account/ajaxregisterkey/', { product_key: String(key || '').trim() }), d = r.purchase_receipt_info || {};
    if (r.success === 1) { libCache = { t: 0, v: null }; return { ok: true, msg: 'Activated: ' + ((d.line_items || [])[0] || {}).line_item_description || 'key accepted' }; }
    const why = { 14: 'That key is not valid.', 15: 'That key was already used.', 53: 'Too many attempts. Try again later.', 13: 'This game is not available in your region.', 9: 'You already own this game.', 24: 'You need to own the base game first.', 36: 'You need a PS3 controller to...' }[r.purchase_result_details] || ('Steam did not accept the key (code ' + r.purchase_result_details + ').');
    return { ok: false, msg: why };
  } catch (er) { return { ok: false, msg: er.message }; }
});
ipcMain.handle('account:history', async () => {
  try {
    needIn(); const t = await chat.webGet('https://store.steampowered.com/account/history/'), rows = [];
    for (const b of t.split('wallet_table_row').slice(1)) { const d = /wht_date[^>]*>([^<]*)/.exec(b), i = /wht_items[^>]*>([\s\S]*?)<\/td>/.exec(b), ty = /wht_type[^>]*>([\s\S]*?)<\/td>/.exec(b), tot = /wht_total[^>]*>([\s\S]*?)<\/td>/.exec(b); if (d && i) rows.push({ date: clean(d[1]), items: clean(String(i[1]).replace(/<[^>]+>/g, ' ')), type: ty ? clean(String(ty[1]).replace(/<[^>]+>/g, ' ')) : '', total: tot ? clean(String(tot[1]).replace(/<[^>]+>/g, ' ')) : '' }); }
    const w = /accountBalance[^>]*>[\s\S]*?([^<>\s][^<]*)</.exec(t), bal = /Store credit[\s\S]{0,120}?([$€£₹¥][\d.,]+|[\d.,]+\s?(?:USD|EUR|INR))/.exec(t);
    return { ok: true, rows: rows.slice(0, 60), balance: bal ? bal[1] : '' };
  } catch (er) { return { ok: false, rows: [], msg: er.message }; }
});
ipcMain.handle('store:morelike', async (e, id) => {
  try {
    const t = await getText(`https://store.steampowered.com/recommended/morelike/app/${id}?l=english`), ids = [...new Set([...t.matchAll(/data-ds-appid="(\d+)"/g)].map(x => x[1]))].filter(x => x !== String(id)).slice(0, 10);
    if (!ids.length) return [];
    const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&filters=basic&cc=${cc()}`);
    return ids.filter(i => j[i] && j[i].success).map(i => ({ id: i, name: j[i].data.name }));
  } catch { return []; }
});
// ---- profile items you own + equipping, privacy, community content on a profile
ipcMain.handle('profile:items', async () => { try { return { ok: true, ...(await chat.items()) }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('profile:equip', async (e, kind, id) => { try { await chat.equip(kind, id); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('privacy:get', async () => { try { return { ok: true, p: await chat.privacyGet() }; } catch (er) { return { ok: false, msg: er.message }; } });
ipcMain.handle('privacy:set', async (e, patch) => { try { await chat.privacySave(patch); return { ok: true }; } catch (er) { return { ok: false, msg: er.message }; } });
const UGC = /<img[^>]+src="(https:\/\/(?:images\.steamusercontent\.com|steamuserimages-a\.akamaihd\.net|cdn\.[a-z.]*steamstatic\.com\/steamcommunity\/public\/images\/(?:apps|ugc))[^"]+)"/g;
ipcMain.handle('profile:content', async (e, id, sec) => {
  try {
    const B = `https://steamcommunity.com/profiles/${id}/`;
    if (sec === 'shots' || sec === 'art') {
      const t = await getText(B + (sec === 'shots' ? 'screenshots/' : 'images/') + '?appid=0&sort=newestfirst&browsefilter=myfiles&view=grid'), seen = new Set(), out = [];
      for (const m of t.matchAll(UGC)) { const u = m[1].replace(/&amp;/g, '&'); if (!seen.has(u.replace(/\?.*$/, ''))) { seen.add(u.replace(/\?.*$/, '')); out.push({ img: u, full: u.replace(/\?.*$/, '') }); } }
      return out.slice(0, 40);
    }
    if (sec === 'reviews') {
      const t = await getText(B + 'recommended/?l=english'), out = [];
      for (const b of t.split('class="review_box').slice(1)) { const ap = /recommended\/(\d+)/.exec(b), nm = /class="game_name"[^>]*>\s*<a[^>]*>([^<]*)/.exec(b), up = /icon_thumbsUp/.test(b), hr = /([\d,.]+)\s*hrs on record/.exec(b), tx = /<div class="content">([\s\S]*?)<\/div>/.exec(b); if (ap) out.push({ id: ap[1], game: nm ? clean(nm[1]) : '', up, hours: hr ? hr[1] : '', text: tx ? clean(String(tx[1]).replace(/<[^>]+>/g, ' ')).slice(0, 1200) : '' }); }
      return out;
    }
    if (sec === 'wishlist') { const j = JSON.parse(await getText(`https://store.steampowered.com/wishlist/profiles/${id}/wishlistdata/?p=0`)); return Object.entries(j).filter(([k, v]) => v && v.name).map(([k, v]) => ({ id: k, name: v.name, prio: v.priority || 0 })).sort((a, b) => (a.prio || 9999) - (b.prio || 9999)).slice(0, 60); }
    if (sec === 'groups') { const x = await getText(B + '?xml=1'); return [...x.matchAll(/<group[ >][\s\S]*?<\/group>/g)].map(g => ({ name: clean(tagOf(g[0], 'groupName')), img: tagOf(g[0], 'avatarMedium') || tagOf(g[0], 'avatarIcon'), members: tagOf(g[0], 'memberCount') })).filter(g => g.name); }
  } catch {}
  return [];
});
ipcMain.handle('store:featured', () => storeFeatured().catch(() => null));
ipcMain.handle('store:search', (e, q) => storeSearch(q).catch(() => []));
ipcMain.handle('store:dlc', async (e, ids, all) => {
  const out = await Promise.all((ids || []).slice(0, all ? 60 : 8).map(async id => { try { const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=${cc()}&l=english`); const x = j[id] && j[id].success && j[id].data; if (!x) return null; const po = x.price_overview;
    return { id: String(id), name: x.name, img: x.header_image, price: x.is_free ? 'Free' : po ? (po.final_formatted || money(po.currency, po.final)) : '', discount: po ? po.discount_percent : 0 }; } catch { return null; } }));
  return out.filter(Boolean);
});
const revFetch = async (id, q, why) => {
  const url = `https://store.steampowered.com/appreviews/${id}?json=1&${q}`, H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9', Accept: 'application/json, text/plain, */*', Cookie: 'birthtime=568022401; lastagecheckage=1-0-1988; wants_mature_content=1' };
  for (const f of [net.fetch.bind(net), fetch]) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
    try { const r = await f(url, { headers: H, signal: ac.signal }); if (r.ok) { const j = await r.json(); if (j && j.success !== 0) return j; why.w = 'Steam returned no reviews'; } else why.w = 'Steam answered ' + r.status; }
    catch (e) { why.w = e.name === 'AbortError' ? 'Steam did not answer in time' : 'no connection to Steam'; } finally { clearTimeout(t); }
  }
  return null;
};
const revCache = new Map();
ipcMain.handle('reviews:list', async (e, id) => {
  id = String(id); if (revCache.has(id) && Date.now() - revCache.get(id).t < 600000) return revCache.get(id).v;
  let out = { list: [], summary: null }; const why = { w: '' };
  for (const q of ['filter=all&language=english&num_per_page=40&purchase_type=all&review_type=all&cursor=%2A', 'filter=all&language=all&num_per_page=40&purchase_type=all&cursor=%2A', 'language=english&num_per_page=40']) {
    const j = await revFetch(id, q, why); if (!j) { if (/answered 4\d\d|no connection|in time/.test(why.w)) break; continue; }
    const s = j.query_summary; if (s && s.total_reviews && !out.summary) out.summary = { desc: s.review_score_desc, pct: Math.round(100 * s.total_positive / s.total_reviews), total: s.total_reviews, up: s.total_positive, down: s.total_negative };
    const l = (j.reviews || []).map(r => ({ id: r.recommendationid, up: !!r.voted_up, votes: r.votes_up || 0, hours: Math.round((r.author && r.author.playtime_forever || 0) / 6) / 10, text: clean(String(r.review || '').replace(/\[\/?[a-z0-9*]+[^\]]*\]/gi, ' ')).slice(0, 1500), t: (r.timestamp_created || 0) * 1000 })).filter(r => r.text);
    if (l.length) { out.list = l; break; }
  }
  if (out.list.length || out.summary) revCache.set(id, { t: Date.now(), v: out }); else out.why = why.w || 'no reviews yet';
  return out;
});
const battQ = () => new Promise(res => {
  if (!WIN) return res(null);
  const ps = "$b = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1; if ($b) { Write-Output ('B ' + $b.EstimatedChargeRemaining + ' ' + $b.BatteryStatus) }";
  cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 10000 }, (e, out) => {
    const m = !e && /B\s+(\d*)\s*(\d*)/.exec(String(out));
    if (!m) return res(null);
    const lvl = m[1] === '' ? 100 : +m[1], st = +m[2] || 1;
    res({ level: Math.max(0, Math.min(100, lvl)) / 100, charging: [2, 6, 7, 8, 9].includes(st) });
  });
});
ipcMain.handle('battery:has', async () => !!(await battQ()));
ipcMain.handle('battery:info', () => battQ());
ipcMain.handle('chat:owns', (e, ids) => chat && chat.owns ? chat.owns(ids) : []);
const artFind = new Map();
async function storeAssets(id) {
  id = String(id); if (!/^\d+$/.test(id)) return null; if (artFind.has(id)) return artFind.get(id);
  let out = null;
  try {
    const j = await getJson('https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=' + encodeURIComponent(JSON.stringify({ ids: [{ appid: Number(id) }], context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } })));
    const it = j.response && j.response.store_items && j.response.store_items[0], a = it && it.assets;
    if (a) { const base = 'https://shared.cloudflare.steamstatic.com/store_item_assets/' + String(a.asset_url_format || '').replace('${FILENAME}', '').replace(/\?.*$/, ''); const f = n => a[n] ? base + a[n] : ''; out = { cover: f('library_capsule'), hero: f('library_hero'), header: f('header'), capsule: f('main_capsule') || f('small_capsule') }; }
  } catch {}
  artFind.set(id, out); return out;
}
ipcMain.handle('art:find', (e, id) => storeAssets(id));
const artQ = new Map();
ipcMain.handle('art:fix', (e, id, kind) => {
  id = String(id); kind = kind === 'header' ? 'header' : 'cover'; const key = id + kind; if (artQ.has(key)) return artQ.get(key);
  const p = (async () => {
    try {
      if (!/^\d+$/.test(id)) { const g = await loadGame(id); return (g && g.art && (g.art[kind] || g.art.cover || g.art.header)) || null; }
      const dir = mk(path.join(cacheDir, 'art', id)), hit = fs.readdirSync(dir).find(f => f.startsWith('cover.') || f.startsWith('fixcover.'));
      if (hit) return `dash://art/${id}/${hit}`;
      // fast path: ask the store for this game's own asset list, take the first image that really exists
      const A = (await storeAssets(id).catch(() => null)) || {};
      for (const u of [A.cover, A.header, CDN_STORE + id + '/header.jpg', CDN_STORE + id + '/capsule_616x353.jpg']) { if (!u) continue; const r = await saveImg(u, dir, 'fixcover'); if (r) return r; }
      return (await ensureArt(id, 'cover')) || (await ensureArt(id, 'header')) || null;
    } catch { return null; }
  })();
  artQ.set(key, p); p.then(r => { if (!r) setTimeout(() => artQ.delete(key), 60000); }); return p;
});
const CDN_STORE = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/';
ipcMain.handle('store:app', (e, id) => storeApp(String(id)).catch(() => null));
ipcMain.handle('ost:refresh', (e, id, name) => {
  fs.readdirSync(ostDir()).filter(x => x.startsWith(id + '.')).forEach(x => rmrf(path.join(ostDir(), x)));
  ostJobs.delete(id); cfg.ostIdx = cfg.ostIdx || {}; cfg.ostIdx[id] = ((cfg.ostIdx[id] || 0) + 1) % 7; saveCfg();
  return fetchOst(id, name);
});
ipcMain.handle('win:set', (e, o) => {
  if ('fullscreen' in o && win) win.setFullScreen(!!o.fullscreen);
  if ('startup' in o) { try { app.setLoginItemSettings({ openAtLogin: !!o.startup, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }); } catch {} }
  return true;
});
ipcMain.handle('relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('sys', async () => {
  const c = os.cpus(); let gpu = null;
  try { const g = await app.getGPUInfo('basic'); gpu = (g.auxAttributes && g.auxAttributes.glRenderer) || (g.gpuDevice && g.gpuDevice[0] && g.gpuDevice[0].deviceString) || null; } catch {}
  return {
    platform: process.platform, release: os.release(), arch: os.arch(), host: os.hostname(), cpu: c[0] && c[0].model.trim(), cores: c.length,
    mem: os.totalmem(), free: os.freemem(), uptime: os.uptime(), gpu, versions: process.versions, app: app.getVersion(), steamPath: root,
    user: user && { name: user.name, steamid: user.steamid }, accounts: root ? steam.allUsers(root) : [], hasKey: false, cc: cc(), capDir: capDir(), cacheDir,
  };
});
ipcMain.handle('wifi:list', () => netctl.wifiList().catch(e => ({ ok: false, msg: String(e.message || e) })));
ipcMain.handle('wifi:connect', (e, ssid, pw, auth) => netctl.wifiConnect(ssid, pw, auth).catch(er => ({ ok: false, msg: String(er.message || er) })));
ipcMain.handle('wifi:forget', (e, ssid) => netctl.wifiForget(ssid));
ipcMain.handle('wifi:disconnect', () => netctl.wifiDisconnect());
ipcMain.handle('bt:list', () => netctl.btList().catch(e => ({ ok: false, msg: String(e.message || e) })));
ipcMain.handle('bt:pair', (e, id) => netctl.btPair(String(id)).catch(er => ({ ok: false, msg: String(er.message || er) })));
ipcMain.handle('bt:unpair', (e, id) => netctl.btUnpair(String(id)).catch(er => ({ ok: false, msg: String(er.message || er) })));
ipcMain.handle('bt:connect', (e, id) => netctl.btConnect(String(id)).catch(er => ({ ok: false, msg: String(er.message || er) })));
ipcMain.handle('net', () => {
  const out = [];
  for (const [name, arr] of Object.entries(os.networkInterfaces())) for (const a of arr || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, ip: a.address });
  let wifi = null;
  if (WIN) {
    try {
      const s = cp.execFileSync('netsh', ['wlan', 'show', 'interfaces'], { encoding: 'utf8', timeout: 4000, windowsHide: true });
      const ssid = /^\s*SSID\s*:\s*(.+)$/m.exec(s), sig = /^\s*Signal\s*:\s*(\d+)%/m.exec(s), rate = /Receive rate \(Mbps\)\s*:\s*([\d.]+)/.exec(s);
      if (ssid) wifi = { ssid: ssid[1].trim(), signal: sig ? +sig[1] : null, rate: rate ? +rate[1] : null };
    } catch {}
  }
  return { ifaces: out, wifi };
});
ipcMain.handle('net:test', async () => {
  const t = async u => { const s = Date.now(); try { const r = await net.fetch(u); await r.arrayBuffer(); return { ok: r.ok || r.status === 204, ms: Date.now() - s }; } catch { return { ok: false, ms: 0 }; } };
  const [internet, steamStore] = await Promise.all([t('https://www.gstatic.com/generate_204'), t('https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/')]);
  return { internet, steam: steamStore };
});
const statT = (p, ms = 1500) => Promise.race([fs.promises.statfs(p), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
async function driveLetters() {
  if (!WIN) return [];
  const out = await Promise.all([...'CDEFGHIJKLMNOPQRSTUVWXYZ'].map(async L => { try { const s = await statT(L + ':\\', 1200); return s.blocks ? { L, total: s.bsize * s.blocks, free: s.bsize * s.bavail } : null; } catch { return null; } }));
  return out.filter(Boolean);
}
ipcMain.handle('storage:sig', async () => (await driveLetters()).map(d => d.L).join(''));
ipcMain.handle('storage', async () => {
  const libs = [];
  const media = dirSize(capDir()), saved = acct() && root ? dirSize(path.join(root, "userdata", String(acct()))) : 0;
  let first = true;
  for (const l of root ? steam.libraries(root) : []) {
    const gs = games.filter(g => g.library === l).reduce((a, g) => a + (g.size || 0), 0);
    try {
      const s = await statT(l), total = s.bsize * s.blocks, free = s.bsize * s.bavail, used = total - free;
      const m2 = first ? media : 0, sv = first ? saved : 0;
      libs.push({ path: l, total, free, games: gs, media: m2, saved: sv, other: Math.max(0, used - gs - m2 - sv) });
    } catch { libs.push({ path: l }); }
    first = false;
  }
  if (WIN) {   // every other drive that is plugged in shows up too
    const have = new Set(libs.map(l => l.path.slice(0, 1).toUpperCase()));
    for (const d of await driveLetters()) if (!have.has(d.L)) libs.push({ path: d.L + ':\\', total: d.total, free: d.free, games: 0, media: 0, saved: 0, other: d.total - d.free, extra: true });
  }
  const c = d => dirSize(path.join(cacheDir, d));
  return { libs, games: games.filter(g => !g.nonSteam).map(g => ({ id: g.id, name: g.name, size: g.size, library: g.library })).sort((a, b) => b.size - a.size), cache: { art: c('art') + c('details'), ost: c('ost') } };
});
ipcMain.handle('cache:clear', (e, kind) => {
  if (kind === 'art' || kind === 'all') { rmrf(path.join(cacheDir, 'art')); rmrf(path.join(cacheDir, 'details')); gameCache.clear(); }
  if (kind === 'ost' || kind === 'all') { rmrf(path.join(cacheDir, 'ost')); ostJobs.clear(); ostStarted = false; }
  return true;
});
ipcMain.handle('gallery', () => {
  const items = [], P = cfg.prefs || {};
  const add = (file, source, appid) => { try { items.push({ file, source, appid, time: fs.statSync(file).mtimeMs }); } catch {} };
  const scan = (dir, source, appid) => { let f = []; try { f = fs.readdirSync(dir); } catch { return; } f.forEach(n => /\.(jpe?g|png|webp|bmp)$/i.test(n) && add(path.join(dir, n), source, appid)); };
  if (P.galSteam !== false && root && acct()) {
    const base = path.join(root, 'userdata', String(acct()), '760', 'remote'); let apps = [];
    try { apps = fs.readdirSync(base); } catch {}
    apps.forEach(a => scan(path.join(base, a, 'screenshots'), 'steam', a));
  }
  scan(capDir(), 'dash');
  if (P.galWin !== false) scan(path.join(os.homedir(), 'Pictures', 'Screenshots'), 'windows');
  items.sort((a, b) => b.time - a.time); galReg.clear();
  return items.slice(0, 400).map((it, i) => { galReg.set(String(i), it.file); return { id: i, src: `dash://gal/${i}`, source: it.source, appid: it.appid || null, time: it.time, name: path.basename(it.file) }; });
});
async function takeCapture() {
  try {
    const d = screen.getPrimaryDisplay(), size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
    const s = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size }))[0];
    if (!s) return null;
    const f = path.join(capDir(), 'betterSBP ' + new Date().toISOString().replace(/[:.]/g, '-') + '.png');
    fs.writeFileSync(f, s.thumbnail.toPNG());
    if (win) win.webContents.send('captured', f);
    return f;
  } catch { return null; }
}
ipcMain.handle('capture', () => takeCapture());

ipcMain.handle('init', () => {
  let avatar = null;
  if (user && user.avatarFile) {
    try { fs.copyFileSync(user.avatarFile, path.join(mk(path.join(cacheDir, 'misc')), 'avatar.png')); avatar = 'dash://misc/avatar.png'; } catch {}
  }
  setTimeout(prefetchOst, 4000);
  return {
    steamFound: !!root && !noSteam, user: { name: (user && user.name) || os.userInfo().username, avatar, steamid: sid() || (user && user.steamid) },
    prefs: cfg.prefs || {}, hasKey: false,
    games: games.map(pubGame),
  };
});
ipcMain.handle('game:data', (e, id) => loadGame(String(id)));
ipcMain.handle('ost', (e, id, name) => fetchOst(String(id), name));
ipcMain.handle('news', () => getNews());
ipcMain.handle('game:action', async (e, { id, type }) => {
  const g = games.find(x => x.id === String(id));
  if (type === 'ctrlcfg') { try { if (!(await steamRunning())) { await shell.openExternal('steam://open/main'); await sleepMs(3500); } } catch {} shell.openExternal('steam://controllerconfig/' + id).catch(() => {}); return true; }
  if (type === 'shots') { let d = ''; try { for (const u of steam.allUsers(root)) { const acct = String(BigInt(u.steamid) - 76561197960265728n); const c = path.join(root, 'userdata', acct, '760', 'remote'); if (fs.existsSync(c)) { d = c; break; } } } catch {} if (d) shell.openPath(d); return !!d; }
  if (type === 'install') shell.openExternal('steam://install/' + id);
  else if (type === 'store') shell.openExternal('steam://store/' + id);
  else if (type === 'library') shell.openExternal('steam://nav/games/details/' + id);
  else if (type === 'files' && g) shell.openPath(path.join(g.library, 'steamapps', 'common', g.installdir));
  else if (type === 'uninstall' && g && g.library) {
    rmrf(path.join(g.library, 'steamapps', 'common', g.installdir)); rmrf(path.join(g.library, 'steamapps', 'appmanifest_' + g.id + '.acf')); rmrf(path.join(g.library, 'steamapps', 'shadercache', String(g.id))); rmrf(path.join(g.library, 'steamapps', 'downloading', String(g.id))); refreshGames();
  } else if (type === 'removens') { cfg.nonSteam = (cfg.nonSteam || []).filter(n => n.id !== String(id)); saveCfg(); refreshGames(); }
  else if (type === 'refresh') {
    fs.rmSync(path.join(cacheDir, 'art', String(id)), { recursive: true, force: true });
    fs.rmSync(path.join(cacheDir, 'details', id + '.json'), { force: true });
    gameCache.delete(String(id)); if (cfg.nsMatch) delete cfg.nsMatch[String(id)]; if (cfg.nsMiss) delete cfg.nsMiss[String(id)]; saveCfg();
  }
  return true;
});
ipcMain.handle('ns:setart', (e, id, sid) => { cfg.nsMatch = cfg.nsMatch || {}; if (sid) cfg.nsMatch[String(id)] = String(sid); else delete cfg.nsMatch[String(id)]; if (cfg.nsMiss) delete cfg.nsMiss[String(id)]; saveCfg(); fs.rmSync(path.join(cacheDir, 'art', String(id)), { recursive: true, force: true }); gameCache.delete(String(id)); return true; });
ipcMain.handle('ns:add', async (e, picked) => {
  let fp = picked && fs.existsSync(picked) ? picked : null;
  if (!fp) { const r = await dialog.showOpenDialog(win, { title: 'Add a non-Steam game', properties: ['openFile'], filters: [{ name: 'Programs and shortcuts', extensions: ['exe', 'lnk', 'bat', 'cmd'] }] }); if (r.canceled || !r.filePaths[0]) return null; fp = r.filePaths[0]; }
  const exe = fp, name = path.basename(exe).replace(/\.[^.]+$/, '');
  cfg.nonSteam = cfg.nonSteam || []; const id = 'ns' + Date.now().toString(36);
  cfg.nonSteam.push({ id, name, exe }); saveCfg(); refreshGames(); return { id, name };
});
ipcMain.handle('launch', async (e, a) => {
  try {
    if (a.steam) {
      const direct = prefs().launchMode !== 'steam' && !a.viaSteam && !(prefs().viaSteam || []).includes(String(a.steam)) && games.some(g => String(g.id) === String(a.steam));
      if (direct && await launchDirect(a.steam, a.args)) { minimizeSoon(); setTimeout(enterLowPower, 1600); setTimeout(prepOverlay, 4000); return { ok: true, direct: true }; }
      await launchSteamGame(a.steam, a.args); minimizeSoon(); watchGame(a.steam); setTimeout(enterLowPower, 1600); setTimeout(prepOverlay, 4000); }
    else if (a.uri) { await shell.openExternal(a.uri); minimizeSoon(); }
    else if (a.path) { await shell.openPath(a.path.replace(/%USERPROFILE%/gi, os.homedir())); minimizeSoon(); }
    else if (a.exe) { const c = cp.spawn('"' + a.exe + '"', a.args ? [a.args] : [], { detached: true, stdio: 'ignore', shell: true, cwd: path.dirname(a.exe) }); c.unref(); minimizeSoon(); watching = { id: a.nsid || 'ns' }; setTimeout(enterLowPower, 1600); setTimeout(prepOverlay, 4000); c.on('exit', () => { setTimeout(() => { if (watching && !String(watching.id).match(/^\d+$/)) restore(); }, 1500); }); }
    return { ok: true };
  } catch { return { ok: false }; }
});
ipcMain.handle('power', (e, a) => {
  if (!POWER_ENABLED || !WIN) return { ok: false, msg: 'Power actions are disabled (POWER_ENABLED in main.js).' };
  if (a === 'sleep') cp.exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
  else if (a === 'shutdown') cp.exec('shutdown /s /t 0');
  else if (a === 'restart') cp.exec('shutdown /r /t 0');
  return { ok: true };
});
ipcMain.handle('captures', () => {
  try {
    const dir = path.join(os.homedir(), 'Pictures', 'Screenshots');
    const f = fs.readdirSync(dir).filter(x => /\.(png|jpe?g)$/i.test(x))
      .map(x => ({ x, t: fs.statSync(path.join(dir, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
    if (!f) return null;
    const img = nativeImage.createFromPath(path.join(dir, f.x)).resize({ width: 640 });
    return { thumb: 'data:image/jpeg;base64,' + img.toJPEG(80).toString('base64'), when: f.t };
  } catch { return null; }
});
ipcMain.handle('quit', () => app.quit());

// ------------------------------------------------------------------- window
function createWindow() {
  win = new BrowserWindow({
    fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor: '#05070c',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => { guideGuard(); if (watching) setTimeout(() => { if (watching && win && !win.isFocused()) enterLowPower(); }, 800); });
  win.on('focus', () => { if (watching) leaveLowPower(); });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', restore);
// Widevine (DRM) for YouTube TV: works when run with the castlabs Electron build (as used by marcosrg9/YouTubeTV).
const ecs = require('electron').components;
app.whenReady().then(() => (ecs && ecs.whenReady ? ecs.whenReady().catch(() => {}) : null)).then(() => {
  cacheDir = mk(path.join(app.getPath('userData'), 'cache'));
  cfg = J(path.join(app.getPath('userData'), 'config.json'), {});
  root = steam.steamRoot();
  if (!root) { try { noSteam = true; const own = path.join(app.getPath('userData'), 'library'); fs.mkdirSync(path.join(own, 'steamapps'), { recursive: true }); root = own; } catch {} }   // no Steam client installed: betterSBP keeps its own library folder (SteamCMD downloads go there)
  if (root) {
    cfg.nonSteam = cfg.nonSteam || []; games = scanAll();
    user = cfg.useLocalProfile ? steam.activeUser(root) : null;   // off by default: the in-app Steam login decides who you are
    if (acct()) stats = steam.playStats(root, acct());
  }
  const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.bmp': 'image/bmp', '.webm': 'video/webm', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.opus': 'audio/ogg', '.ogg': 'audio/ogg' };
  const serve = (file, req) => {
    const st = fs.statSync(file), range = req.headers.get('range');
    const hd = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range); let s = m && m[1] ? +m[1] : 0, e = m && m[2] ? +m[2] : st.size - 1;
      if (e >= st.size) e = st.size - 1;
      hd['Content-Range'] = `bytes ${s}-${e}/${st.size}`; hd['Content-Length'] = String(e - s + 1);
      return new Response(Readable.toWeb(fs.createReadStream(file, { start: s, end: e })), { status: 206, headers: hd });
    }
    hd['Content-Length'] = String(st.size);
    return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: hd });
  };
  protocol.handle('dash', req => {
    const u = new URL(req.url); let file = null;
    if (u.host === 'gal') file = galReg.get(decodeURIComponent(u.pathname).replace(/^\//, ''));
    else if (u.host === 'vid') file = vidReg.get(decodeURIComponent(u.pathname).replace(/^\//, ''));
    else if (['art', 'ost', 'misc'].includes(u.host)) {
      const base = path.join(cacheDir, u.host); file = path.join(base, decodeURIComponent(u.pathname));
      if (!file.startsWith(base)) file = null;
    }
    if (!file || !fs.existsSync(file)) return new Response('', { status: 404 });
    return serve(file, req);
  });
  createWindow();
  try { xbox = createXbox({ app, safeStorage, openLogin: (url, redir) => new Promise(res => { let done = false; const w = new BrowserWindow({ parent: win, modal: true, fullscreen: true, frame: false, autoHideMenuBar: true, backgroundColor: '#ffffff', webPreferences: { partition: 'persist:xcloud' } }); w.webContents.setUserAgent(EDGE_UA); const fin = c => { if (done) return; done = true; res(c); try { w.destroy(); } catch {} }; const chk = (e, u) => { if (String(u).startsWith(redir)) { if (e && e.preventDefault) e.preventDefault(); let c = null; try { c = new URL(u).searchParams.get('code'); } catch {} fin(c); } }; w.webContents.on('will-redirect', chk); w.webContents.on('will-navigate', chk); w.webContents.on('did-navigate', (e, u) => chk(null, u)); w.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') fin(null); }); w.on('closed', () => fin(null)); w.loadURL(url); }), getCfg: () => cfg, saveCfg, QR: (() => { try { return require('qrcode'); } catch { return null; } })(), notify: (c, d) => { if (c === 'popup') { if ((cfg.prefs || {}).popMsg !== false) popup(d); return; } if (win && !win.isDestroyed()) win.webContents.send(c, d); } }); setTimeout(() => xbox.resume(), 3500); } catch {}
  dc = createDiscord({ session, BrowserWindow, getCfg: () => cfg, saveCfg, safeStorage, onChange: sendDiscord, onMessage: m => { if ((cfg.prefs || {}).popMsg !== false) popup({ kind: 'discord', title: m.name, body: m.text, icon: m.avatar }); } });
  setTimeout(() => { try { dc.status(); } catch {} }, 6000);
  chat = createChat({ app, safeStorage, getCfg: () => cfg, saveCfg, notify: (c, d) => { if (c === 'popup') return popup(d); if (c === 'chat:state' && d && d.state === 'in' && lastIn !== d.me) { lastIn = d.me; libCache = { t: 0, v: null }; setTimeout(refreshGames, 50); } if (win && !win.isDestroyed()) win.webContents.send(c, d); } });
  setTimeout(() => chat.resume(), 1500);
  try { const { powerMonitor } = require('electron'); powerMonitor.on('resume', () => setTimeout(() => chat.nudge(), 4000)); powerMonitor.on('unlock-screen', () => chat.nudge()); } catch {}
  setInterval(() => { try { chat.nudge(); } catch {} }, 600000);
  // auto-refresh the library when a game is installed / removed / updated (also covers installs done by Steam itself)
  { let deb = null, sig = () => games.map(g => g.id + ':' + (g.state || '')).sort().join();
    const kick = () => { clearTimeout(deb); deb = setTimeout(() => { if (!root) return; const before = sig(); const ng = scanAll(); const after = ng.map(g => g.id + ':' + (g.state || '')).sort().join(); if (before !== after) refreshGames(); }, 1500); };
    const hook = () => { try { for (const l of steam.libraries(root)) { const d = path.join(l, 'steamapps'); if (fs.existsSync(d) && !watched.has(d)) { watched.add(d); try { fs.watch(d, { persistent: false }, (ev, f) => { if (!f || /appmanifest_/.test(f)) kick(); }); } catch {} } } } catch {} };
    const watched = new Set(); let libSig = ''; 
    if (root) { hook(); setInterval(() => { hook(); kick(); }, 20000);
      // a drive plugged in (or removed) shows up within seconds: Steam libraries on it appear in Storage / Downloads / Library without a restart
      setInterval(() => { try { const s2 = steam.libraries(root).join('|'); if (s2 !== libSig) { const first = libSig === ''; libSig = s2; if (!first) { hook(); refreshGames(); if (win && !win.isDestroyed()) win.webContents.send('storage:changed'); } } } catch {} }, 4000); } }
  dl = createDownloads({ getPass: () => chat && chat.password(), onPass: p => { try { chat && chat.savePw(p); } catch {} }, app, net, getRoot: () => root, getCfg: () => cfg, saveCfg, notify: (c, d) => { if (win && !win.isDestroyed()) win.webContents.send(c, d); }, onInstalled: i => { refreshGames(); } });
  globalShortcut.register('CommandOrControl+Alt+D', restore);
  watchGuide(onGuide);
  globalShortcut.register('CommandOrControl+Alt+S', takeCapture);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { dl && dl.stopAll(); } catch {} });
app.on('window-all-closed', () => app.quit());
