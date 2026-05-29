const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
export type PasteResult = { handled: false } | { handled: true; pasteContent?: string; remaining: string };
export class BracketedPasteHandler {
  #buffer = ""; #active = false;
  process(data: string): PasteResult {
    if (data.includes(PASTE_START)) { this.#active = true; this.#buffer = ""; data = data.replace(PASTE_START, ""); }
    if (!this.#active) return { handled: false };
    this.#buffer += data;
    const end = this.#buffer.indexOf(PASTE_END);
    if (end === -1) return { handled: true, remaining: "" };
    const pasteContent = this.#buffer.substring(0, end);
    const remaining = this.#buffer.substring(end + PASTE_END.length);
    this.#buffer = ""; this.#active = false;
    return { handled: true, pasteContent, remaining };
  }
}
