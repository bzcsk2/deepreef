import type { AgentTool, ToolContext, ToolResult } from "../interface.js"
import type { AgentCommController } from "./controller.js"
import type { AgentRole } from "./types.js"

export interface MailboxToolProvider {
  getController(): AgentCommController | null
}

export function createSendMessageTool(provider: MailboxToolProvider, role: AgentRole): AgentTool {
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

      // Enforce role direction
      if (role === "supervisor" && to !== "worker") {
        return { content: "Error: Supervisor can only send messages to worker.", isError: true }
      }
      if (role === "worker" && to !== "supervisor") {
        return { content: "Error: Worker can only send messages to supervisor.", isError: true }
      }

      const ctrl = provider.getController()
      if (!ctrl) {
        return { content: "Error: no active workflow mailbox.", isError: true }
      }

      const msg = ctrl.sendMessage(role, to as any, kind as any, content)
      return { content: `Message sent (id: ${msg.id})`, isError: false }
    },
  }
}

export function createFollowupTaskTool(provider: MailboxToolProvider, role: AgentRole): AgentTool {
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

      // Supervisor can followup_task to worker (assign work)
      // Worker can followup_task to supervisor only for review/clarification
      if (role === "supervisor" && to !== "worker") {
        return { content: "Error: Supervisor can only assign tasks to worker.", isError: true }
      }
      if (role === "worker" && to !== "supervisor") {
        return { content: "Error: Worker can only request review from supervisor.", isError: true }
      }

      const ctrl = provider.getController()
      if (!ctrl) {
        return { content: "Error: no active workflow mailbox.", isError: true }
      }

      const msg = ctrl.followupTask(role, content)
      return { content: `Follow-up task sent (id: ${msg.id})`, isError: false }
    },
  }
}

export function createReadMailboxTool(provider: MailboxToolProvider, role: AgentRole): AgentTool {
  return {
    name: "read_mailbox",
    description: "Read pending messages from the mailbox. Returns messages addressed to you.",
    parameters: {
      type: "object",
      properties: {
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
      const ctrl = provider.getController()
      if (!ctrl) {
        return { content: "No active workflow mailbox.", isError: false }
      }

      const messages = ctrl.readMailbox({
        to: role,
        unreadOnly: args.unreadOnly as boolean | undefined,
        limit: args.limit as number | undefined,
      })

      if (messages.length === 0) {
        return { content: "No messages in mailbox.", isError: false }
      }

      const summary = messages.map(m => ({
        id: m.id,
        from: m.from,
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

export function createMailboxTools(provider: MailboxToolProvider, role: AgentRole): AgentTool[] {
  return [
    createSendMessageTool(provider, role),
    createFollowupTaskTool(provider, role),
    createReadMailboxTool(provider, role),
  ]
}
