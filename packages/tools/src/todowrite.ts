import type { AgentTool } from "../../core/src/interface.js"

interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "high" | "medium" | "low"
}

export function createTodoWriteTool(): AgentTool {
  return {
    name: "todowrite",
    description: "Create and manage a structured task list. Use for planning and tracking progress on multi-step tasks.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "List of tasks to track.",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Task description." },
              status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"], description: "Current status." },
              priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level." },
            },
            required: ["content", "status", "priority"],
          },
        },
      },
      required: ["todos"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args) {
      const todos = args.todos
      if (!Array.isArray(todos) || todos.length === 0) {
        return { content: JSON.stringify({ error: "todos array is required" }), isError: true }
      }

      const items = todos as TodoItem[]
      const summary = items.map((t) => `[${statusIcon(t.status)}] ${t.content}`).join("\n")

      return {
        content: JSON.stringify({ todos: items, summary }),
        isError: false,
      }
    },
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "in_progress": return "→"
    case "completed": return "✓"
    case "cancelled": return "✗"
    default: return " "
  }
}
