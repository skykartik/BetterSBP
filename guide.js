// Reads the controller's Guide / PS / Home button on Windows via XInputGetStateEx (undocumented export #100),
// which the Gamepad API cannot see. Runs one tiny PowerShell process and prints "GUIDE" on each press.
const cp = require('child_process');
const PS = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class XI {
  [StructLayout(LayoutKind.Sequential)] public struct ST { public uint pk; public ushort b; public byte lt; public byte rt; public short lx; public short ly; public short rx; public short ry; }
  [DllImport("xinput1_4.dll", EntryPoint="#100")] public static extern int Ex(int i, out ST s);
}
"@
$p = @{0=$false;1=$false;2=$false;3=$false}
while ($true) {
  for ($i = 0; $i -lt 4; $i++) {
    $s = New-Object XI+ST
    if ([XI]::Ex($i, [ref]$s) -eq 0) {
      $g = (($s.b -band 0x400) -ne 0)
      if ($g -and -not $p[$i]) { [Console]::Out.WriteLine("GUIDE"); [Console]::Out.Flush() }
      $p[$i] = $g
    } else { $p[$i] = $false }
  }
  Start-Sleep -Milliseconds 45
}`;
module.exports = function watchGuide(onPress) {
  if (process.platform !== 'win32') return { stop() {} };
  let ch = null, dead = false, tries = 0;
  const start = () => {
    if (dead) return;
    ch = cp.spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(PS, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    ch.stdout.on('data', d => { if (String(d).includes('GUIDE')) onPress(); });
    ch.on('exit', () => { ch = null; if (!dead && ++tries < 5) setTimeout(start, 3000); });
  };
  start();
  return { stop() { dead = true; try { ch && ch.kill(); } catch {} } };
};
