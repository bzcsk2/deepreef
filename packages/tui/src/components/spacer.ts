import { Component } from "../tui";

export class Spacer implements Component {
  #lines: number;

  constructor(lines = 1) {
    this.#lines = lines;
  }

  invalidate(): void {}

  render(_width: number): string[] {
    return Array<string>(this.#lines).fill("");
  }
}
