/**
 * TTY 下默认启用 Alternate Screen，减少 main-buffer full reset 导致的闪屏。
 * `DEEPCODE_NO_FLICKER=0` 显式关闭；`=1` 强制开启（非 TTY 亦生效）。
 */
export function isFullscreenEnvEnabled(): boolean {
  if (process.env.DEEPCODE_NO_FLICKER === '0') return false;
  if (process.env.DEEPCODE_NO_FLICKER === '1') return true;
  return Boolean(process.stdin.isTTY);
}

/**
 * 是否启用鼠标跟踪（wheel / click / drag）。
 * 默认关闭（返回 false），以便终端原生支持文本选取。
 * 仅当显式设置 DEEPCODE_ENABLE_MOUSE=1 时才开启。
 */
export function isMouseTrackingEnabled(): boolean {
  return process.env.DEEPCODE_ENABLE_MOUSE === '1';
}

export function isFullscreenActive(): boolean {
  return isFullscreenEnvEnabled();
}
