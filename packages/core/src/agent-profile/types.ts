export type AgentRole = "worker" | "supervisor"

export type HarnessStrictness = "strict" | "normal" | "loose"

export type ThinkingMode = "off" | "open" | "high"

export interface AgentRoleProfile {
  role: AgentRole
  /** 绑定的 agent 身份名（对应 AgentRegistry 中的 name）。缺省时按 role 同名回退。 */
  agent?: string
  modelTarget: string
  harness: HarnessStrictness
  thinking: ThinkingMode
  contextWindow?: number
  maxTokens?: number
  temperature?: number
  tools: {
    allow?: string[]
    deny?: string[]
  }
  plugins: string[]
  mcpServers: string[]
  skills: string[]
}

export interface AgentProfilesConfig {
  version: number
  worker: AgentRoleProfile
  supervisor: AgentRoleProfile
}

export const DEFAULT_AGENT_PROFILES: AgentProfilesConfig = {
  version: 1,
  worker: {
    role: "worker",
    agent: "worker",
    modelTarget: "zen/mimo-v2.5-free",
    harness: "normal",
    thinking: "high",
    tools: {},
    plugins: [],
    mcpServers: [],
    skills: [],
  },
  supervisor: {
    role: "supervisor",
    agent: "supervisor",
    modelTarget: "zen/mimo-v2.5-free",
    harness: "normal",
    thinking: "off",
    tools: {
      deny: ["write_file", "edit", "bash", "WriteFile", "EditFile"],
    },
    plugins: [],
    mcpServers: [],
    skills: [],
  },
}
