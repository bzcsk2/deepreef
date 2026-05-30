import type { AgentTool } from "../../core/src/interface.js"
import { safeStringify } from "./safe-stringify.js"

export function createAskUserQuestionTool(): AgentTool {
  return {
    name: "AskUserQuestion",
    description: "Ask the user a question, optionally with multiple-choice options.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask the user." },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional multiple-choice options.",
        },
      },
      required: ["question"],
    },
    concurrency: "exclusive",
    approval: "read",
    async execute(args, ctx) {
      if (typeof args.question !== "string" || !args.question.trim()) {
        return { content: safeStringify({ error: "question is required" }), isError: true }
      }
      const result: Record<string, unknown> = {
        type: "question",
        question: args.question.trim(),
      }
      if (Array.isArray(args.options) && args.options.length > 0) {
        result.options = args.options.filter((o): o is string => typeof o === "string")
      }
      return { content: safeStringify(result), isError: false }
    },
  }
}
