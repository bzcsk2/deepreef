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

// 原生 agent 身份：仅注册 worker / supervisor 两个。
// build / plan 已移除（历史遗留 MAIN_MODES 仍保留作为工具清单来源，但不再注册为 agent 身份）。
// 用户可通过插件注册自定义 agent 身份，并经 /agent 菜单绑定到任一 role。
defaultAgentRegistry.register({
  name: "worker",
  label: "Worker",
  systemPrompt: `You are the Worker agent — the primary execution role in a dual-agent setup.
You have access to a full engineering toolset: read, write, edit files, run bash commands,
search code, manage tasks, fetch the web, and invoke MCP tools.
Always verify your changes — re-read files after editing when needed.
When operating under a Supervisor, execute the assigned tasks faithfully and report results concisely.`,
  toolNames: [...MAIN_MODES.build.toolNames],
})
defaultAgentRegistry.register({
  name: "supervisor",
  label: "Supervisor",
  systemPrompt: "You are the Supervisor agent. Analyze goals, create plans, review evidence, and provide guidance. Do not call tools during workflow turns.",
  // SFR-30: 工具过滤由 resolveEffectiveTools 根据 role/mode 统一计算
  // undefined 表示不在 agent 层额外限制，交由运行时场景策略决定
  toolNames: undefined,
})

/** Backward-compatible static snapshot */
export const AGENTS: Record<string, AgentDefinition> = defaultAgentRegistry.snapshot()

export function getAgent(name: string): AgentDefinition {
  return defaultAgentRegistry.get(name) ?? AGENTS.worker
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
