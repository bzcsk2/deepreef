import { Component } from "../tui";
import { padding, truncateToWidth } from "../utils";

export class TruncatedText implements Component {
  #text: string;
  #paddingX: number;
  #paddingY: number;

  constructor(text: string, paddingX = 0, paddingY = 0) {
    this.#text = text;
    this.#paddingX = paddingX;
    this.#paddingY = paddingY;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const innerW = Math.max(1, width - this.#paddingX * 2);
    const firstLine = this.#text.split("\n")[0] ?? "";
    const truncated = truncateToWidth(firstLine, innerW);
    const result: string[] = [];
    for (let i = 0; i < this.#paddingY; i++) result.push("");
    result.push(padding(this.#paddingX) + truncated);
    for (let i = 0; i < this.#paddingY; i++) result.push("");
    return result;
  }
}
