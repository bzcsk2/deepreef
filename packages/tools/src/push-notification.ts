import { execSync } from "node:child_process"
import type { AgentTool } from "../../core/src/interface.js"
import { safeStringify } from "./safe-stringify.js"

export function createPushNotificationTool(): AgentTool {
  return {
    name: "PushNotification",
    description: "Send a desktop notification. Use this to alert the user when a long-running task completes or requires attention.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Notification title" },
        message: { type: "string", description: "Notification body message" },
        urgency: { type: "string", enum: ["low", "normal", "critical"], description: "Notification urgency (default: normal)" },
      },
      required: ["title", "message"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args) {
      if (typeof args.title !== "string" || !args.title) {
        return { content: safeStringify({ error: "title is required" }), isError: true }
      }
      if (typeof args.message !== "string" || !args.message) {
        return { content: safeStringify({ error: "message is required" }), isError: true }
      }
      const urgency = args.urgency === "low" || args.urgency === "normal" || args.urgency === "critical"
        ? args.urgency
        : "normal"

      try {
        execSync(`notify-send --urgency=${urgency} ${escapeShell(args.title)} ${escapeShell(args.message)}`, {
          timeout: 5000,
        })
        return { content: safeStringify({ sent: true, method: "notify-send", title: args.title, message: args.message }), isError: false }
      } catch {
        // Fallback to terminal bell
        process.stdout.write("\x07")
        return { content: safeStringify({ sent: true, method: "terminal-bell", title: args.title, message: args.message }), isError: false }
      }
    },
  }
}

function escapeShell(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}
