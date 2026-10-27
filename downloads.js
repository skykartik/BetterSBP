// In-app game downloads using Valve's SteamCMD (downloaded automatically on first use).
// No Steam client window is needed to download. Launching a game afterwards still goes through Steam.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const steam = require('./steam');

module.exports = function createDownloads({ getPass, onPass, app, net, getRoot, getCfg, saveCfg, notify, onInstalled }) {
  const items = new Map();            // id -> item
  let proc = null, cur = null;        // one download at a time, like Steam
  let cmdPath = null;
  const WIN = process.platform === 'win32';
  const dirOf = () => { const d = path.join(app.getPath('userData'), 'steamcmd'); fs.mkdirSync(d, { recursive: true }); return d; };
  const pub = i => ({ id: i.id, name: i.name, lib: i.lib, state: i.state, progress: i.progress, bytes: i.bytes, total: i.total, speed: i.speed, msg: i.msg, prompt: i.prompt || null });

  let pushT = null;
  function push(now) {
    if (now) { clearTimeout(pushT); pushT = null; notify('dl:update', [...items.values()].map(pub)); return; }
    if (pushT) return; pushT = setTimeout(() => { pushT = null; notify('dl:update', [...items.values()].map(pub)); }, 400);
  }
  function persist() {
    const cfg = getCfg();
    cfg.downloads = [...items.values()].filter(i => i.state !== 'done').map(i => ({ id: i.id, name: i.name, lib: i.lib, state: i.state === 'downloading' || i.state === 'starting' ? 'paused' : i.state, progress: i.progress, bytes: i.bytes, total: i.total }));
    saveCfg();
  }
  for (const d of (getCfg().downloads || [])) items.set(d.id, { ...d, speed: 0, msg: d.state === 'paused' ? 'Paused' : 'Waiting', state: d.state === 'queued' ? 'queued' : 'paused' });

  async function ensureCmd() {
    if (cmdPath && fs.existsSync(cmdPath)) return cmdPath;
    const dir = dirOf(), exe = path.join(dir, WIN ? 'steamcmd.exe' : 'steamcmd.sh');
    if (fs.existsSync(exe)) return (cmdPath = exe);
    if (!WIN) {
      try { cp.execFileSync('steamcmd', ['+quit'], { timeout: 20000, stdio: 'ignore' }); return (cmdPath = 'steamcmd'); } catch { throw new Error('SteamCMD is not installed (Windows downloads it automatically).'); }
    }
    const r = await net.fetch('https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip');
    if (!r.ok) throw new Error('Could not download SteamCMD (' + r.status + ').');
    const zip = path.join(dir, 'steamcmd.zip'); fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    cp.execFileSync('tar', ['-xf', zip, '-C', dir], { timeout: 60000, windowsHide: true });
    try { fs.unlinkSync(zip); } catch {}
    if (!fs.existsSync(exe)) throw new Error('SteamCMD did not unpack correctly.');
    return (cmdPath = exe);
  }
  // SteamCMD updates itself the very first time it runs (and may exit while doing so), so do that once up front and wait for it.
  let primed = false;
  async function prime(cmd, i) {
    if (primed || (getCfg().steamcmdReady && fs.existsSync(path.join(path.dirname(cmd), 'package')))) { primed = true; return; }
    i.msg = 'Setting up SteamCMD (first time only)…'; push(true);
    await new Promise(res => { let p; try { p = cp.spawn(cmd, ['+quit'], { cwd: path.dirname(cmd), windowsHide: true }); } catch { return res(); } const t = setTimeout(() => { try { p.kill(); } catch {} res(); }, 240000); p.stdout.on('data', () => {}); p.on('error', () => { clearTimeout(t); res(); }); p.on('close', () => { clearTimeout(t); res(); }); });
    primed = true; const c = getCfg(); c.steamcmdReady = true; saveCfg();
  }
  // Progress straight from the manifest SteamCMD keeps in the install folder, so the bar moves even when SteamCMD's console output is buffered.
  function watchManifest(i) {
    const f = path.join(tmpDir(i), 'steamapps', 'appmanifest_' + i.id + '.acf'); let lastB = 0, lastT = Date.now();
    i.mt = setInterval(() => {
      if (cur !== i || !proc) return clearInterval(i.mt);
      try {
        const a = steam.ci(steam.parseVdf(fs.readFileSync(f, 'utf8')), 'AppState') || {};
        const got = parseInt(steam.ci(a, 'BytesDownloaded') || '0', 10), tot = parseInt(steam.ci(a, 'BytesToDownload') || '0', 10);
        if (tot > 0 && (got > i.bytes || i.state === 'starting')) { i.state = 'downloading'; i.bytes = got; i.total = tot; i.progress = Math.min(99.9, got / tot * 100); i.msg = 'Downloading'; const now = Date.now(); if (now - lastT >= 2000) { i.speed = Math.max(0, (got - lastB) / ((now - lastT) / 1000)); lastB = got; lastT = now; } push(); }
      } catch {}
    }, 2000);
  }

  const tmpDir = i => path.join(i.lib, 'steamapps', 'common', '__dash_' + i.id);

  function finish(i, ok, msg) {
    proc = null; cur = null; i.speed = 0; i.prompt = null;
    if (ok) {
      i.state = 'done'; i.progress = 100; i.msg = 'Installed';
      try { adopt(i); } catch (e) { i.state = 'error'; i.msg = 'Downloaded, but could not register with Steam: ' + e.message; }
      if (i.state === 'done') onInstalled && onInstalled(i);
    } else if (i.state !== 'paused' && i.state !== 'canceled' && i.state !== 'login') { i.state = 'error'; i.msg = msg || 'Failed'; }
    persist(); push(true); next();
  }

  // Move the finished download into Steam's normal layout so Steam sees the game as installed.
  function adopt(i) {
    const tmp = tmpDir(i), man = path.join(tmp, 'steamapps', 'appmanifest_' + i.id + '.acf');
    if (!fs.existsSync(man)) throw new Error('manifest not found');
    const txt = fs.readFileSync(man, 'utf8');
    const a = steam.ci(steam.parseVdf(txt), 'AppState') || {};
    const inst = steam.ci(a, 'installdir') || ('app_' + i.id);
    const dest = path.join(i.lib, 'steamapps', 'common', inst);
    if (fs.existsSync(dest) && dest !== tmp) fs.rmSync(dest, { recursive: true, force: true });
    if (dest !== tmp) fs.renameSync(tmp, dest);
    try { fs.rmSync(path.join(dest, 'steamapps'), { recursive: true, force: true }); } catch {}
    fs.writeFileSync(path.join(i.lib, 'steamapps', 'appmanifest_' + i.id + '.acf'), txt);
  }

  function next() {
    if (proc) return;
    const n = [...items.values()].find(i => i.state === 'queued');
    if (n) run(n);
  }

  async function run(i) {
    i.state = 'starting'; i.msg = 'Preparing SteamCMD…'; i.speed = 0; push(true);
    let cmd;
    try { cmd = await ensureCmd(); } catch (e) { i.state = 'error'; i.msg = e.message; persist(); push(true); return next(); }
    const cfg = getCfg(), user = cfg.steamLogin;
    try { await prime(cmd, i); } catch {}
    if (!user) { i.state = 'login'; i.msg = 'Enter your Steam account name to download.'; i.prompt = { kind: 'user' }; push(true); return; }
    const pw = getPass && getPass(); if (pw) i.sentPass = true;
    const args = ['+@ShutdownOnFailedCommand', '1', '+@NoPromptForPassword', pw ? '1' : '0', '+force_install_dir', tmpDir(i), '+login', user].concat(pw ? [pw] : [], ['+app_update', i.id, 'validate', '+quit']);
    try { fs.mkdirSync(tmpDir(i), { recursive: true }); } catch {}
    cur = i; i.log = '';
    proc = cp.spawn(cmd, args, { cwd: path.dirname(cmd), windowsHide: true }); watchManifest(i);
    let buf = '', lastB = i.bytes || 0, lastT = Date.now();
    const onText = t => {
      buf += t.replace(/\r/g, '\n'); i.log = (i.log + t).slice(-4000);
      const lines = buf.split('\n'); buf = lines.pop();
      const tail = (buf + lines.slice(-1)).toLowerCase();
      for (const ln of lines) parse(ln);
      // prompts arrive without a trailing newline
      const all = buf.toLowerCase();
      if (/password:\s*$/.test(all)) ask(i, 'password');
      else if (/steam guard code:\s*$|two-factor code:\s*$|enter the current code|please confirm the login/i.test(all + ' ' + tail) && /code/.test(all)) ask(i, 'guard');
    };
    const parse = ln => {
      let m;
      if ((m = /Update state \(0x([0-9a-f]+)\) ([^,]+), progress: ([\d.]+) \((\d+) \/ (\d+)\)/i.exec(ln))) {
        const st = m[2].toLowerCase(); i.state = 'downloading'; i.progress = parseFloat(m[3]); i.bytes = +m[4]; i.total = +m[5];
        i.msg = st.includes('verif') ? 'Verifying…' : st.includes('prealloc') ? 'Allocating disk space…' : st.includes('commit') ? 'Finishing…' : 'Downloading';
        const now = Date.now();
        if (now - lastT >= 1000) { i.speed = Math.max(0, (i.bytes - lastB) / ((now - lastT) / 1000)); lastB = i.bytes; lastT = now; }
        push();
      } else if (/Logging in user/i.test(ln)) { i.msg = 'Signing in…'; push(); clearTimeout(i.wd); i.wd = setTimeout(() => { if (cur === i && proc && i.state === 'starting' && !i.prompt) ask(i, i.sentPass ? 'guard' : 'password'); }, 20000); }
      else if (/Logged in OK|Waiting for user info/i.test(ln)) { i.msg = 'Signed in'; clearTimeout(i.wd); push(); }
      else if (/Success! App .* fully installed|Success! App .* already up to date/i.test(ln)) i.ok = true;
      else if (/ERROR! Failed to install app .*\((.+)\)/i.test(ln)) i.err = /ERROR! Failed to install app .*\((.+)\)/i.exec(ln)[1];
      else if (/FAILED \((.+)\)/i.test(ln) && /login/i.test(ln)) i.err = 'Login failed: ' + /\((.+)\)/.exec(ln)[1];
      else if (/Invalid Password|Login Failure/i.test(ln)) i.err = ln.trim();
    };
    // SteamCMD does not always flush its "Password:" prompt through a pipe. If nothing has happened for a while, ask for the password ourselves.
    clearTimeout(i.wd); i.wd = setTimeout(() => { if (cur === i && proc && i.state === 'starting' && !i.prompt && !i.sentPass) ask(i, 'password'); else if (cur === i && proc && i.state === 'starting' && !i.prompt) ask(i, 'guard'); }, 30000);
    proc.stdout.on('data', d => onText(d.toString()));
    proc.stderr.on('data', d => onText(d.toString()));
    proc.on('error', e => finish(i, false, 'Could not start SteamCMD: ' + e.message));
    proc.on('close', code => {
      if (i.state === 'paused' || i.state === 'canceled' || i.state === 'login') { proc = null; cur = null; persist(); push(true); return next(); }
      if (i.ok || code === 0 && !i.err) finish(i, true);
      else finish(i, false, i.err || ((String(i.log || '').trim().split('\n').filter(Boolean).pop() || '').slice(0, 140) || 'SteamCMD stopped (code ' + code + ').'));
      clearInterval(i.mt);
    });
  }

  function ask(i, kind) {
    if (i.prompt && i.prompt.kind === kind) return;
    if (kind === 'password' && getPass && getPass() && !i.sentPass) { i.sentPass = true; try { proc.stdin.write(getPass() + '\n'); i.msg = 'Signing in…'; push(true); return; } catch {} }
    i.prompt = { kind }; i.msg = kind === 'password' ? 'Steam password needed' : 'Steam Guard code needed'; push(true);
  }

  return {
    list: () => [...items.values()].map(pub),
    add(id, name, lib) {
      id = String(id);
      const ex = items.get(id);
      if (ex && ex.state !== 'done' && ex.state !== 'error' && ex.state !== 'canceled') return pub(ex);
      const i = { id, name, lib, state: 'queued', progress: 0, bytes: 0, total: 0, speed: 0, msg: 'Waiting' };
      items.set(id, i); persist(); push(true); next(); return pub(i);
    },
    pause(id) { const i = items.get(String(id)); if (!i) return; if (i === cur && proc) { i.state = 'paused'; i.msg = 'Paused'; try { proc.kill(); } catch {} } else if (i.state === 'queued' || i.state === 'login') { i.state = 'paused'; i.msg = 'Paused'; i.prompt = null; } persist(); push(true); },
    resume(id) { const i = items.get(String(id)); if (!i) return; if (['paused', 'error', 'login', 'canceled'].includes(i.state)) { i.state = 'queued'; i.msg = 'Waiting'; i.err = null; i.ok = false; i.prompt = null; persist(); push(true); next(); } },
    cancel(id, wipe) {
      const i = items.get(String(id)); if (!i) return;
      const was = i === cur && proc; i.state = 'canceled';
      if (was) try { proc.kill(); } catch {}
      items.delete(i.id);
      const rm = () => { if (wipe) { try { fs.rmSync(tmpDir(i), { recursive: true, force: true }); } catch {} } };
      was ? setTimeout(rm, 1500) : rm(); persist(); push(true);
    },
    // answer a prompt coming from SteamCMD
    answer(id, kind, value) {
      const i = items.get(String(id)); if (!i) return;
      if (kind === 'user') { const c = getCfg(); c.steamLogin = String(value || '').trim(); saveCfg(); i.prompt = null; i.state = 'queued'; i.msg = 'Waiting'; push(true); next(); return; }
      if (kind === 'password' && onPass) onPass(String(value));
      if (proc && cur === i) { try { proc.stdin.write(String(value) + '\n'); } catch {} i.prompt = null; i.msg = 'Signing in…'; push(true); }
    },
    setLogin(u) { const c = getCfg(); c.steamLogin = String(u || '').trim(); saveCfg(); },
    stopAll() { if (proc) { const i = cur; if (i) i.state = 'paused'; try { proc.kill(); } catch {} } },
  };
};
