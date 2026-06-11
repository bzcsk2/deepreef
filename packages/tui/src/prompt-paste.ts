/** OpenCode 参考阈值：packages/opencode/.../prompt/index.tsx */

export const PASTE_SUMMARY_MIN_LINES = 3;
export const PASTE_SUMMARY_MIN_CHARS = 150;

/**
 * 跟踪一次「折叠粘贴」在输入框 display 字符串中的位置。
 * `marker` 为可见占位符（如 `[粘贴 +70 行]`），`text` 为提交时展开的完整内容。
 */
export interface TrackedPaste {
  marker: string;
  text: string;
  start: number;
  end: number;
}

/**
 * 统计文本行数（含首尾行）。
 *
 * @param text - 原始文本
 */
export function countLines(text: string): number {
  if (!text) return 0;
  return (text.match(/\n/g)?.length ?? 0) + 1;
}

/**
 * 规范化粘贴文本（统一换行符）。
 *
 * @param text - 原始粘贴内容
 */
export function normalizePasteText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 是否应对粘贴内容显示折叠占位符。
 * 可通过 `DEEPCODE_PASTE_SUMMARY=0` 关闭。
 *
 * @param text - 规范化后的粘贴文本
 */
export function shouldSummarizePaste(text: string): boolean {
  if (process.env.DEEPCODE_PASTE_SUMMARY === '0') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lineCount = countLines(trimmed);
  return lineCount >= PASTE_SUMMARY_MIN_LINES || trimmed.length > PASTE_SUMMARY_MIN_CHARS;
}

/**
 * 生成折叠占位符文案。
 *
 * @param lineCount - 粘贴内容的行数
 * @param format - i18n 格式化函数
 */
export function formatPasteMarker(lineCount: number, format: (n: number) => string): string {
  return format(lineCount);
}

/**
 * 将 display 输入中的占位符按记录的位置展开为完整粘贴内容（提交前调用）。
 * 按 start 降序替换，避免偏移错乱；仅替换 tracked 区间，不误伤用户手打的相同文案。
 *
 * @param input - 含占位符的 display 字符串
 * @param parts - 跟踪的粘贴块
 */
export function expandTrackedPastes(input: string, parts: readonly TrackedPaste[]): string {
  if (parts.length === 0) return input;
  return parts
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((result, part) => result.slice(0, part.start) + part.text + result.slice(part.end), input);
}

/**
 * 在 `pos` 之后偏移所有粘贴块的起止位置。
 *
 * @param parts - 现有粘贴块
 * @param pos - 编辑位置
 * @param delta - 字符数变化（正=插入，负=删除）
 */
export function shiftPasteParts(parts: readonly TrackedPaste[], pos: number, delta: number): TrackedPaste[] {
  if (delta === 0) return [...parts];
  return parts.map((part) => {
    if (part.start >= pos) {
      return { ...part, start: part.start + delta, end: part.end + delta };
    }
    if (part.end > pos) {
      return { ...part, end: part.end + delta };
    }
    return part;
  });
}

/**
 * 查找光标是否落在某个粘贴占位符内部。
 *
 * @param parts - 粘贴块列表
 * @param cursor - 光标位置（0-based）
 */
export function findPastePartAt(parts: readonly TrackedPaste[], cursor: number): TrackedPaste | undefined {
  return parts.find((part) => cursor > part.start && cursor <= part.end);
}

/**
 * 查找覆盖 `index` 的粘贴块（用于 Backspace 删除整块）。
 *
 * @param parts - 粘贴块列表
 * @param index - 待删除字符左侧的位置
 */
export function findPastePartEndingAt(parts: readonly TrackedPaste[], index: number): TrackedPaste | undefined {
  return parts.find((part) => part.end === index);
}

/**
 * 移除指定粘贴块并更新 input 字符串。
 *
 * @param input - 当前 display 字符串
 * @param parts - 粘贴块列表
 * @param target - 要移除的块
 */
export function removePastePart(
  input: string,
  parts: readonly TrackedPaste[],
  target: TrackedPaste,
): { input: string; parts: TrackedPaste[]; cursor: number } {
  const nextInput = input.slice(0, target.start) + input.slice(target.end);
  const delta = target.end - target.start;
  const nextParts = shiftPasteParts(
    parts.filter((part) => part !== target),
    target.end,
    -delta,
  );
  return { input: nextInput, parts: nextParts, cursor: target.start };
}

/**
 * 在光标处插入文本（plain），并维护粘贴块偏移。
 *
 * @param input - 当前 display 字符串
 * @param parts - 粘贴块列表
 * @param pos - 插入位置
 * @param text - 要插入的文本
 */
export function insertPlainTextAt(
  input: string,
  parts: readonly TrackedPaste[],
  pos: number,
  text: string,
): { input: string; parts: TrackedPaste[]; cursor: number } {
  const nextInput = input.slice(0, pos) + text + input.slice(pos);
  const nextParts = shiftPasteParts(parts, pos, text.length);
  return { input: nextInput, parts: nextParts, cursor: pos + text.length };
}

/**
 * 在光标处插入折叠粘贴：display 只显示 marker，完整内容存入 parts。
 *
 * @param input - 当前 display 字符串
 * @param parts - 已有粘贴块
 * @param pos - 插入位置
 * @param fullText - 完整粘贴内容
 * @param marker - 可见占位符
 */
export function insertSummarizedPasteAt(
  input: string,
  parts: readonly TrackedPaste[],
  pos: number,
  fullText: string,
  marker: string,
): { input: string; parts: TrackedPaste[]; cursor: number } {
  const nextInput = input.slice(0, pos) + marker + input.slice(pos);
  const delta = marker.length;
  const shifted = shiftPasteParts(parts, pos, delta);
  const tracked: TrackedPaste = { marker, text: fullText, start: pos, end: pos + marker.length };
  return {
    input: nextInput,
    parts: [...shifted, tracked].sort((a, b) => a.start - b.start),
    cursor: pos + marker.length,
  };
}
