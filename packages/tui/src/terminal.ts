import { setKittyProtocolActive } from "./keys";
import { StdinBuffer } from "./stdin-buffer";

export type TerminalAppearance = "dark" | "light";

export interface Terminal {
  start(onInput: (data: string) => void, onResize: () => void): void;
  stop(): void;
  drainInput(maxMs?: number, idleMs?: number): Promise<void>;
  write(data: string): void;
  get columns(): number;
  get rows(): number;
  get kittyProtocolActive(): boolean;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
  setTitle(title: string): void;
  setProgress(active: boolean): void;
  onAppearanceChange(cb: (a: TerminalAppearance) => void): void;
  get appearance(): TerminalAppearance | undefined;
}

let activeTerminal: ProcessTerminal | null = null;
let terminalEverStarted = false;

export function emergencyTerminalRestore(): void {
  try {
    const t = activeTerminal;
    if (t) { t.stop(); t.showCursor(); }
    else if (terminalEverStarted) {
      process.stdout.write("\x1b[?2004l\x1b[?2031l\x1b[<u\x1b[>4;0m\x1b[?25h");
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    }
  } catch {}
}

export class ProcessTerminal implements Terminal {
  #wasRaw = false; #inputHandler?: (d: string) => void; #resizeHandler?: () => void;
  #kittyActive = false; #modActive = false; #modTimer?: ReturnType<typeof setTimeout>;
  #stdinBuf?: StdinBuffer; #stdinDataHandler?: (d: string) => void; #dead = false;
  #appearanceCbs: Array<(a: TerminalAppearance) => void> = []; #appearance?: TerminalAppearance;
  #osc11Buf = ""; #osc11Pending = false; #da1Owners: string[] = [];
  #pollTimer?: ReturnType<typeof setInterval>; #debounceTimer?: ReturnType<typeof setTimeout>;

  get kittyProtocolActive(): boolean { return this.#kittyActive; }
  get appearance(): TerminalAppearance | undefined { return this.#appearance; }
  onAppearanceChange(cb: (a: TerminalAppearance) => void): void { this.#appearanceCbs.push(cb); }

  start(onInput: (d: string) => void, onResize: () => void): void {
    this.#inputHandler = onInput; this.#resizeHandler = onResize;
    activeTerminal = this; terminalEverStarted = true;
    this.#wasRaw = process.stdin.isRaw || false;
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8"); process.stdin.resume();
    this.#safeWrite("\x1b[?2004h");
    process.stdout.on("resize", this.#resizeHandler);
    if (process.platform !== "win32") process.kill(process.pid, "SIGWINCH");
    this.#setupStdinBuffer();
    this.#da1Owners.push("keyboard");
    this.#safeWrite("\x1b[?u\x1b[c");
    this.#modTimer = setTimeout(() => {
      this.#modTimer = undefined;
      if (this.#kittyActive || this.#modActive) return;
      this.#safeWrite("\x1b[>4;2m"); this.#modActive = true;
    }, 150);
    this.#queryBg();
    this.#safeWrite("\x1b[?2031h");
    this.#pollTimer = setInterval(() => { if (this.#dead) { this.#stopPoll(); return; } this.#queryBg(); }, 2000);
    this.#pollTimer.unref();
  }

  #setupStdinBuffer(): void {
    this.#stdinBuf = new StdinBuffer({ timeout: 10 });
    const kittyResp = /^\x1b\[\?(\d+)u$/;
    const da1Resp = /^\x1b\[\?[\d;]*c$/;
    this.#stdinBuf.on("data", (seq: string) => {
      if (da1Resp.test(seq) && this.#da1Owners.length > 0) {
        this.#da1Owners.shift();
        if (this.#osc11Pending) { this.#osc11Pending = false; this.#osc11Buf = ""; }
        return;
      }
      const km = seq.match(kittyResp);
      if (km && !this.#modActive) {
        if (this.#modTimer) { clearTimeout(this.#modTimer); this.#modTimer = undefined; }
        this.#kittyActive = true; setKittyProtocolActive(true);
        this.#safeWrite(N(km[1]!) >= 3 ? "\x1b[>7u" : "\x1b[>1u");
        return;
      }
      if (this.#osc11Pending && (this.#osc11Buf || seq.startsWith("\x1b]11;"))) {
        const osc11 = /^\x1b\]11;rgba?:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})(?:\x07|\x1b\\)$/;
        if (this.#osc11Buf && seq.startsWith("\x1b") && seq !== "\x1b\\") { this.#osc11Buf = ""; }
        else { this.#osc11Buf += seq; const m2 = this.#osc11Buf.match(osc11); if (m2) { this.#osc11Pending = false; this.#osc11Buf = ""; this.#handleOsc11(m2[1]!, m2[2]!, m2[3]!); } return; }
      }
      const app = seq.match(/^\x1b\[\?997;([12])n$/);
      if (app) {
        this.#stopPoll();
        if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
        this.#debounceTimer = setTimeout(() => { this.#debounceTimer = undefined; this.#queryBg(); }, 100);
        return;
      }
      this.#inputHandler?.(seq);
    });
    this.#stdinBuf.on("paste", (content: string) => this.#inputHandler?.(`\x1b[200~${content}\x1b[201~`));
    this.#stdinDataHandler = (d: string) => this.#stdinBuf!.process(d);
    process.stdin.on("data", this.#stdinDataHandler);
  }

  #queryBg(): void {
    if (this.#dead || this.#osc11Pending || this.#da1Owners.includes("osc11")) return;
    this.#osc11Pending = true; this.#osc11Buf = ""; this.#da1Owners.push("osc11");
    this.#safeWrite("\x1b]11;?\x07\x1b[c");
  }

  #handleOsc11(r: string, g: string, b: string): void {
    const n = (h: string) => { const v = parseInt(h, 16); if (isNaN(v)) return 0; const max = 16 ** h.length - 1; return max > 0 ? v / max : 0; };
    const lum = 0.299 * n(r) + 0.587 * n(g) + 0.114 * n(b);
    const mode: TerminalAppearance = lum < 0.5 ? "dark" : "light";
    if (mode === this.#appearance) return;
    this.#appearance = mode;
    for (const cb of this.#appearanceCbs) try { cb(mode); } catch {}
  }

  #stopPoll(): void { if (this.#pollTimer) { clearInterval(this.#pollTimer); this.#pollTimer = undefined; } }

  async drainInput(maxMs = 1000, idleMs = 50): Promise<void> {
    if (this.#kittyActive) { this.#safeWrite("\x1b[<u"); this.#kittyActive = false; setKittyProtocolActive(false); }
    if (this.#modTimer) { clearTimeout(this.#modTimer); this.#modTimer = undefined; }
    if (this.#modActive) { this.#safeWrite("\x1b[>4;0m"); this.#modActive = false; }
    const prev = this.#inputHandler; this.#inputHandler = undefined;
    let last = Date.now(); const onD = () => { last = Date.now(); };
    process.stdin.on("data", onD); const end = Date.now() + maxMs;
    try {
      while (true) { const now = Date.now(); if (end - now <= 0) break; if (now - last >= idleMs) break; await new Promise(r => setTimeout(r, Math.min(idleMs, end - now))); }
    } finally { process.stdin.removeListener("data", onD); this.#inputHandler = prev; }
  }

  stop(): void {
    if (activeTerminal === this) activeTerminal = null;
    this.#safeWrite("\x1b[?2004l\x1b[?2031l"); this.#stopPoll();
    if (this.#debounceTimer) { clearTimeout(this.#debounceTimer); this.#debounceTimer = undefined; }
    this.#appearanceCbs = []; this.#osc11Pending = false; this.#draineda1();
    if (this.#kittyActive) { this.#safeWrite("\x1b[<u"); this.#kittyActive = false; setKittyProtocolActive(false); }
    if (this.#modTimer) { clearTimeout(this.#modTimer); this.#modTimer = undefined; }
    if (this.#modActive) { this.#safeWrite("\x1b[>4;0m"); this.#modActive = false; }
    if (this.#stdinBuf) { this.#stdinBuf.destroy(); this.#stdinBuf = undefined; }
    if (this.#stdinDataHandler) { process.stdin.removeListener("data", this.#stdinDataHandler); this.#stdinDataHandler = undefined; }
    this.#inputHandler = undefined; this.#appearance = undefined;
    if (this.#resizeHandler) { process.stdout.removeListener("resize", this.#resizeHandler); this.#resizeHandler = undefined; }
    process.stdin.pause();
    if (process.stdin.setRawMode) process.stdin.setRawMode(this.#wasRaw);
  }

  #draineda1(): void { this.#osc11Buf = ""; this.#da1Owners = []; }

  write(d: string): void { this.#safeWrite(d); }
  #safeWrite(d: string): void { if (this.#dead || !process.stdout.isTTY) return; try { process.stdout.write(d); } catch { this.#dead = true; } }
  get columns(): number { return process.stdout.columns || 80; }
  get rows(): number { return process.stdout.rows || 24; }
  moveBy(n: number): void { if (n > 0) this.#safeWrite(`\x1b[${n}B`); else if (n < 0) this.#safeWrite(`\x1b[${-n}A`); }
  hideCursor(): void { this.#safeWrite("\x1b[?25l"); }
  showCursor(): void { this.#safeWrite("\x1b[?25h"); }
  clearLine(): void { this.#safeWrite("\x1b[K"); }
  clearFromCursor(): void { this.#safeWrite("\x1b[J"); }
  clearScreen(): void { this.#safeWrite("\x1b[H\x1b[0J"); }
  setTitle(t: string): void { this.#safeWrite(`\x1b]0;${t}\x07`); }
  setProgress(v: boolean): void { this.#safeWrite(v ? "\x1b]9;4;3\x07" : "\x1b]9;4;0;\x07"); }
}

function N(s: string): number { const n = parseInt(s, 10); return isNaN(n) ? 0 : n; }
