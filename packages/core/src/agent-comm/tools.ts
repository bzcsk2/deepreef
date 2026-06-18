import type { AgentTool, ToolContext, ToolResult } from "../interface.js"
import type { AgentCommController } from "./controller.js"

export function createSendMessageTool(controller: AgentCommController): AgentTool {
  return {
    name: "send_message",
    description: "Send a message to the other agent. The message will be queued for the next turn.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          enum: ["supervisor", "worker"],
          description: "The recipient agent role.",
        },
        kind: {
          type: "string",
          enum: ["task", "report", "review", "question", "answer", "guidance", "blocker", "evidence", "status"],
          description: "Type of message.",
        },
        content: {
          type: "string",
          description: "Message content.",
        },
      },
      required: ["to", "kind", "content"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const to = String(args.to ?? "")
      const kind = String(args.kind ?? "")
      const content = String(args.content ?? "")

      if (!to || !kind || !content) {
        return { content: "Error: to, kind, and content are required", isError: true }
      }

      const from = to === "supervisor" ? "worker" : "supervisor"
      const msg = controller.sendMessage(from as any, to as any, kind as any, content)
      return { content: `Message sent (id: ${msg.id})`, isError: false }
    },
  }
}

export function createFollowupTaskTool(controller: AgentCommController): AgentTool {
  return {
    name: "followup_task",
    description: "Assign a follow-up task to the other agent. This will trigger their next turn.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          enum: ["supervisor", "worker"],
          description: "The recipient agent role.",
        },
        content: {
          type: "string",
          description: "Task description.",
        },
      },
      required: ["to", "content"],
    },
    concurrency: "exclusive",
    approval: "write",
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const to = String(args.to ?? "")
      const content = String(args.content ?? "")

      if (!to || !content) {
        return { content: "Error: to and content are required", isError: true }
      }

      const from = to === "supervisor" ? "worker" : "supervisor"
      const msg = controller.followupTask(from as any, content)
      return { content: `Follow-up task sent (id: ${msg.id})`, isError: false }
    },
  }
}

export function createReadMailboxTool(controller: AgentCommController): AgentTool {
  return {
    name: "read_mailbox",
    description: "Read pending messages from the mailbox, optionally filtered by sender and read status.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          enum: ["supervisor", "worker"],
          description: "Filter by recipient role.",
        },
        unreadOnly: {
          type: "boolean",
          description: "Only return unread messages.",
        },
        limit: {
          type: "number",
          description: "Maximum number of messages to return.",
        },
      },
    },
    concurrency: "shared",
    approval: "read",
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const messages = controller.readMailbox({
        to: args.to as any,
        unreadOnly: args.unreadOnly as boolean | undefined,
        limit: args.limit as number | undefined,
      })

      if (messages.length === 0) {
        return { content: "No messages in mailbox.", isError: false }
      }

      const summary = messages.map(m => ({
        id: m.id,
        from: m.from,
        to: m.to,
        kind: m.kind,
        delivery: m.delivery,
        content: m.content.slice(0, 500),
        readAt: m.readAt,
        createdAt: m.createdAt,
      }))

      return { content: JSON.stringify(summary, null, 2), isError: false }
    },
  }
}

export function createMailboxTools(controller: AgentCommController): AgentTool[] {
  return [
    createSendMessageTool(controller),
    createFollowupTaskTool(controller),
    createReadMailboxTool(controller),
  ]
}
