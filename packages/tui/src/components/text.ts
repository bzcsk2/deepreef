import { Component } from "../tui";
import { applyBackgroundToLine, padding, wrapTextWithAnsi, replaceTabs } from "../utils";

export class Text implements Component {
  #text: string;
  #paddingX: number;
  #paddingY: number;
  #customBgFn?: (text: string) => string;

  constructor(text = "", paddingX = 1, paddingY = 1, customBgFn?: (text: string) => string) {
    this.#text = text;
    this.#paddingX = paddingX;
    this.#paddingY = paddingY;
    this.#customBgFn = customBgFn;
  }

  getText(): string {
    return this.#text;
  }

  setText(text: string): void {
    this.#text = text;
    this.invalidate();
  }

  invalidate(): void {}

  render(width: number): string[] {
    const innerW = Math.max(1, width - this.#paddingX * 2);
    const normalized = replaceTabs(this.#text);
    const wrapped = wrapTextWithAnsi(normalized, innerW);
    const result: string[] = [];
    for (let i = 0; i < this.#paddingY; i++) result.push("");
    for (const line of wrapped) {
      result.push(padding(this.#paddingX) + line);
    }
    for (let i = 0; i < this.#paddingY; i++) result.push("");
    if (this.#customBgFn) {
      return result.map(l => applyBackgroundToLine(l, width, this.#customBgFn!));
    }
    return result;
  }
}
