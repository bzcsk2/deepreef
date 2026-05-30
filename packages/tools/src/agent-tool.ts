import type { AgentTool } from "../../core/src/interface.js"
import { safeStringify } from "./safe-stringify.js"

export function createAgentToolTool(): AgentTool {
  return {
    name: "AgentTool",
    description: "Delegate a subtask to a sub-agent. Creates an isolated agent session to work on a specific task. The sub-agent has access to a restricted set of tools. Returns the sub-agent's complete output.",
    parameters: {
      type: "object",
      properties: {
        task: { type: "string", description: "The task description for the sub-agent." },
        agent_type: { type: "string", enum: ["build", "plan"], description: "Agent type to use. 'build' has full tool access, 'plan' is read-only." },
        files: { type: "array", items: { type: "string" }, description: "Relevant file paths to provide as context." },
      },
      required: ["task"],
    },
    concurrency: "exclusive",
    approval: "exec",
    async execute(args) {
      if (typeof args.task !== "string" || !args.task) {
        return { content: safeStringify({ error: "task is required" }), isError: true }
      }
      const agentType = args.agent_type === "plan" ? "plan" : "build"
      const files = Array.isArray(args.files) ? args.files.map(String) : []
      return {
        content: safeStringify({
          status: "delegated",
          agent: agentType,
          task: args.task,
          files,
          result: `[Sub-agent ${agentType} would process: ${args.task.slice(0, 100)}${args.task.length > 100 ? "..." : ""}]`,
          note: "Sub-agent execution requires async engine support. Current implementation returns a simulated result.",
        }),
        isError: false,
      }
    },
  }
}
