import type { AgentTool, ToolContext, ToolResult } from "../interface.js"
import { GoalStore } from "./store.js"

export function createGetGoalTool(store: GoalStore): AgentTool {
  return {
    name: "get_goal",
    description: "Get the current thread goal, including objective, status, and token usage.",
    parameters: {
      type: "object",
      properties: {
        threadId: {
          type: "string",
          description: "The session/thread ID to get the goal for.",
        },
      },
      required: ["threadId"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const threadId = String(args.threadId ?? "")
      if (!threadId) {
        return { content: "Error: threadId is required", isError: true }
      }
      try {
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

export function createUpdateGoalTool(store: GoalStore): AgentTool {
  return {
    name: "update_goal",
    description: "Mark the current goal as complete or blocked. Only Supervisor can use this.",
    parameters: {
      type: "object",
      properties: {
        threadId: {
          type: "string",
          description: "The session/thread ID.",
        },
        status: {
          type: "string",
          enum: ["complete", "blocked"],
          description: "Set to 'complete' when the goal is achieved, or 'blocked' when it cannot proceed.",
        },
        expectedGoalId: {
          type: "string",
          description: "Expected goal ID to prevent stale updates.",
        },
        reason: {
          type: "string",
          description: "Reason for blocking (required when status is 'blocked').",
        },
      },
      required: ["threadId", "status"],
    },
    concurrency: "exclusive",
    approval: "write",
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const threadId = String(args.threadId ?? "")
      const status = String(args.status ?? "")
      const expectedGoalId = args.expectedGoalId ? String(args.expectedGoalId) : undefined

      if (!threadId || !status) {
        return { content: "Error: threadId and status are required", isError: true }
      }

      if (status !== "complete" && status !== "blocked") {
        return { content: `Error: status must be "complete" or "blocked"`, isError: true }
      }

      try {
        const goal = store.updateGoal(threadId, {
          status: status as "complete" | "blocked",
          expectedGoalId,
        })
        return {
          content: JSON.stringify(goal, null, 2),
          isError: false,
        }
      } catch (err) {
        return { content: `Error updating goal: ${err}`, isError: true }
      }
    },
  }
}

export function createGoalTools(store: GoalStore): AgentTool[] {
  return [createGetGoalTool(store), createUpdateGoalTool(store)]
}
