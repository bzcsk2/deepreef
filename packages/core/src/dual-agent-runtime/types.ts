import type { AgentRole } from "../agent-profile/types.js"
import type { ChatMessage } from "../types.js"
import type { LoopEvent } from "../interface.js"

export type AgentRuntimeStatus =
  | "idle"
  | "running"
  | "waiting_permission"
  | "waiting_question"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"

export interface AgentRuntimeState {
  role: AgentRole
  status: AgentRuntimeStatus
  currentTask?: string
  messages: ChatMessage[]
  stats: {
    promptTokens: number
    completionTokens: number
    cacheHitTokens: number
    cacheMissTokens: number
    apiCalls: number
    toolCalls: number
    totalCost: number
  }
  elapsedMs: number
}

export interface DualAgentRuntimeConfig {
  workerModelTarget: string
  supervisorModelTarget: string
  workerThinking: "off" | "open" | "high"
  supervisorThinking: "off" | "open" | "high"
  maxWorkflowRounds: number
}

export interface SendToOptions {
  role: AgentRole
  input: string
  workflowId?: string
}

export interface InterruptRoleOptions {
  role: AgentRole
  reason?: string
}
