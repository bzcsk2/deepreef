import type { AgentTool } from "./interface.js"
import type { ToolSpec } from "./types.js"
import type { AgentRole } from "./agent-profile/types.js"
import type { WorkflowMode } from "./dual-agent-runtime/types.js"

/**
 * SFR-30: Supervisor 模式默认工具集合
 * subagent 模式使用全部6个；alone 模式移除 AgentTool。
 */
const SUPERVISOR_TOOLS_SUBAGENT = new Set([
  "AgentTool",
  "AskUserQuestion",
  "read_file",
  "grep",
  "list_dir",
  "todowrite",
])

const SUPERVISOR_TOOLS_ALONE = new Set([
  "AskUserQuestion",
  "read_file",
  "grep",
  "list_dir",
  "todowrite",
])

export interface ResolveEffectiveToolsOpts {
  registeredTools: Map<string, AgentTool>
  role: AgentRole
  mode: WorkflowMode
  agentToolNames?: string[]
}

export interface ResolveEffectiveToolsResult {
  tools: ToolSpec[]
  filteredCount: number
  filteredReason?: string
}

/**
 * 根据角色、模式和 agent 配置，计算本次请求的有效工具列表。
 *
 * 规则：
 * 1. Supervisor + alone → 5个监督工具（不含 AgentTool）
 * 2. Supervisor + subagent → 6个监督工具（含 AgentTool）
 * 3. Supervisor + loop → 零工具（Workflow 阶段不暴露工程工具）
 * 4. Worker → 不受 role/mode 限制，由 agentToolNames 决定
 * 5. agentToolNames === undefined → 不额外限制
 * 6. agentToolNames === [] → 明确禁止全部工具
 */
export function resolveEffectiveTools(opts: ResolveEffectiveToolsOpts): ResolveEffectiveToolsResult {
  const { registeredTools, role, mode, agentToolNames } = opts
  const toolSpecs: ToolSpec[] = []
  let filteredCount = 0
  let filteredReason: string | undefined

  for (const tool of registeredTools.values()) {
    // 先检查 agent toolNames 过滤
    if (agentToolNames !== undefined) {
      if (agentToolNames.length === 0) {
        // []: 明确禁止全部工具
        filteredCount++
        filteredReason = "agent config toolNames is empty array"
        continue
      }
      if (!agentToolNames.includes(tool.name)) {
        // 非空数组但工具不在列表中
        filteredCount++
        continue
      }
    }

    // 再根据 role/mode 策略过滤
    if (role === "supervisor") {
      if (mode === "loop") {
        // Workflow 阶段不暴露工程工具
        filteredCount++
        if (!filteredReason) filteredReason = "supervisor workflow mode: no tools"
        continue
      }
      if (mode === "alone" && !SUPERVISOR_TOOLS_ALONE.has(tool.name)) {
        filteredCount++
        if (!filteredReason) filteredReason = "supervisor alone mode: restricted toolset"
        continue
      }
      if (mode === "subagent" && !SUPERVISOR_TOOLS_SUBAGENT.has(tool.name)) {
        filteredCount++
        if (!filteredReason) filteredReason = "supervisor subagent mode: restricted toolset"
        continue
      }
    }

    toolSpecs.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })
  }

  return { tools: toolSpecs, filteredCount, filteredReason }
}
