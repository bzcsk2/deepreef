import { TUI } from "./tui";
import { ChatView } from "./components/chat-view";
import { ToolCallView } from "./components/tool-call-view";
import { TokenEstimate } from "./components/token-estimate";
import { StatusLine } from "./components/status-line";
import { Input } from "./components/input";
import type { LoopEvent } from "../../core/src/interface.js";

export function processEvents(tui: TUI, chatView: ChatView, toolView: ToolCallView, tokenEst: TokenEstimate, statusLine: StatusLine, input: Input, events: AsyncGenerator<LoopEvent>): void {
  (async () => {
    let assistantContent = "";
    for await (const event of events) {
      switch (event.role) {
        case "assistant_delta":
          assistantContent += event.content ?? "";
          chatView.updateLastMessage(assistantContent);
          break;
        case "assistant_final":
          if (assistantContent) {
            chatView.addMessage("assistant", assistantContent);
            assistantContent = "";
          }
          break;
        case "tool_start":
          toolView.addTool(event.toolName ?? "unknown");
          break;
        case "tool":
          toolView.updateTool(event.toolName ?? "unknown", "done");
          break;
        case "tool_progress":
          toolView.updateTool(event.toolName ?? "unknown", "running");
          break;
        case "error":
          toolView.updateTool(event.toolName ?? "unknown", "error");
          break;
        case "warning":
          break;
        case "done":
          break;
      }
      tui.requestRender();
    }
    if (assistantContent) {
      chatView.addMessage("assistant", assistantContent);
      tui.requestRender();
    }
  })();
}
