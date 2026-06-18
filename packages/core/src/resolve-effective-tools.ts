import type { AgentTool } from "./interface.js"
import type { ToolSpec } from "./types.js"
import type { AgentRole } from "./agent-profile/types.js"
import type { WorkflowMode } from "./dual-agent-runtime/types.js"

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

const SUPERVISOR_TOOLS_LOOP = new Set([
  "get_goal",
  "update_goal",
  "send_message",
  "followup_task",
  "read_mailbox",
])

const WORKER_TOOLS_LOOP_EXTRA = new Set([
  "get_goal",
  "send_message",
  "followup_task",
  "read_mailbox",
])

const WORKER_TOOLS_LOOP_DENY = new Set([
  "update_goal",
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

export function resolveEffectiveTools(opts: ResolveEffectiveToolsOpts): ResolveEffectiveToolsResult {
  const { registeredTools, role, mode, agentToolNames } = opts
  const toolSpecs: ToolSpec[] = []
  let filteredCount = 0
  let filteredReason: string | undefined

  for (const tool of registeredTools.values()) {
    const name = tool.name

    // Phase 6: Supervisor + loop → only governance/mailbox tools
    if (role === "supervisor" && mode === "loop") {
      if (SUPERVISOR_TOOLS_LOOP.has(name)) {
        toolSpecs.push(toSpec(tool))
      } else {
        filteredCount++
        if (!filteredReason) filteredReason = "supervisor loop mode: governance tools only"
      }
      continue
    }

    // Phase 6: Worker + loop → engineering tools + extra, deny update_goal
    if (role === "worker" && mode === "loop") {
      if (WORKER_TOOLS_LOOP_DENY.has(name)) {
        filteredCount++
        if (!filteredReason) filteredReason = "worker loop mode: cannot update_goal"
        continue
      }
      if (WORKER_TOOLS_LOOP_EXTRA.has(name)) {
        toolSpecs.push(toSpec(tool))
        continue
      }
      // For engineering tools, check agentToolNames
      if (agentToolNames !== undefined) {
        if (agentToolNames.length === 0) {
          filteredCount++
          if (!filteredReason) filteredReason = "agent config toolNames is empty array"
          continue
        }
        if (!agentToolNames.includes(name)) {
          filteredCount++
          continue
        }
      }
      toolSpecs.push(toSpec(tool))
      continue
    }

    // Worker non-loop: delegate to agentToolNames if specified
    if (role === "worker" && mode !== "loop") {
      if (agentToolNames !== undefined) {
        if (agentToolNames.length === 0) {
          filteredCount++
          if (!filteredReason) filteredReason = "agent config toolNames is empty array"
          continue
        }
        if (!agentToolNames.includes(name)) {
          filteredCount++
          continue
        }
      }
      toolSpecs.push(toSpec(tool))
      continue
    }

    // Supervisor alone/subagent
    if (role === "supervisor") {
      if (mode === "alone" && !SUPERVISOR_TOOLS_ALONE.has(name)) {
        filteredCount++
        if (!filteredReason) filteredReason = "supervisor alone mode: restricted toolset"
        continue
      }
      if (mode === "subagent" && !SUPERVISOR_TOOLS_SUBAGENT.has(name)) {
        filteredCount++
        if (!filteredReason) filteredReason = "supervisor subagent mode: restricted toolset"
        continue
      }
    }

    // Default: allow through agentToolNames if set
    if (agentToolNames !== undefined) {
      if (agentToolNames.length === 0) {
        filteredCount++
        if (!filteredReason) filteredReason = "agent config toolNames is empty array"
        continue
      }
      if (!agentToolNames.includes(name)) {
        filteredCount++
        continue
      }
    }

    toolSpecs.push(toSpec(tool))
  }

  return { tools: toolSpecs, filteredCount, filteredReason }
}

function toSpec(tool: AgentTool): ToolSpec {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}
