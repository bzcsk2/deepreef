type Letter = "a"|"b"|"c"|"d"|"e"|"f"|"g"|"h"|"i"|"j"|"k"|"l"|"m"|"n"|"o"|"p"|"q"|"r"|"s"|"t"|"u"|"v"|"w"|"x"|"y"|"z";
type Digit = "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9";
type SymbolKey = "`"|"-"|"="|"["|"]"|"\\"|";"|"'"|","|"."|"/"|"!"|"@"|"#"|"$"|"%"|"^"|"&"|"*"|"("|")"|"_"|"+"|"|"|"~"|"{"|"}"|":"|"<"|">"|"?";
type SpecialKey = "escape"|"esc"|"enter"|"return"|"tab"|"space"|"backspace"|"delete"|"insert"|"clear"|"home"|"end"|"pageUp"|"pageDown"|"up"|"down"|"left"|"right"|"f1"|"f2"|"f3"|"f4"|"f5"|"f6"|"f7"|"f8"|"f9"|"f10"|"f11"|"f12";
type BaseKey = Letter | Digit | SymbolKey | SpecialKey;
type ModifierName = "ctrl"|"shift"|"alt"|"super";
type ModifiedKeyId<Key extends string, R extends ModifierName = ModifierName> = { [M in R]: `${M}+${Key}` | `${M}+${ModifiedKeyId<Key, Exclude<R, M>>}` }[R];
export type KeyId = BaseKey | ModifiedKeyId<BaseKey>;

export const Key = {
  escape: "escape", esc: "esc", enter: "enter", return: "return", tab: "tab",
  space: "space", backspace: "backspace", delete: "delete", insert: "insert",
  clear: "clear", home: "home", end: "end", pageUp: "pageUp", pageDown: "pageDown",
  up: "up", down: "down", left: "left", right: "right",
  f1: "f1", f2: "f2", f3: "f3", f4: "f4", f5: "f5", f6: "f6", f7: "f7", f8: "f8", f9: "f9", f10: "f10", f11: "f11", f12: "f12",
  backtick: "`", hyphen: "-", equals: "=", leftbracket: "[", rightbracket: "]", backslash: "\\",
  semicolon: ";", quote: "'", comma: ",", period: ".", slash: "/",
  exclamation: "!", at: "@", hash: "#", dollar: "$", percent: "%", caret: "^", ampersand: "&", asterisk: "*",
  leftparen: "(", rightparen: ")", underscore: "_", plus: "+", pipe: "|", tilde: "~",
  leftbrace: "{", rightbrace: "}", colon: ":", lessthan: "<", greaterthan: ">", question: "?",
  ctrl: <K extends BaseKey>(k: K) => `ctrl+${k}` as const,
  shift: <K extends BaseKey>(k: K) => `shift+${k}` as const,
  alt: <K extends BaseKey>(k: K) => `alt+${k}` as const,
  super: <K extends BaseKey>(k: K) => `super+${k}` as const,
  ctrlShift: <K extends BaseKey>(k: K) => `ctrl+shift+${k}` as const,
  shiftCtrl: <K extends BaseKey>(k: K) => `shift+ctrl+${k}` as const,
  ctrlAlt: <K extends BaseKey>(k: K) => `ctrl+alt+${k}` as const,
  altCtrl: <K extends BaseKey>(k: K) => `alt+ctrl+${k}` as const,
  shiftAlt: <K extends BaseKey>(k: K) => `shift+alt+${k}` as const,
  altShift: <K extends BaseKey>(k: K) => `alt+shift+${k}` as const,
} as const;

let kittyProtocolActive = false;
export function setKittyProtocolActive(v: boolean): void { kittyProtocolActive = v; }
export function isKittyProtocolActive(): boolean { return kittyProtocolActive; }

const KITTY_RELEASE = /^\x1b\[[\d:;]*:3[u~ABCDHF]$/;
const KITTY_REPEAT = /^\x1b\[[\d:;]*:2[u~ABCDHF]$/;
export function isKeyRelease(data: string): boolean { return kittyProtocolActive && KITTY_RELEASE.test(data) && !data.includes("\x1b[200~"); }
export function isKeyRepeat(data: string): boolean { return kittyProtocolActive && KITTY_REPEAT.test(data) && !data.includes("\x1b[200~"); }

const CTRL_MAP: Record<string, string> = {
  "\x00": "ctrl+space", "\x01": "ctrl+a", "\x02": "ctrl+b", "\x03": "ctrl+c",
  "\x04": "ctrl+d", "\x05": "ctrl+e", "\x06": "ctrl+f", "\x07": "ctrl+g",
  "\x08": "ctrl+h", "\x09": "tab", "\x0a": "enter", "\x0b": "ctrl+k",
  "\x0c": "ctrl+l", "\x0d": "enter", "\x0e": "ctrl+n", "\x0f": "ctrl+o",
  "\x10": "ctrl+p", "\x11": "ctrl+q", "\x12": "ctrl+r", "\x13": "ctrl+s",
  "\x14": "ctrl+t", "\x15": "ctrl+u", "\x16": "ctrl+v", "\x17": "ctrl+w",
  "\x18": "ctrl+x", "\x19": "ctrl+y", "\x1a": "ctrl+z",
  "\x1b": "escape", "\x1c": "ctrl+\\", "\x1d": "ctrl+]", "\x1e": "ctrl+^", "\x1f": "ctrl+_",
  "\x7f": "backspace",
};

const CSI_TERM = /^[\x40-\x7e]$/;
const CSI_MAP: Record<string, string> = {
  "A": "up", "B": "down", "C": "right", "D": "left", "H": "home", "F": "end",
  "Z": "shift+tab",
};
const CSI_TILDE: Record<string, string> = {
  "1": "home", "2": "insert", "3": "delete", "4": "end", "5": "pageUp", "6": "pageDown",
  "7": "home", "8": "end",
};
const SS3_MAP: Record<string, string> = {
  "P": "f1", "Q": "f2", "R": "f3", "S": "f4",
};

function parseCSISeq(data: string): string | undefined {
  if (!data.startsWith("\x1b[")) return undefined;
  const inner = data.slice(2);
  const term = inner[inner.length - 1];
  if (!term || !CSI_TERM.test(term)) return undefined;
  const paramStr = inner.slice(0, -1);
  const tildeMatch = paramStr.match(/^(\d+)$/);
  if (tildeMatch && term === "~") {
    return CSI_TILDE[tildeMatch[1]!];
  }
  const semiMatch = paramStr.match(/^(\d+);(\d+)$/);
  if (semiMatch && term === "~") {
    const [, code, mod] = semiMatch;
    if (code === "27") {
      if (mod === "2") return "shift+tab"; if (mod === "5") return "ctrl+tab"; if (mod === "6") return "ctrl+shift+tab";
    }
    if (code === "13") return mod === "2" ? "shift+enter" : undefined;
    if (code === "32") return mod === "2" ? "shift+space" : undefined;
  }
  if (CSI_MAP[term]) {
    const param = paramStr ? Number(paramStr) : undefined;
    if (!param || param === 1) return CSI_MAP[term];
    if (param === 2) return `shift+${CSI_MAP[term]}`;
    if (param === 3) return `alt+${CSI_MAP[term]}`;
    if (param === 4) return `alt+shift+${CSI_MAP[term]}`;
    if (param === 5) return `ctrl+${CSI_MAP[term]}`;
    if (param === 6) return `ctrl+shift+${CSI_MAP[term]}`;
    if (param === 7) return `ctrl+alt+${CSI_MAP[term]}`;
    if (param === 8) return `ctrl+alt+shift+${CSI_MAP[term]}`;
  }
  return undefined;
}

function parseKittyCSIU(data: string): string | undefined {
  const m = data.match(/^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?(?:;([\d:]*))?u$/);
  if (!m) return undefined;
  const cp = Number(m[1]);
  const shifted = m[2] ? Number(m[2]) : undefined;
  const eventType = m[5];
  if (eventType === "3") return undefined;
  const modRaw = m[4] ? Number(m[4]) - 1 : 0;
  const mod = modRaw & ~(64 + 128);
  if (mod & ~(1 | 2 | 4 | 8)) return undefined;
  if (mod === 0 && cp >= 32) return String.fromCodePoint(cp);
  const ch = mod & 1 && shifted ? String.fromCodePoint(shifted) : String.fromCodePoint(cp);
  const parts: string[] = [];
  if (mod & 4) parts.push("ctrl");
  if (mod & 2) parts.push("alt");
  if (mod & 8) parts.push("super");
  if (mod & 1) parts.push("shift");
  parts.push(ch);
  return parts.join("+");
}

function parseSS3(data: string): string | undefined {
  if (!data.startsWith("\x1bO")) return undefined;
  const ch = data[2];
  if (ch && SS3_MAP[ch]) return SS3_MAP[ch];
  return undefined;
}

const CTRL_SYMBOL_REV: Record<string, string> = {
  "space": " ", "\\": "\\", "]": "]", "^": "^", "_": "_",
};

export function matchesKey(data: string, keyId: KeyId): boolean {
  const parsed = parseKey(data);
  if (!parsed) return false;
  if (parsed === keyId) return true;
  if (keyId === "enter" && (parsed === "\x0a" || parsed === "\x0d")) return true;
  if (keyId === "escape" && parsed === "\x1b") return true;
  if (keyId === "tab" && parsed === "\x09") return true;
  if (keyId === "backspace" && (parsed === "\x7f" || parsed === "\x08")) return true;
  if (keyId === "space" && parsed === " ") return true;
  return false;
}

export function parseKey(data: string): string | undefined {
  if (!data) return undefined;
  if (CTRL_MAP[data] !== undefined) return CTRL_MAP[data];
  if (data.length === 1) return data;
  const csi = parseCSISeq(data);
  if (csi) return csi;
  const kitty = parseKittyCSIU(data);
  if (kitty) return kitty;
  const ss3 = parseSS3(data);
  if (ss3) return ss3;
  const mo = data.match(/^\x1b\[27;(\d+);(\d+)~$/);
  if (mo) {
    const mod = Number(mo[1]) - 1;
    const cp = Number(mo[2]);
    if (mod === 0 || mod === 1) return String.fromCodePoint(cp);
    if (mod === 5) return `ctrl+${String.fromCodePoint(cp)}`;
  }
  if (data.startsWith("\x1b") && !data.startsWith("\x1b[")) {
    const rest = data.slice(1);
    if (rest.length === 1 && rest >= "a" && rest <= "z") return `alt+${rest}`;
  }
  return undefined;
}

function hasControlChars(s: string): boolean {
  for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c === 0x7f || (c >= 0x80 && c <= 0x9f)) return true; }
  return false;
}

export function extractPrintableText(data: string): string | undefined {
  const decoded = decodePrintableKey(data);
  if (decoded !== undefined) return decoded;
  if (data.length === 0 || hasControlChars(data)) return undefined;
  return data;
}

export function decodePrintableKey(data: string): string | undefined {
  const csiU = data.match(/^\x1b\[(\d+)(?::(\d+))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?(?:;([\d:]*))?u$/);
  if (csiU) {
    const cp = Number(csiU[1]);
    const modRaw = csiU[4] ? Number(csiU[4]) - 1 : 0;
    const mod = modRaw & ~(64 + 128);
    if (!(mod & ~1) && cp >= 32) return String.fromCodePoint(cp);
    return undefined;
  }
  const mo = data.match(/^\x1b\[27;(\d+);(\d+)~$/);
  if (mo) {
    const mod = Number(mo[1]) - 1;
    const cp = Number(mo[2]);
    if (!(mod & ~1) && cp >= 32) return String.fromCodePoint(cp);
    return undefined;
  }
  return undefined;
}
