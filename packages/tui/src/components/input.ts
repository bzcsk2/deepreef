import { Component, Focusable, CURSOR_MARKER, isFocusable } from "../tui";
import { visibleWidth } from "../utils";

export class Input implements Component, Focusable {
  focused = false;
  #text = "";
  #cursor = 0;
  #history: string[] = [];
  #histIdx = -1;
  onSubmit?: (text: string) => void;

  getText(): string { return this.#text; }
  setText(t: string): void { this.#text = t; this.#cursor = t.length; }

  handleInput(data: string): void {
    if (data.length === 1 && data.charCodeAt(0) >= 0x20) {
      this.#text = this.#text.slice(0, this.#cursor) + data + this.#text.slice(this.#cursor);
      this.#cursor++;
      return;
    }
    if (data === "\r" || data === "\n") {
      if (this.#text.trim()) {
        this.#history.push(this.#text);
        this.#histIdx = this.#history.length;
        this.onSubmit?.(this.#text);
        this.#text = ""; this.#cursor = 0;
      }
      return;
    }
    if (data === "\x7f" || data === "backspace") {
      if (this.#cursor > 0) {
        this.#text = this.#text.slice(0, this.#cursor - 1) + this.#text.slice(this.#cursor);
        this.#cursor--;
      }
      return;
    }
    if (data === "\x1b[3~") {
      if (this.#cursor < this.#text.length) {
        this.#text = this.#text.slice(0, this.#cursor) + this.#text.slice(this.#cursor + 1);
      }
      return;
    }
    if (data === "\x1b[D" || data === "left") { if (this.#cursor > 0) this.#cursor--; return; }
    if (data === "\x1b[C" || data === "right") { if (this.#cursor < this.#text.length) this.#cursor++; return; }
    if (data === "\x1b[H" || data === "home") { this.#cursor = 0; return; }
    if (data === "\x1b[F" || data === "end") { this.#cursor = this.#text.length; return; }
    if (data === "\x1b[A" || data === "up") {
      if (this.#histIdx > 0) {
        this.#histIdx--;
        this.#text = this.#history[this.#histIdx] ?? "";
        this.#cursor = this.#text.length;
      }
      return;
    }
    if (data === "\x1b[B" || data === "down") {
      if (this.#histIdx < this.#history.length - 1) {
        this.#histIdx++;
        this.#text = this.#history[this.#histIdx] ?? "";
      } else {
        this.#histIdx = this.#history.length;
        this.#text = "";
      }
      this.#cursor = this.#text.length;
      return;
    }
    if (data === "\x03" || data === "ctrl+c") {
      this.onSubmit?.("__CANCEL__");
      return;
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    const prompt = `\x1b[32m>\x1b[0m `;
    const marker = this.focused ? CURSOR_MARKER : "";
    const display = this.#text.slice(0, this.#cursor) + marker + this.#text.slice(this.#cursor);
    return [`${prompt}${display}`];
  }
}
