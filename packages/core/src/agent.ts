import type { AgentConfig } from "./interface.js"
import { MAIN_MODES, getMainMode } from "./main-mode.js"
import type { MainMode } from "./main-mode.js"
import { defaultAgentRegistry } from "./agent-registry.js"

export type { MainMode } from "./main-mode.js"
export { MAIN_MODES, getMainMode } from "./main-mode.js"
export { AgentRegistry, defaultAgentRegistry } from "./agent-registry.js"

export interface AgentDefinition {
  name: string
  label: string
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  toolNames?: string[]
}

// Register default agents
defaultAgentRegistry.register({
  name: "build",
  label: "Build Mode",
  systemPrompt: MAIN_MODES.build.systemPrompt,
  toolNames: [...MAIN_MODES.build.toolNames],
})
defaultAgentRegistry.register({
  name: "plan",
  label: "Plan Mode",
  systemPrompt: MAIN_MODES.plan.systemPrompt,
  toolNames: [...MAIN_MODES.plan.toolNames],
})

// DA-R6: 双角色 Agent 注册
defaultAgentRegistry.register({
  name: "worker",
  label: "Worker",
  systemPrompt: "You are the Worker agent. Execute tasks, call tools, and report results.",
  toolNames: [...MAIN_MODES.build.toolNames],
})
defaultAgentRegistry.register({
  name: "supervisor",
  label: "Supervisor",
  systemPrompt: "You are the Supervisor agent. Analyze goals, create plans, review evidence, and provide guidance. Do not call tools during workflow turns.",
  toolNames: [],
})

/** Backward-compatible static snapshot */
export const AGENTS: Record<string, AgentDefinition> = defaultAgentRegistry.snapshot()

export function getAgent(name: string): AgentDefinition {
  return defaultAgentRegistry.get(name) ?? AGENTS.build
}

export function agentConfigFor(name: string, overrides?: Partial<AgentConfig>): AgentConfig {
  const def = getAgent(name)
  return {
    name: def.name,
    model: overrides?.model,
    temperature: overrides?.temperature,
    maxTokens: overrides?.maxTokens,
    systemPrompt: overrides?.systemPrompt ?? def.systemPrompt,
    toolNames: overrides?.toolNames ?? def.toolNames,
  }
}
