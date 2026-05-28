// CoreEngine interface — shared contract between core (ReasonixEngine) and shell (oh-my-pi).
// Design doc reference: §10.1 核心层与壳层接口

import type { ChatMessage, ToolSpec, Usage } from "./types.js"

/* ── LoopEvent — core yields these, shell consumes them ── */

export type LoopEventRole =
  | "assistant_delta"
  | "reasoning_delta"
  | "tool_call_delta"
  | "tool_start"
  | "tool"
  | "warning"
  | "error"
  | "status"
  | "done"
  | "strategy_notify"
  | "strategy_estimate_refined"

export interface LoopEvent {
  role: LoopEventRole
  content?: string
  toolName?: string
  toolCallIndex?: number
  severity?: "info" | "warning" | "error"
  metadata?: Record<string, unknown>
}

/* ── AgentTool — every tool must implement this ── */

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  isConcurrencySafe: boolean
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>
}

export interface ToolContext {
  cwd: string
  sessionId: string
}

export interface ToolResult {
  content: string
  isError: boolean
  metadata?: Record<string, unknown>
}

/* ── AgentState — snapshot of current agent status ── */

export interface AgentState {
  sessionId: string
  messages: ChatMessage[]
  isStreaming: boolean
  streamingMessage: string
  pendingToolCalls: Array<{ name: string; args: string }>
  currentAgent: string
  stats: SessionStats
  errorMessage?: string
}

export interface SessionStats {
  promptTokens: number
  completionTokens: number
  cacheHitTokens: number
  cacheMissTokens: number
  apiCalls: number
  toolCalls: number
  totalCost: number
}

/* ── CoreEngine — the central engine interface ── */

export interface CoreEngine {
  submit(userInput: string, agentConfig?: AgentConfig): AsyncGenerator<LoopEvent>
  getState(): AgentState
  interrupt(): void
  registerTool(tool: AgentTool): void
  switchAgent(agentName: string): void
  resolveTierDecision(tier: string): void
}

export interface AgentConfig {
  name: string
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  toolNames?: string[]
}
