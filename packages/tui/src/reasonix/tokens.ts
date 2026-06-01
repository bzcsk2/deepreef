/** Theme tokens adapted from Reasonix for deepicode.
 *  Colors are cast to `any` because @deepicode/ink's type system expects
 *  Color | keyof Theme, but hex strings work at runtime. */

export interface ThemeTokens {
  fg: { strong: string; body: string; sub: string; meta: string; faint: string };
  tone: { brand: string; accent: string; ok: string; warn: string; err: string; info: string };
  surface: { bg: string; bgInput: string; bgCode: string; bgElev: string };
}

const dark: ThemeTokens = {
  // Cool refined palette — cold white, blue-grey neutrals, muted tones for production terminal UI
  fg: { strong: '#e8eaf0', body: '#cfd3dc', sub: '#9ca3af', meta: '#7b8493', faint: '#535b68' },
  tone: { brand: '#7dd3fc', accent: '#d38adf', ok: '#7ee787', warn: '#e5c07b', err: '#ff6b7a', info: '#61afef' },
  surface: { bg: '#111318', bgInput: '#161922', bgCode: '#0b0d12', bgElev: '#1b1f2a' },
};

let activeTheme: ThemeTokens = dark;

export function setActiveTheme(theme: ThemeTokens): void { activeTheme = theme; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function proxyTokens(select: (t: ThemeTokens) => any): any {
  const target = select(dark);
  return new Proxy(target, {
    get: (_, prop: string | symbol) => select(activeTheme)[prop as string],
  });
}

export const FG: any = proxyTokens(t => t.fg);
export const TONE: any = proxyTokens(t => t.tone);
export const SURFACE: any = proxyTokens(t => t.surface);
