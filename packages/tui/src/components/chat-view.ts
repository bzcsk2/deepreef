import { Component } from "../tui";
import { visibleWidth } from "../utils";

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

const ROLE_COLORS: Record<string, string> = {
  user: "\x1b[32m", assistant: "\x1b[36m", tool: "\x1b[90m",
};
const RESET = "\x1b[0m";

export class ChatView implements Component {
  messages: ChatMessage[] = [];
  #scrollOffset = 0;
  autoScroll = true;

  addMessage(role: ChatMessage["role"], content: string): void {
    this.messages.push({ role, content });
    if (this.autoScroll) this.#scrollOffset = 0;
  }

  updateLastMessage(content: string): void {
    if (this.messages.length === 0) return;
    this.messages[this.messages.length - 1]!.content = content;
  }

  invalidate(): void {}
  handleInput(): void {}

  render(width: number): string[] {
    const lines: string[] = [];
    const start = Math.max(0, this.messages.length - 50);
    for (let i = start; i < this.messages.length; i++) {
      const msg = this.messages[i]!;
      const color = ROLE_COLORS[msg.role] ?? "";
      const header = `${color}[${msg.role}]${RESET}`;
      lines.push(header);
      const contentLines = msg.content.split("\n");
      for (const cl of contentLines) {
        const trimmed = visibleWidth(cl) > width - 2 ? cl.slice(0, width - 5) + "..." : cl;
        lines.push(` ${trimmed}`);
      }
      lines.push("");
    }
    return lines;
  }
}
