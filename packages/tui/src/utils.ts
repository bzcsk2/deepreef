const SPACE_BUFFER = " ".repeat(512);

export function padding(n: number): string {
  if (n <= 0) return "";
  if (n <= 512) return SPACE_BUFFER.slice(0, n);
  return " ".repeat(n);
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function getSegmenter(): Intl.Segmenter {
  return segmenter;
}

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\uff00-\uffef\u2e80-\u2eff\u3000-\u303f\uac00-\ud7af\ud800-\udbff]|[\ud800-\udbff][\udc00-\udfff]/;
const TAB_WIDTH = 4;

export function getDefaultTabWidth(): number {
  return TAB_WIDTH;
}

export function getIndentation(file?: string): number {
  return TAB_WIDTH;
}

export function visibleWidth(str: string): number {
  if (!str) return 0;
  let width = 0;
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code === 9) {
      width += TAB_WIDTH;
    } else if (code < 32 || (code >= 0x7f && code <= 0x9f)) {
      continue;
    } else if (CJK_RE.test(ch)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

function wrapWord(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    const wordWidth = visibleWidth(stripAnsi(current + word));
    if (wordWidth > width && current.length > 0) {
      lines.push(current);
      current = word.trimStart();
    } else {
      current += word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export type Ellipsis = 0 | 1;
export const Ellipsis = { Omit: 0 as Ellipsis, Unicode: 1 as Ellipsis };

export function truncateToWidth(
  text: string,
  maxWidth: number,
  ellipsisKind?: Ellipsis | null,
  pad?: boolean | null,
): string {
  const safeWidth = Number.isFinite(maxWidth) ? Math.max(0, Math.trunc(maxWidth)) : 0;
  if (!text || safeWidth <= 0) return "";
  const vw = visibleWidth(text);
  if (vw <= safeWidth) {
    if (pad) {
      const need = safeWidth - vw;
      return text + padding(need);
    }
    return text;
  }
  let result = "";
  let w = 0;
  for (const ch of text) {
    const cw = visibleWidth(ch);
    if (w + cw > safeWidth) {
      const ellipsis = ellipsisKind === Ellipsis.Omit ? "" : "…";
      return result + ellipsis;
    }
    result += ch;
    w += cw;
  }
  return result;
}

export function wrapTextWithAnsi(text: string, width: number): string[] {
  if (!text || width <= 0) return [""];
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const vw = visibleWidth(para);
    if (vw <= width) {
      lines.push(para);
      continue;
    }
    const wrapped = wrapWord(para, width);
    lines.push(...wrapped);
  }
  return lines.length ? lines : [""];
}

export function sliceByColumn(line: string, startCol: number, length: number, strict = false): string {
  const chars = [...line];
  let col = 0;
  let result = "";
  for (const ch of chars) {
    const cw = visibleWidth(ch);
    if (col + cw <= startCol) {
      col += cw;
      continue;
    }
    if (col >= startCol + length) break;
    if (strict && col + cw > startCol + length) break;
    result += ch;
    col += cw;
  }
  return result;
}

export function applyBackgroundToLine(line: string, width: number, bgFn: (text: string) => string): string {
  const vw = visibleWidth(line);
  const need = Math.max(0, width - vw);
  return bgFn(line + padding(need));
}

export function replaceTabs(text: string, file?: string): string {
  return text.replaceAll("\t", " ".repeat(TAB_WIDTH));
}

export type WordNavKind = "whitespace" | "delimiter" | "cjk" | "word" | "other";
function firstCodePointChar(s: string): string { const cp = s.codePointAt(0); return cp !== undefined ? String.fromCodePoint(cp) : ""; }
export function normalizeTerminalOutput(s: string): string { return s; }
export function isWhitespaceChar(ch: string): boolean { const c = ch.codePointAt(0) ?? 0; return c < 128 && (c === 0x20 || (c >= 0x09 && c <= 0x0d)); }
export function isPunctuationChar(ch: string): boolean { const c = ch.codePointAt(0) ?? 0; return c < 128 && "(){}[]<>.,;:'\"!?+-=*/\\|&%^$#@~`".includes(String.fromCodePoint(c)); }

const WORD_RE_WS = /^\p{White_Space}$/u;
const WORD_RE_PUNCT = /^[\p{P}\p{S}]$/u;
const WORD_RE_HAN = /^\p{Script=Han}$/u;
const WORD_RE_HIRA = /^\p{Script=Hiragana}$/u;
const WORD_RE_KATA = /^\p{Script=Katakana}$/u;
const WORD_RE_HANG = /^\p{Script=Hangul}$/u;
const WORD_RE_LETTER = /^[\p{L}\p{N}_]$/u;
const JOINERS = new Set(["'", "’", "-", "‐", "‑"]);

export function getWordNavKind(grapheme: string): WordNavKind {
  if (!grapheme) return "other";
  const ch = firstCodePointChar(grapheme);
  if (!ch) return "other";
  if (WORD_RE_WS.test(ch)) return "whitespace";
  if (WORD_RE_PUNCT.test(ch)) return "delimiter";
  if (WORD_RE_HAN.test(ch) || WORD_RE_HIRA.test(ch) || WORD_RE_KATA.test(ch) || WORD_RE_HANG.test(ch)) return "cjk";
  if (WORD_RE_LETTER.test(ch)) return "word";
  return "other";
}

export function isWordNavJoiner(grapheme: string): boolean {
  return JOINERS.has(firstCodePointChar(grapheme));
}

export function moveWordLeft(text: string, cursor: number): number {
  if (!text || cursor <= 0) return 0;
  let i = Math.min(cursor, text.length);
  const graphemes = [...segmenter.segment(text.slice(0, i))];
  while (graphemes.length > 0 && getWordNavKind(graphemes[graphemes.length - 1]!.segment) === "whitespace") {
    i -= graphemes.pop()!.segment.length;
  }
  if (graphemes.length === 0) return i;
  const kind = getWordNavKind(graphemes[graphemes.length - 1]!.segment);
  if (kind === "delimiter" || kind === "cjk") {
    while (graphemes.length > 0 && getWordNavKind(graphemes[graphemes.length - 1]!.segment) === kind) {
      i -= graphemes.pop()!.segment.length;
    }
    return i;
  }
  if (kind === "word") {
    let hasRightWord = false;
    while (graphemes.length > 0) {
      const g = graphemes[graphemes.length - 1]!.segment;
      const k = getWordNavKind(g);
      if (k === "word") { hasRightWord = true; i -= graphemes.pop()!.segment.length; continue; }
      if (hasRightWord && k === "delimiter" && isWordNavJoiner(g)) {
        const left = graphemes.length >= 2 ? graphemes[graphemes.length - 2]!.segment : "";
        if (getWordNavKind(left) === "word") { i -= graphemes.pop()!.segment.length; continue; }
      }
      break;
    }
    return i;
  }
  i -= graphemes.pop()!.segment.length;
  return Math.max(0, i);
}

export function moveWordRight(text: string, cursor: number): number {
  if (!text) return 0;
  let i = Math.min(cursor, text.length);
  if (i >= text.length) return text.length;
  const iter = segmenter.segment(text.slice(i))[Symbol.iterator]();
  let next = iter.next();
  while (!next.done && getWordNavKind(next.value.segment) === "whitespace") {
    i += next.value.segment.length; next = iter.next();
  }
  if (next.done) return i;
  const k = getWordNavKind(next.value.segment);
  if (k === "delimiter" || k === "cjk") {
    while (!next.done && getWordNavKind(next.value.segment) === k) { i += next.value.segment.length; next = iter.next(); }
    return i;
  }
  if (k === "word") {
    let hasLeftWord = false;
    while (!next.done) {
      const s = next.value.segment; const k2 = getWordNavKind(s);
      if (k2 === "word") { hasLeftWord = true; i += s.length; next = iter.next(); continue; }
      if (hasLeftWord && k2 === "delimiter" && isWordNavJoiner(s)) {
        const la = iter.next();
        if (!la.done && getWordNavKind(la.value.segment) === "word") { i += s.length; next = la; continue; }
      }
      break;
    }
    return i;
  }
  return i + next.value.segment.length;
}
