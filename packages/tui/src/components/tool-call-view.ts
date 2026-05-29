import { Component } from "../tui";
import { visibleWidth } from "../utils";

interface ToolCall {
  name: string;
  status: "pending" | "running" | "done" | "error";
  content?: string;
}

export class ToolCallView implements Component {
  #tools: ToolCall[] = [];

  addTool(name: string): void {
    this.#tools.push({ name, status: "pending" });
  }

  updateTool(name: string, status: ToolCall["status"], content?: string): void {
    for (const t of this.#tools) {
      if (t.name === name) { t.status = status; if (content !== undefined) t.content = content; return; }
    }
  }

  clear(): void { this.#tools = []; }
  invalidate(): void {}

  render(width: number): string[] {
    if (this.#tools.length === 0) return [""];
    const lines: string[] = [];
    for (const t of this.#tools) {
      const icon = t.status === "running" ? "\x1b[93m⟳\x1b[0m" : t.status === "done" ? "\x1b[92m✓\x1b[0m" : t.status === "error" ? "\x1b[91m✗\x1b[0m" : "\x1b[90m⋯\x1b[0m";
      const line = ` ${icon} \x1b[90m${t.name}\x1b[0m`;
      lines.push(line);
    }
    return lines;
  }
}
