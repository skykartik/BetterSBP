// Wi-Fi and Bluetooth control for betterSBP's own screens (Windows). Wi-Fi uses `netsh wlan`; Bluetooth uses the Windows runtime through PowerShell.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const WIN = process.platform === 'win32';
const run = (cmd, args, ms, env) => new Promise(res => cp.execFile(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: ms || 15000, env: env ? { ...process.env, ...env } : process.env, maxBuffer: 4e6 }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') })));
const xml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// ------------------------------------------------------------------ Wi-Fi
async function wifiList() {
  if (!WIN) return { ok: false, msg: 'Wi-Fi control works on Windows.' };
  const [nets, prof, cur] = await Promise.all([run('netsh', ['wlan', 'show', 'networks', 'mode=bssid']), run('netsh', ['wlan', 'show', 'profiles']), run('netsh', ['wlan', 'show', 'interfaces'])]);
  if (!nets.ok && /not running|no wireless/i.test(nets.out + nets.err)) return { ok: false, msg: 'No Wi-Fi adapter found (or Wi-Fi is turned off in Windows).' };
  const saved = new Set((prof.out.match(/:\s*(.+)$/gm) || []).map(l => l.replace(/^:\s*/, '').trim()).filter(Boolean));
  const ci = (cur.out.match(/^\s*SSID\s*:\s*(.+)$/m) || [])[1], connected = ci ? ci.trim() : '';
  const list = []; let c = null;
  for (const raw of nets.out.split(/\r?\n/)) {
    const m = /^SSID\s+\d+\s*:\s*(.*)$/.exec(raw.trim());
    if (m) { c = { ssid: m[1].trim(), signal: 0, auth: '', secure: true }; if (c.ssid) list.push(c); else c = null; continue; }
    if (!c) continue; const t = raw.trim();
    const s = /^Signal\s*:\s*(\d+)%/i.exec(t) || (/BSSID/i.test(t) ? null : /^[^:]+:\s*(\d+)%$/.exec(t)); if (s) c.signal = Math.max(c.signal, +s[1]);
    if (!c.auth && /^[^:]+:\s*(Open|WPA3|WPA2|WPA|WEP|OWE)/i.test(t)) { c.auth = t.replace(/^[^:]+:\s*/, ''); c.secure = !/^Open/i.test(c.auth); }
  }
  const seen = new Map(); for (const n of list) { const o = seen.get(n.ssid); if (!o || n.signal > o.signal) seen.set(n.ssid, n); }
  const out = [...seen.values()].map(n => ({ ...n, saved: saved.has(n.ssid), connected: n.ssid === connected })).sort((a, b) => (b.connected - a.connected) || (b.saved - a.saved) || b.signal - a.signal);
  if (connected && !out.find(n => n.connected)) out.unshift({ ssid: connected, signal: +((cur.out.match(/Signal\s*:\s*(\d+)%/i) || [])[1] || 0), auth: '', secure: true, saved: true, connected: true });
  return { ok: true, list: out, connected };
}
async function wifiConnect(ssid, password, auth) {
  if (!WIN) return { ok: false, msg: 'Wi-Fi control works on Windows.' };
  ssid = String(ssid || ''); if (!ssid) return { ok: false, msg: 'No network chosen.' };
  const prof = await run('netsh', ['wlan', 'show', 'profiles']);
  const have = (prof.out.match(/:\s*(.+)$/gm) || []).some(l => l.replace(/^:\s*/, '').trim() === ssid);
  if (password || !have) {
    const a = String(auth || ''), open = /^open/i.test(a) || (!a && !password), ent = /enterprise/i.test(a);
    if (ent) return { ok: false, msg: 'Work / school (Enterprise) networks must be set up in Windows once.' };
    const al = open ? 'open' : /WPA3/i.test(a) ? 'WPA3SAE' : /WPA-Personal|^WPA$/i.test(a) ? 'WPAPSK' : /WEP/i.test(a) ? 'open' : 'WPA2PSK', en = open ? 'none' : 'AES';
    const x = `<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${xml(ssid)}</name><SSIDConfig><SSID><name>${xml(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>${al}</authentication><encryption>${en}</encryption><useOneX>false</useOneX></authEncryption>${open ? '' : `<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${xml(password || '')}</keyMaterial></sharedKey>`}</security></MSM></WLANProfile>`;
    const f = path.join(os.tmpdir(), 'bsbp-wifi-' + process.pid + '.xml');
    try { fs.writeFileSync(f, x, { mode: 0o600 }); const r = await run('netsh', ['wlan', 'add', 'profile', 'filename=' + f, 'user=current']); if (!r.ok) return { ok: false, msg: 'Windows did not accept this network (' + (r.out || r.err).trim().slice(0, 80) + ').' }; }
    finally { try { fs.rmSync(f, { force: true }); } catch {} }
  }
  const c = await run('netsh', ['wlan', 'connect', 'name=' + ssid, 'ssid=' + ssid], 20000);
  if (!c.ok) return { ok: false, msg: (c.out || c.err).trim().slice(0, 100) || 'Could not connect.' };
  for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 1000)); const l = await wifiList(); if (l.ok && l.connected === ssid) return { ok: true, msg: 'Connected to ' + ssid + '.' }; }
  return { ok: false, msg: 'Could not connect. Check the password.', badPass: true };
}
const wifiForget = async ssid => { const r = await run('netsh', ['wlan', 'delete', 'profile', 'name=' + String(ssid)]); return { ok: r.ok, msg: r.ok ? 'Forgot ' + ssid + '.' : 'Could not forget it.' }; };
const wifiDisconnect = async () => { const r = await run('netsh', ['wlan', 'disconnect']); return { ok: r.ok }; };

// ------------------------------------------------------------------ Bluetooth
const BT_HEAD = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime]
$null=[Windows.Devices.Enumeration.DevicePairingResult,Windows.Devices.Enumeration,ContentType=WindowsRuntime]
$null=[Windows.Devices.Bluetooth.BluetoothDevice,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'})[0]
function Await($op,$t){$k=$asTask.MakeGenericMethod($t).Invoke($null,@($op));$null=$k.Wait(25000);$k.Result}
$props=[string[]]@('System.Devices.Aep.IsPaired','System.Devices.Aep.IsConnected','System.Devices.Aep.CanPair')
$kind=[Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint
$DI=[Windows.Devices.Enumeration.DeviceInformation]`;
const btRun = (body, env, ms) => run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', BT_HEAD + '\n' + body], ms || 40000, env);
async function btList() {
  if (!WIN) return { ok: false, msg: 'Bluetooth control works on Windows.' };
  const r = await btRun(`$out=@(); foreach($sel in @('System.Devices.Aep.ProtocolId:="{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}"','System.Devices.Aep.ProtocolId:="{bb7bb05e-5972-42b5-94fc-76eaa7084d49}"')){ try{ $c=Await ($DI::FindAllAsync($sel,$props,$kind)) ([Windows.Devices.Enumeration.DeviceInformationCollection]); foreach($d in $c){ if($d.Name){ $out+=[pscustomobject]@{id=$d.Id;name=$d.Name;paired=[bool]$d.Pairing.IsPaired;connected=[bool]$d.Properties['System.Devices.Aep.IsConnected'];canPair=[bool]$d.Pairing.CanPair} } } }catch{} }
$out | ConvertTo-Json -Compress`);
  if (!r.ok && !r.out.trim()) return { ok: false, msg: 'Could not read Bluetooth devices. Is Bluetooth turned on in Windows?' };
  let j = []; try { j = JSON.parse(r.out.trim() || '[]'); } catch {} if (!Array.isArray(j)) j = [j];
  const seen = new Map(); j.filter(d => d && d.id).forEach(d => { const k = d.name + '|' + d.paired; if (!seen.has(k) || d.connected) seen.set(k, d); });
  return { ok: true, list: [...seen.values()].sort((a, b) => (b.connected - a.connected) || (b.paired - a.paired) || a.name.localeCompare(b.name)) };
}
async function btPair(id) {
  const r = await btRun(`$d=Await ($DI::CreateFromIdAsync($env:BT_ID,$props,$kind)) ([Windows.Devices.Enumeration.DeviceInformation]); $p=Await ($d.Pairing.PairAsync()) ([Windows.Devices.Enumeration.DevicePairingResult]); $p.Status.ToString()`, { BT_ID: id }, 60000);
  const s = r.out.trim().split(/\r?\n/).pop();
  return /^(Paired|AlreadyPaired)$/.test(s) ? { ok: true, msg: 'Paired.' } : { ok: false, msg: s ? 'Pairing did not finish (' + s + '). Put the device in pairing mode and try again.' : 'Pairing failed.' };
}
async function btUnpair(id) {
  const r = await btRun(`$d=Await ($DI::CreateFromIdAsync($env:BT_ID,$props,$kind)) ([Windows.Devices.Enumeration.DeviceInformation]); $p=Await ($d.Pairing.UnpairAsync()) ([Windows.Devices.Enumeration.DeviceUnpairingResult]); $p.Status.ToString()`.replace('([Windows.Devices.Enumeration.DeviceUnpairingResult])', '([Windows.Devices.Enumeration.DeviceUnpairingResult,Windows.Devices.Enumeration,ContentType=WindowsRuntime])'), { BT_ID: id }, 40000);
  return /Unpaired|AlreadyUnpaired/.test(r.out) ? { ok: true, msg: 'Removed.' } : { ok: false, msg: 'Could not remove it.' };
}
async function btConnect(id) {
  const r = await btRun(`$b=Await ([Windows.Devices.Bluetooth.BluetoothDevice]::FromIdAsync($env:BT_ID)) ([Windows.Devices.Bluetooth.BluetoothDevice]); if($b){ try{ $null=Await ($b.GetRfcommServicesAsync()) ([Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceServicesResult,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]) }catch{}; $b.ConnectionStatus.ToString() }`, { BT_ID: id }, 40000);
  return /Connected/.test(r.out) ? { ok: true, msg: 'Connected.' } : { ok: true, msg: 'Asked Windows to connect. Turn the device on and wait a few seconds.' };
}
module.exports = { wifiList, wifiConnect, wifiForget, wifiDisconnect, btList, btPair, btUnpair, btConnect };
