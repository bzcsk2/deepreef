import type { AgentTool, ToolContext, ToolResult } from "../interface.js"
import type { GoalStore } from "./store.js"

export interface GoalToolProvider {
  getGoalStore(): GoalStore
  getThreadId(): string
}

export function createGetGoalTool(provider: GoalToolProvider): AgentTool {
  return {
    name: "get_goal",
    description: "Get the current loop goal, including objective, status, and token usage.",
    parameters: {
      type: "object",
      properties: {},
    },
    concurrency: "shared",
    approval: "read",
    async execute(_args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const store = provider.getGoalStore()
        const threadId = provider.getThreadId()
        const goal = store.getGoal(threadId)
        if (!goal) {
          return { content: "No goal set for this thread.", isError: false }
        }
        return {
          content: JSON.stringify(goal, null, 2),
          isError: false,
        }
      } catch (err) {
        return { content: `Error reading goal: ${err}`, isError: true }
      }
    },
  }
}

export function createUpdateGoalTool(provider: GoalToolProvider): AgentTool {
  return {
    name: "update_goal",
    description: "Mark the current loop goal as complete or blocked. Only Supervisor can use this.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["complete", "blocked"],
          description: "Set to 'complete' when the goal is achieved, or 'blocked' when it cannot proceed.",
        },
        reason: {
          type: "string",
          description: "Reason for blocking (required when status is 'blocked').",
        },
      },
      required: ["status"],
    },
    concurrency: "exclusive",
    approval: "write",
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const status = String(args.status ?? "")
      if (status !== "complete" && status !== "blocked") {
        return { content: `Error: status must be "complete" or "blocked"`, isError: true }
      }
      try {
        const store = provider.getGoalStore()
        const threadId = provider.getThreadId()
        const goal = store.getGoal(threadId)
        if (!goal) {
          return { content: "No goal found.", isError: true }
        }
        store.updateGoal(threadId, { status: status as "complete" | "blocked", expectedGoalId: goal.goalId })
        return {
          content: JSON.stringify({ status, goalId: goal.goalId }, null, 2),
          isError: false,
        }
      } catch (err) {
        return { content: `Error updating goal: ${err}`, isError: true }
      }
    },
  }
}

export function createGoalTools(provider: GoalToolProvider): AgentTool[] {
  return [createGetGoalTool(provider), createUpdateGoalTool(provider)]
}
