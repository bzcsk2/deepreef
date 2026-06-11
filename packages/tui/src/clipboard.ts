import { execFile } from 'node:child_process';

/**
 * 尝试从系统剪贴板读取文本。
 * macOS: pbpaste；Windows: PowerShell Get-Clipboard；Linux: wl-paste / xclip / xsel。
 *
 * @returns 剪贴板文本，失败时返回 null
 */
export async function tryReadClipboard(): Promise<string | null> {
  const platform = process.platform;
  const cmds: Array<{ bin: string; args: string[] }> = [];
  if (platform === 'darwin') {
    cmds.push({ bin: 'pbpaste', args: [] });
  } else if (platform === 'win32') {
    cmds.push({ bin: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard'] });
  } else {
    cmds.push({ bin: 'wl-paste', args: [] });
    cmds.push({ bin: 'xclip', args: ['-o', '-selection', 'clipboard'] });
    cmds.push({ bin: 'xsel', args: ['--clipboard', '--output'] });
  }
  for (const { bin, args } of cmds) {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        execFile(bin, args, { encoding: 'utf8', timeout: 500 }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
      if (out) return out.replace(/\n$/, '');
    } catch {
      continue;
    }
  }
  return null;
}
