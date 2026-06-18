import type { AgentMessage, AgentRole, MailboxReadOptions } from "./types.js"
import { Mailbox } from "./mailbox.js"

export interface AgentCommConfig {
  threadId: string
  goalId: string
  workflowId: string
  iteration?: number
}

export class AgentCommController {
  private mailbox: Mailbox
  private config: AgentCommConfig

  constructor(config: AgentCommConfig, mailbox?: Mailbox) {
    this.config = config
    this.mailbox = mailbox ?? new Mailbox()
  }

  sendMessage(from: AgentRole, to: AgentRole, kind: AgentMessage["kind"], content: string, opts?: {
    structured?: unknown
    requiresResponse?: boolean
    correlationId?: string
  }): AgentMessage {
    return this.mailbox.send({
      threadId: this.config.threadId,
      goalId: this.config.goalId,
      workflowId: this.config.workflowId,
      iteration: this.config.iteration ?? 0,
      from,
      to,
      kind,
      delivery: "queue_only",
      content,
      structured: opts?.structured,
      requiresResponse: opts?.requiresResponse,
      correlationId: opts?.correlationId,
    })
  }

  followupTask(from: AgentRole, content: string, opts?: {
    structured?: unknown
    correlationId?: string
  }): AgentMessage {
    return this.mailbox.send({
      threadId: this.config.threadId,
      goalId: this.config.goalId,
      workflowId: this.config.workflowId,
      iteration: this.config.iteration ?? 0,
      from,
      to: from === "supervisor" ? "worker" : "supervisor",
      kind: "task",
      delivery: "trigger_turn",
      content,
      structured: opts?.structured,
      correlationId: opts?.correlationId,
    })
  }

  readMailbox(options: Partial<MailboxReadOptions> = {}): AgentMessage[] {
    return this.mailbox.read({
      threadId: this.config.threadId,
      goalId: options.goalId ?? this.config.goalId,
      workflowId: options.workflowId ?? this.config.workflowId,
      to: options.to,
      unreadOnly: options.unreadOnly,
      limit: options.limit,
    })
  }

  markRead(messageId: string): boolean {
    return this.mailbox.markRead(messageId, this.config.threadId)
  }

  hasPendingTrigger(): boolean {
    return this.mailbox.hasTriggerTurnItems(this.config.threadId, this.config.goalId)
  }
}
