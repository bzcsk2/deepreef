import { Component } from "../tui";
import { visibleWidth, padding } from "../utils";

export class StatusLine implements Component {
  #model = ""; #input = 0; #output = 0; #startTime = 0; #elapsed = "";

  setModel(m: string): void { this.#model = m; }
  setTokens(inp: number, out: number): void { this.#input = inp; this.#output = out; }
  setTimer(ms: number): void {
    const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
    this.#elapsed = m > 0 ? `${m}m${s % 60}s` : `${s}s`;
  }
  invalidate(): void {}

  render(width: number): string[] {
    const parts = [`\x1b[7m`];
    if (this.#model) parts.push(`${this.#model}`);
    if (this.#input || this.#output) parts.push(`↑${this.#input} ↓${this.#output}`);
    if (this.#elapsed) parts.push(this.#elapsed);
    const content = parts.join("  ");
    const pad = Math.max(0, width - visibleWidth(content));
    return [`${content}${padding(pad)}\x1b[0m`];
  }
}
