import { Component } from "../tui";
import { applyBackgroundToLine, padding } from "../utils";

export class Box implements Component {
  #paddingX: number;
  #paddingY: number;
  #bgFn?: (text: string) => string;
  #children: Component[] = [];

  constructor(paddingX = 1, paddingY = 1, bgFn?: (text: string) => string) {
    this.#paddingX = paddingX;
    this.#paddingY = paddingY;
    this.#bgFn = bgFn;
  }

  get children(): Component[] {
    return this.#children;
  }

  addChild(c: Component): void {
    this.#children.push(c);
  }

  removeChild(c: Component): void {
    const i = this.#children.indexOf(c);
    if (i >= 0) this.#children.splice(i, 1);
  }

  clear(): void {
    this.#children = [];
  }

  setBgFn(fn?: (text: string) => string): void {
    this.#bgFn = fn;
  }

  invalidate(): void {
    for (const c of this.#children) c.invalidate();
  }

  render(width: number): string[] {
    const innerW = Math.max(1, width - this.#paddingX * 2);
    const lines: string[] = [];
    for (const c of this.#children) {
      lines.push(...c.render(innerW));
    }
    const result: string[] = [];
    for (let i = 0; i < this.#paddingY; i++) result.push("");
    for (const line of lines) {
      result.push(padding(this.#paddingX) + line);
    }
    for (let i = 0; i < this.#paddingY; i++) result.push("");
    if (this.#bgFn) {
      return result.map(l => applyBackgroundToLine(l, width, this.#bgFn!));
    }
    return result;
  }
}
