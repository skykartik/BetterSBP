// Pure-Node Steam helpers (no Electron dependency, so they can be tested alone).
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

// Minimal Valve KeyValues (VDF/ACF) parser.
function parseVdf(text) {
  const tok = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  const stack = [{}];
  let key = null, m;
  while ((m = tok.exec(text))) {
    if (m[2] === '{') { const o = {}; stack[stack.length - 1][key] = o; stack.push(o); key = null; }
    else if (m[2] === '}') { if (stack.length > 1) stack.pop(); key = null; }
    else {
      const s = m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
      if (key === null) key = s; else { stack[stack.length - 1][key] = s; key = null; }
    }
  }
  return stack[0];
}

// case-insensitive property lookup
function ci(o, k) {
  if (!o || typeof o !== 'object') return undefined;
  const kk = Object.keys(o).find(x => x.toLowerCase() === k.toLowerCase());
  return kk === undefined ? undefined : o[kk];
}

function steamRoot() {
  const c = [];
  if (process.env.STEAM_PATH) c.push(process.env.STEAM_PATH);
  if (process.platform === 'win32') {
    try {
      const out = cp.execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
      if (m) c.push(m[1].trim());
    } catch {}
    try {
      const o2 = cp.execSync('reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m2 = o2.match(/InstallPath\s+REG_SZ\s+(.+)/i); if (m2) c.push(m2[1].trim());
    } catch {}
    c.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
    for (const d of 'DEFGHIJKLMNOPQRSTUVWXYZ') c.push(d + ':\\Steam', d + ':\\Program Files (x86)\\Steam', d + ':\\Games\\Steam');
  } else {
    const h = os.homedir();
    c.push(path.join(h, '.steam/steam'), path.join(h, '.local/share/Steam'), path.join(h, 'Library/Application Support/Steam'));
  }
  return c.map(p => path.normalize(p)).find(p => fs.existsSync(path.join(p, 'steamapps'))) || null;
}

// Steam library folders that sit on other drives, found even when Steam's own list is missing or Steam is not installed
let scanT = 0, scanC = [];
function driveLibs() {
  if (process.platform !== 'win32') return [];
  if (Date.now() - scanT < 8000) return scanC; scanT = Date.now(); const o = [];
  for (const d of 'CDEFGHIJKLMNOPQRSTUVWXYZ') for (const n of ['SteamLibrary', 'Steam', 'Games\\SteamLibrary', 'Games\\Steam', 'Program Files (x86)\\Steam', 'Program Files\\Steam', 'Steam Library', 'Games']) { const p = d + ':\\' + n; try { if (fs.existsSync(path.join(p, 'steamapps'))) o.push(p); } catch {} }
  return (scanC = o);
}
function libraries(root) {
  const libs = new Set(root ? [root] : []); driveLibs().forEach(l => libs.add(l));
  if (root) try {
    const v = parseVdf(fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'));
    const lf = ci(v, 'libraryfolders') || {};
    for (const k of Object.keys(lf)) {
      const e = lf[k];
      if (typeof e === 'string') libs.add(path.normalize(e));
      else if (e && ci(e, 'path')) libs.add(path.normalize(ci(e, 'path')));
    }
  } catch {}
  const seen = new Set(), out = [];
  for (let p of libs) {
    p = path.normalize(String(p)).replace(/[\\/]+$/, '').replace(/^([a-z]):/, (m, d) => d.toUpperCase() + ':');   // "c:\\Steam" and "C:\\Steam" are the same place
    if (/^[A-Z]:$/.test(p)) p += path.sep;
    const k = process.platform === 'win32' ? p.toLowerCase() : p;
    if (seen.has(k) || !fs.existsSync(path.join(p, 'steamapps'))) continue;
    seen.add(k); out.push(p);
  }
  return out;
}

const SKIP_IDS = new Set(['228980', '1070560', '1391110', '1493710', '1628350', '2180100', '1826330', '1580130']);
const SKIP_NAME = /^(Steamworks Common|Proton\b|Steam Linux Runtime|Steam Controller Configs)/i;

function scanGames(root) {
  const out = new Map();
  for (const lib of libraries(root)) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      const m = /^appmanifest_(\d+)\.acf$/.exec(f);
      if (!m) continue;
      try {
        const a = ci(parseVdf(fs.readFileSync(path.join(dir, f), 'utf8')), 'AppState') || {};
        const id = String(ci(a, 'appid') || m[1]);
        const flags = parseInt(ci(a, 'StateFlags') || '0', 10);
        const name = ci(a, 'name') || ('App ' + id);
        const instDir = ci(a, 'installdir') || ''; if (!(flags & 4) && !(instDir && fs.existsSync(path.join(dir, 'common', instDir)))) continue;   // fully installed, or files present (manifest-installed)
        if (SKIP_IDS.has(id) || SKIP_NAME.test(name)) continue;
        out.set(id, {
          id, name,
          installdir: ci(a, 'installdir') || '',
          lastPlayed: parseInt(ci(a, 'LastPlayed') || '0', 10),
          size: parseInt(ci(a, 'SizeOnDisk') || '0', 10),
          library: lib,
        });
      } catch {}
    }
  }
  return [...out.values()].sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
}

function activeUser(root) {
  try {
    const users = ci(parseVdf(fs.readFileSync(path.join(root, 'config', 'loginusers.vdf'), 'utf8')), 'users') || {};
    let best = null;
    for (const [sid, u] of Object.entries(users)) {
      const rec = { steamid: sid, name: ci(u, 'PersonaName') || ci(u, 'AccountName') || 'Player' };
      if (!best || ci(u, 'MostRecent') === '1') best = rec;
    }
    if (!best) return null;
    best.accountId = Number(BigInt(best.steamid) - 76561197960265728n);
    const av = path.join(root, 'config', 'avatarcache', best.steamid + '.png');
    best.avatarFile = fs.existsSync(av) ? av : null;
    return best;
  } catch { return null; }
}

function allUsers(root) {
  try {
    const users = ci(parseVdf(fs.readFileSync(path.join(root, 'config', 'loginusers.vdf'), 'utf8')), 'users') || {};
    return Object.entries(users).map(([sid, u]) => ({ steamid: sid, name: ci(u, 'PersonaName') || ci(u, 'AccountName') || sid, account: ci(u, 'AccountName') || '', recent: ci(u, 'MostRecent') === '1' }));
  } catch { return []; }
}

const lcCache = new Map();
function localConfig(root, accountId) {
  const key = root + '|' + accountId;
  if (!lcCache.has(key)) {
    let v = {};
    try { v = parseVdf(fs.readFileSync(path.join(root, 'userdata', String(accountId), 'config', 'localconfig.vdf'), 'utf8')); } catch {}
    lcCache.set(key, ci(v, 'UserLocalConfigStore') || {});
  }
  return lcCache.get(key);
}

// friends Steam cached locally (names + avatars only, no online state)
function localFriends(root, accountId) {
  const out = [], f = ci(localConfig(root, accountId), 'friends') || {};
  for (const k of Object.keys(f)) {
    if (!/^\d+$/.test(k) || typeof f[k] !== 'object') continue;
    const name = ci(f[k], 'name'); if (!name) continue;
    const av = ci(f[k], 'avatar');
    out.push({ id: String(BigInt(k) + 76561197960265728n), name, avatar: av && /^[0-9a-f]{40}$/i.test(av) ? `https://avatars.steamstatic.com/${av}_full.jpg` : null, state: -1 });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// playtime (minutes) + last played per appid, from localconfig.vdf (best effort)
function playStats(root, accountId) {
  const out = {};
  try {
    const apps = ci(ci(ci(ci(localConfig(root, accountId), 'Software'), 'Valve'), 'Steam'), 'apps') || {};
    for (const id of Object.keys(apps)) {
      const a = apps[id];
      out[id] = { playtime: parseInt(ci(a, 'Playtime') || ci(a, 'playtime_forever') || '0', 10), lastPlayed: parseInt(ci(a, 'LastPlayed') || '0', 10) };
    }
  } catch {}
  return out;
}

// artwork that Steam already cached locally
const LOCAL_NAMES = { hero: ['library_hero.jpg'], logo: ['logo.png'], cover: ['library_600x900.jpg'], header: ['header.jpg'] };
const FLAT = { hero: '_library_hero.jpg', logo: '_logo.png', cover: '_library_600x900.jpg', header: '_header.jpg' };
function localArt(root, id, kind) {
  const base = path.join(root, 'appcache', 'librarycache');
  const flat = path.join(base, id + FLAT[kind]);
  if (fs.existsSync(flat)) return flat;
  const walk = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) if (e.isFile() && LOCAL_NAMES[kind].includes(e.name.toLowerCase())) return path.join(d, e.name);
    if (depth > 0) for (const e of ents) if (e.isDirectory()) { const r = walk(path.join(d, e.name), depth - 1); if (r) return r; }
    return null;
  };
  return walk(path.join(base, id), 2);
}

// non-Steam games the user added to Steam (binary shortcuts.vdf)
function shortcuts(root, accountId) {
  let b; try { b = fs.readFileSync(path.join(root, 'userdata', String(accountId), 'config', 'shortcuts.vdf')); } catch { return []; }
  let p = 0;
  const str = () => { const e = b.indexOf(0, p); const v = b.toString('utf8', p, e < 0 ? b.length : e); p = (e < 0 ? b.length : e) + 1; return v; };
  const map = () => { const o = {}; while (p < b.length) { const t = b[p++]; if (t === 8) return o; const k = str().toLowerCase(); if (t === 0) o[k] = map(); else if (t === 1) o[k] = str(); else if (t === 2) { o[k] = b.readUInt32LE(p); p += 4; } else return o; } return o; };
  try { p = 0; b[p++]; str(); const root0 = map(); return Object.values(root0).filter(x => x && x.appname && x.exe).map(x => ({ id: 'sc' + (x.appid >>> 0), name: x.appname, exe: String(x.exe).replace(/^"|"$/g, ''), args: x.launchoptions || '', dir: String(x.startdir || '').replace(/^"|"$/g, '') })); } catch { return []; }
}

module.exports = { shortcuts, parseVdf, steamRoot, libraries, scanGames, activeUser, allUsers, localFriends, playStats, localArt, ci };
