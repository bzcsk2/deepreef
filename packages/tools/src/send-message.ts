import type { AgentTool } from "../../core/src/interface.js"
import { safeStringify } from "./safe-stringify.js"

export function createSendMessageTool(): AgentTool {
  return {
    name: "SendMessage",
    description: "Send a message to another agent or process. Use for inter-agent communication or sending notifications to other system components.",
    parameters: {
      type: "object",
      properties: {
        recipient: { type: "string", description: "Target agent name or channel." },
        message: { type: "string", description: "Message content to send." },
        type: { type: "string", enum: ["info", "request", "response", "error"], description: "Message type." },
      },
      required: ["recipient", "message"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args) {
      if (typeof args.recipient !== "string" || typeof args.message !== "string") {
        return { content: safeStringify({ error: "recipient and message are required" }), isError: true }
      }
      return {
        content: safeStringify({
          status: "sent",
          recipient: args.recipient,
          messageType: args.type ?? "info",
          message: args.message,
          timestamp: Date.now(),
        }),
        isError: false,
      }
    },
  }
}
