export type AgentRole = "supervisor" | "worker"

export type MessageKind =
  | "task"
  | "report"
  | "review"
  | "question"
  | "answer"
  | "guidance"
  | "blocker"
  | "evidence"
  | "status"

export type DeliveryMode = "queue_only" | "trigger_turn"

export interface AgentMessage {
  id: string
  threadId: string
  goalId: string
  workflowId: string
  iteration: number
  from: AgentRole
  to: AgentRole
  kind: MessageKind
  delivery: DeliveryMode
  content: string
  structured?: unknown
  requiresResponse?: boolean
  correlationId?: string
  createdAt: number
  readAt?: number
}

export interface MailboxReadOptions {
  threadId: string
  goalId?: string
  workflowId?: string
  to?: AgentRole
  unreadOnly?: boolean
  limit?: number
}
