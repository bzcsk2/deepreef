import { Component } from "../tui";

export class TokenEstimate implements Component {
  #input = 0; #output = 0; #cachePct = 0; #decision = "";

  setUsage(input: number, output: number, cachePct = 0): void { this.#input = input; this.#output = output; this.#cachePct = cachePct; }
  setDecision(d: string): void { this.#decision = d; }
  invalidate(): void {}

  render(width: number): string[] {
    const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
    const cacheColor = this.#cachePct >= 60 ? "\x1b[32m" : this.#cachePct >= 30 ? "\x1b[33m" : "\x1b[31m";
    const parts = [
      `\x1b[90m↑${fmt(this.#input)}\x1b[0m`,
      `\x1b[90m↓${fmt(this.#output)}\x1b[0m`,
      `${cacheColor}cache:${this.#cachePct}%\x1b[0m`,
    ];
    if (this.#decision) parts.push(`\x1b[36m${this.#decision}\x1b[0m`);
    return [` ${parts.join("  ")}`];
  }
}
