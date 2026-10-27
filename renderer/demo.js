// Preview mode: used automatically when running in a plain browser (no Electron / Steam).
if (!window.dash) {
  const enc = s => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
  const art = (w, h, a, b, seed, label) => enc(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <radialGradient id="r"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="${w * (0.2 + seed * 0.15)}" cy="${h * 0.35}" r="${h * 0.45}" fill="url(#r)"/>
      <circle cx="${w * (0.8 - seed * 0.1)}" cy="${h * 0.7}" r="${h * 0.3}" fill="url(#r)" opacity=".5"/>
      <path d="M0 ${h * 0.8} Q ${w * 0.3} ${h * 0.55} ${w * 0.6} ${h * 0.8} T ${w} ${h * 0.7} V ${h} H0Z" fill="#000" opacity=".35"/>
      ${label ? `<text x="50%" y="52%" fill="#fff" fill-opacity=".9" font-family="Segoe UI,sans-serif" font-weight="900" font-size="${h * 0.16}" text-anchor="middle">${label}</text>` : ''}
    </svg>`);
  const G = [
    ['Neon Drifter', '#ff3d81', '#2a0a3d', 'Race through a rain-soaked megacity where every corner hides a shortcut and a rival. Tune your machine, chase the dawn, and own the night.', ['Racing', 'Arcade']],
    ['Hollow Citadel', '#34d5c0', '#07263a', 'Descend into a forgotten fortress of glass and shadow. A hand-painted action adventure about memory, loss and very large doors.', ['Action', 'Adventure']],
    ['Ember Tide', '#ffa53d', '#3a0f0a', 'Sail a volcanic archipelago, trade with spirits, and keep the last lighthouse burning against the rising tide.', ['Exploration', 'Co-op']],
    ['Skyline Rangers', '#5b8cff', '#0b1745', 'Team up with three friends to defend floating cities from the storm. Fast, readable, and built for couch co-op.', ['Shooter', 'Co-op']],
    ['Quiet Orchard', '#8be36b', '#0f3320', 'A gentle farming sim about slow mornings, odd neighbours and one extremely ambitious pumpkin.', ['Casual', 'Simulation']],
    ['Vanta Protocol', '#b36bff', '#170a33', 'Infiltrate corporate towers in this stylish stealth thriller. Every light you break rewrites the level.', ['Stealth', 'Action']],
  ];
  const ago = d => Math.floor(Date.now() / 1000) - d * 86400;
  window.__demoApi = {
    init: async () => ({ steamFound: true, user: { name: 'Player One', avatar: null },
      games: G.map((g, i) => ({ id: String(i + 1), name: g[0], size: 3e10 + i * 4e9, lastPlayed: ago(i + 1) })) }),
    game: async id => {
      const i = Number(id) - 1, g = G[i];
      return { id, art: { cover: art(600, 900, g[1], g[2], i / 6, g[0].toUpperCase()), hero: art(1920, 620, g[1], g[2], i / 6, ''),
          header: art(460, 215, g[1], g[2], i / 6, ''), logo: null },
        details: { type: 'game', desc: g[3], genres: g[4], dlcIds: [901,902,903], developers: ['Demo Studio'], trailer: null, movies: [{ name: 'Launch trailer', thumb: art(640, 360, g[1], g[2], .4, ''), url: 'about:blank' }], shots: [0, 1, 2].map(k => ({ thumb: art(600, 338, g[1], g[2], k / 3, ''), full: art(1920, 1080, g[1], g[2], k / 3, g[0]) })) },
        stats: { playtime: 300 + i * 410, lastPlayed: ago(i + 1) }, trophies: i % 2 ? { earned: 10 + i, total: 46 } : null, hidden: false };
    },
    gameAction: async () => true, ost: async () => null,
    news: async () => G.slice(0, 5).map((g, i) => ({ gameId: String(i + 1), gameName: g[0], title: ['Season 3 arrives next week', 'Patch 1.4: new boss and fixes', 'Community spotlight: May', 'Weekend free trial live now', 'Soundtrack out now'][i],
      snippet: 'Everything new in this update, from balance tweaks to brand new content and quality-of-life improvements.', url: '', date: Date.now() - i * 86400e3 })),
    captures: async () => null, launch: async () => ({ ok: true }),
    power: async () => ({ ok: false, msg: 'Power actions are disabled in preview.' }), quit: async () => {}, onRestored: () => {},
  };
  const A = window.__demoApi, wide = (i, t) => art(640, 360, G[i % 6][1], G[i % 6][2], (i % 7) / 7, t || '');
  const ld = JSON.parse(localStorage.getItem('demoPrefs') || '{}');
  const oi = A.init; A.init = async () => Object.assign(await oi(), { prefs: ld, hasKey: false });
  Object.assign(A, {
    cfgSet: async p => { if (p.prefs) localStorage.setItem('demoPrefs', JSON.stringify(p.prefs)); return true; }, setWindow: async () => true,
    onCaptured: () => {}, relaunch: async () => {}, ostRefresh: async () => null, clearCache: async () => true, capture: async () => 'C:/Pictures/betterSBP Captures/x.png',
    sys: async () => ({ platform: 'win32', release: '10.0.26100', arch: 'x64', host: 'KARTIK-PC', cpu: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 16, mem: 3.4e10, free: 1.5e10, uptime: 93000, gpu: 'NVIDIA GeForce RTX 3070',
      versions: { electron: '33.0.0', chrome: '130.0', node: '20.0' }, app: '0.3.0', steamPath: 'C:\\Program Files (x86)\\Steam', user: { name: 'Player One', steamid: '76561198000000001' }, accounts: [{ name: 'Player One' }, { name: 'Alt' }], hasKey: false, capDir: 'C:\\Users\\you\\Pictures\\betterSBP Captures', cacheDir: 'C:\\Users\\you\\AppData\\Roaming\\dash' }),
    net: async () => ({ ifaces: [{ name: 'Wi-Fi', ip: '192.168.1.24' }], wifi: { ssid: 'Home-5G', signal: 82, rate: 866 } }),
    netTest: async () => ({ internet: { ok: true, ms: 38 }, steam: { ok: true, ms: 95 } }),
    storage: async () => ({ libs: [{ path: 'C:\\Program Files (x86)\\Steam', total: 5e11, free: 2.1e11, games: 1.03e11, media: 1.2e7, saved: 8.7e7, other: 1.99e10 }, { path: 'D:\\SteamLibrary', total: 1e12, free: 6e11 }], games: G.map((g, i) => ({ id: String(i + 1), name: g[0], size: 3e10 + i * 4e9 })), cache: { art: 4.2e7, ost: 3.1e8 } }),
    gallery: async () => Array.from({ length: 9 }, (_, i) => ({ id: i, src: art(1280, 720, G[i % 6][1], G[i % 6][2], i / 9, G[i % 6][0]), source: ['steam', 'dash', 'windows'][i % 3], appid: i % 3 === 0 ? String(i % 6 + 1) : null, time: Date.now() - i * 86400e3 * 2, name: 'x' + i + '.png' })),
    library: async () => ({ source: 'xml', note: '', games: Array.from({ length: 24 }, (_, i) => ({ id: String(i < 6 ? i + 1 : 1000 + i), name: i < 6 ? G[i][0] : 'Library Game ' + (i + 1), minutes: i * 97 % 900, last: i % 3 ? 0 : Math.floor(Date.now() / 1000) - i * 86400, installed: i < 6 })) }),
    profile: async () => ({ id: '1', name: 'Player One', avatar: '', online: 'online', status: 'Online', realName: 'Kartik', location: 'India', since: 'March 3, 2016', hours2w: '18.4', level: 27, summary: 'Racing, co-op and cozy games.',
      most: G.slice(0, 4).map((g, i) => ({ id: String(i + 1), name: g[0], hours: String(120 - i * 20) })) }),
    friends: async () => ({ mode: 'api', friends: ['Alex', 'Bina', 'Chandra', 'Dev', 'Esha', 'Farhan'].map((n, i) => ({ id: String(100 + i), name: n, avatar: null, state: i < 2 ? 1 : i < 4 ? 3 : 0, game: i === 0 ? 'Skyline Rangers' : null })) }),
    achievements: async id => { const n = 12 + (+id % 5) * 4, e = Math.floor(n * ((+id * 37 % 90) / 100)); return +id > 6 ? null : { earned: e, total: n, list: Array.from({ length: n }, (_, i) => ({ done: i < e, name: 'Achievement ' + (i + 1), desc: 'Complete a challenge to unlock this.', icon: art(64, 64, '#ffa53d', '#3a0f0a', i / n, ''), time: Date.now() - i * 864e5 * 3 })) }; },
    trophies: async id => { const a = await A.achievements(id); return a && { earned: a.earned, total: a.total }; },
    storeFeatured: async () => ({ shelves: ['Top Sellers', 'Special Offers', 'New Releases', 'Coming Soon'].map((t, s) => ({ title: t, items: Array.from({ length: 8 }, (_, i) => ({ id: String(i % 6 + 1), name: G[(i + s) % 6][0], img: art(460, 215, G[(i + s) % 6][1], G[(i + s) % 6][2], i / 8, ''), price: s === 3 ? 'Coming soon' : '₹ ' + (299 + i * 150), orig: s === 1 ? '₹ ' + (599 + i * 150) : null, discount: s === 1 ? 50 : 0 })) })) }),
    storeSearch: async q => G.filter(g => g[0].toLowerCase().includes(q.toLowerCase())).map((g, i) => ({ id: String(G.indexOf(g) + 1), name: g[0], price: '₹ 499', orig: null, discount: 0 })),
    reviewsFull: async () => ({ list: [{ id: '1', up: true, votes: 2, hours: 4, text: 'Great.' }], summary: { desc: 'Very Positive', pct: 92, total: 1234 } }), reviewsList: async () => [{ id: '1', up: true, votes: 214, hours: 42.5, text: 'Great game. The co-op is brilliant and the soundtrack is lovely.' }, { id: '2', up: false, votes: 31, hours: 3.1, text: 'Performance issues on launch, hopefully patched soon.' }],
    chatPersona: async () => true, hubContent: async () => [], cartGet: async () => ({ ok: true, items: [], total: '' }), cartAdd: async () => ({ ok: true }), cartRemove: async () => ({ ok: true }), freeLicense: async () => ({ ok: true }), wishGet: async () => ({ ok: false, items: [] }), wishSet: async () => ({ ok: true }), redeemKey: async () => ({ ok: false, msg: 'demo' }), accountHistory: async () => ({ ok: true, rows: [], balance: '' }), moreLike: async () => [], profileItems: async () => ({ ok: true, frames: [], avatars: [], backgrounds: [], minibgs: [], equipped: {} }), profileEquip: async () => ({ ok: true }), privacyGet: async () => ({ ok: false, msg: 'demo' }), privacySet: async () => ({ ok: true }), profileContent: async () => [],
    xboxStatus: async () => ({ state: 'out' }), xboxConnect: async () => true, xboxWebConnect: async () => true, xboxCancel: async () => true, xboxSignout: async () => true, xboxFriends: async () => ({ ok: true, friends: [] }), onXbox: () => {},
    storeRecs: async () => ({ signed: false, items: [] }), profileGames: async () => ({ games: [{ id: '730', name: 'Counter-Strike 2', h: 1200, h2: 12 }] }), profileFriends: async () => ({ friends: [] }), profileGet: async () => ({ ok: true, p: { name: 'Player One', summary: 'Hello there' } }), profileSave: async () => ({ ok: true }), profileAvatar: async () => ({ ok: false, cancel: true }),
    dlcList: async ids => ids.slice(0,4).map((d,i) => ({ id: String(d), name: ['Season Pass','Expansion: Frozen Peaks','Cosmetic Pack','Soundtrack Deluxe'][i], img: '', price: '₹ ' + (199+i*100), discount: i===1?25:0 })),
    storeApp: async id => { const i = +id - 1, g = G[i % 6]; return { id, name: g[0], type: 'game', desc: g[3], developers: ['Demo Studio'], publishers: ['Demo Games'], genres: g[4], release: '12 Mar, 2025', free: false, price: { final: '₹ 799', initial: '₹ 1,599', discount: 50 },
      shots: [0, 1, 2, 3].map(k => ({ thumb: art(600, 338, g[1], g[2], k / 4, ''), full: art(1920, 1080, g[1], g[2], k / 4, g[0]) })), trailer: null, metacritic: 87, languages: 'English, Hindi, Japanese', categories: ['Single-player', 'Co-op', 'Controller support'], age: '', notes: 'Mild violence', dlc: 3, storage: '50 GB', reviews: { label: 'Very Positive', pct: 94, total: 12000 }, background: null, movies: [{ name: 'Trailer', thumb: art(600, 338, g[1], g[2], .2, ''), url: 'about:blank' }], editions: [{ name: 'Standard Edition', price: '₹ 799', discount: 0 }, { name: 'Deluxe Edition', price: '₹ 1,299', discount: 0 }] }; },
  });

  Object.assign(A, {
    newsGame: async id => G.slice(0, 1).concat(G.slice(1,3)).map((g, i) => ({ gameId: String(id), gameName: G[(+id - 1) % 6][0], gid: 'g' + id + i, title: ['Patch notes 1.' + (4 + i), 'Developer diary: the new region', 'Community event this weekend'][i], snippet: 'Everything new in this update.', url: '', date: Date.now() - i * 5 * 864e5, image: art(640, 360, G[(+id - 1) % 6][1], G[(+id - 1) % 6][2], i / 3, '') })),
    newsArticle: async (id, gid) => ({ title: 'Patch notes 1.4', date: Date.now() - 864e5, author: 'The Team', image: art(1280, 540, '#ffa53d', '#3a0f0a', .3, ''), url: '', blocks: [
      { t: 'p', v: 'Hello everyone! This update brings a long list of improvements and fixes. Thank you for all your feedback over the last few weeks, it really shaped what you see below.' },
      { t: 'img', v: art(1280, 540, '#34d5c0', '#07263a', .5, 'New region') }, { t: 'h', v: 'New content' },
      { t: 'li', v: 'A brand new region with six new quests and two bosses.' }, { t: 'li', v: 'Photo mode now supports depth of field and film grain.' }, { t: 'li', v: 'Co-op matchmaking is faster and remembers your last squad.' },
      { t: 'h', v: 'Fixes' }, { t: 'p', v: 'Fixed a crash when loading a save from before version 1.2. Fixed the camera clipping through walls in the lighthouse. Improved performance on lower-end GPUs by roughly fifteen percent in crowded scenes.' }, { t: 'p', v: 'Thanks again, and see you in the next one. ' .repeat(6) }] }),
    storeBrowse: async o => ({ total: 120, start: o.start || 0, items: Array.from({ length: 24 }, (_, i) => ({ id: String(i % 6 + 1), name: G[i % 6][0] + (i > 5 ? ' ' + (i + 1) : ''), price: '₹ ' + (199 + i * 50), orig: i % 3 ? null : '₹ ' + (399 + i * 50), discount: i % 3 ? 0 : 50 })) }),
    storeTags: async () => ({ Action: 19, Adventure: 21, RPG: 122, Strategy: 9, Indie: 492, Racing: 699, 'Co-op': 1685, Horror: 1667 }),
    findTrailer: async () => null, openApp: async () => false, padActive: async () => true,
    videos: async () => [], chatOwns: async () => [], xboxProfile: async () => ({ ok: false }), xboxMsgs: async () => ({ ok: true, l: [] }), xboxSend: async () => ({ ok: true }), artFind: async () => null, storageSig: async () => 'C', fsList: async d => ({ ok: true, dir: d || '', parent: d ? '' : null, items: d ? [{ name: 'Movies', path: '/m', dir: true }, { name: 'intro.mp4', path: '/intro.mp4', dir: false, size: 5e6 }] : [{ name: 'Videos', path: '/v', dir: true, kind: 'place' }, { name: 'Drive C:', path: 'C:\\', dir: true, kind: 'drive', free: 1e11, total: 5e11 }] }), startMovie: async () => null, wifiList: async () => ({ ok: true, connected: 'Home WiFi', list: [{ ssid: 'Home WiFi', signal: 82, secure: true, saved: true, connected: true, auth: 'WPA2-Personal' }, { ssid: 'Neighbour', signal: 55, secure: true, saved: false, auth: 'WPA2-Personal' }, { ssid: 'Cafe Free', signal: 30, secure: false, saved: false, auth: 'Open' }] }), wifiConnect: async () => ({ ok: true, msg: 'Connected.' }), wifiForget: async () => ({ ok: true }), wifiDisconnect: async () => ({ ok: true }), btList: async () => ({ ok: true, list: [{ id: 'a', name: 'Wireless Controller', paired: true, connected: true }, { id: 'b', name: 'Headphones', paired: true, connected: false }, { id: 'c', name: 'Keyboard K380', paired: false, connected: false, canPair: true }] }), btPair: async () => ({ ok: true, msg: 'Paired.' }), btUnpair: async () => ({ ok: true }), btConnect: async () => ({ ok: true, msg: 'Connected.' }), artFix: async () => null, dcGuilds: async () => ({ ok: true, v: [{ id: '1', name: 'Cozytown', icon: '' }, { id: '2', name: 'Game Time', icon: '' }] }), dcChannels: async () => ({ ok: true, v: [{ id: 'c1', name: 'general', voice: false, cat: 'Text' }, { id: 'c2', name: 'Lounge', voice: true, cat: 'Voice' }] }), dcDms: async () => ({ ok: true, v: [{ id: 'd1', name: 'Danny', avatar: '' }] }), dcFriends: async () => ({ ok: true, v: [] }), dcOpenDm: async () => ({ ok: true, v: 'd1' }), dcMsgs: async () => ({ ok: true, v: [{ id: '1', me: false, name: 'Danny', avatar: '', text: 'hey!', t: Date.now() - 6e4, img: [], files: [] }] }), dcSend: async () => ({ ok: true }), dcVJoin: async (g, c, n) => ({ ok: true, v: { gid: g, cid: c, name: n, muted: false, deaf: false } }), dcVAct: async () => ({ ok: true, v: {} }), dcVLeave: async () => ({ ok: true }), familyInfo: async () => ({ ok: true, none: true }), friendAdd: async () => ({ ok: true, msg: 'Friend request sent.' }), friendRespond: async () => true, xboxAdd: async () => ({ ok: true, msg: 'Added.' }), batteryHas: async () => true, batteryInfo: async () => ({ level: .62, charging: false }), onDl: () => {}, onSleep: () => {}, onAppClosed: () => {}, onAppShown: () => {}, warmApp: async () => false, onGames: () => {},
    dlList: async () => window.__dl || [], dlLibs: async () => ({ libs: [{ path: 'C:\\Program Files (x86)\\Steam', free: 2.1e11, total: 5e11 }, { path: 'D:\\SteamLibrary', free: 6e11, total: 1e12 }], login: '' }),
    dlAdd: async (id, name, lib) => { (window.__dl = window.__dl || []).push({ id, name, lib, state: 'downloading', progress: 34, bytes: 1.2e10, total: 3.5e10, speed: 4.2e7, msg: 'Downloading' }); return true; },
    chatStatus: async () => window.__chat || { available: true, state: 'out' },
    chatLogin: async (u) => { window.__chat = { available: true, state: 'in', name: u }; return true; }, chatGuard: async () => true, chatLogout: async () => { window.__chat = null; return true; },
    chatHistory: async () => [{ me: false, text: 'Hey, up for a match tonight?', t: 1 }, { me: true, text: 'Sure, give me 10 minutes.', t: 2 }], chatSend: async () => true,
    openWeb: async () => true, onChatState: () => {}, onChatMsg: () => {}, onChatPersona: () => {},
    discordStatus: async () => ({ available: true, state: 'on' }), discordConnect: async () => true, discordDisconnect: async () => true,
    onDiscord: () => {}, onPopup: () => {},
    steamAccounts: async () => [{ steamid: '1', name: 'Player One', account: 'playerone', avatar: null }], chatQR: async () => { window.__chat = { available: true, qrOk: true, state: 'qr', qr: '' }; return true; }, chatQRCancel: async () => true,
    ovClose: async () => true, ovHome: async () => true, ovCloseGame: async () => true, ovStatus: async () => ({ game: 'Hollow Citadel' }), onOv: () => {}, onGuide: () => {},
    dlPause: async () => true, dlResume: async () => true, dlCancel: async () => true, dlAnswer: async () => true, dlLogin: async () => true,
  });
}
