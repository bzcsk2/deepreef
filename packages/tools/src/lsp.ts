import type { AgentTool } from "../../core/src/interface.js"
import { safeStringify } from "./safe-stringify.js"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

export function createLspTool(): AgentTool {
  return {
    name: "LSP",
    description: "Query Language Server Protocol for code intelligence. Provides go-to-definition, references, hover info, diagnostics, and code completion. Requires a language server executable.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["definition", "references", "hover", "diagnostics", "completion"],
          description: "LSP action to perform.",
        },
        file_path: { type: "string", description: "Path to the source file." },
        line: { type: "number", description: "Line number (0-indexed)." },
        column: { type: "number", description: "Column number (0-indexed)." },
        language: { type: "string", description: "Language identifier (e.g. 'typescript', 'python'). Required for diagnostics." },
      },
      required: ["action", "file_path"],
    },
    concurrency: "exclusive",
    approval: "read",
    async execute(args) {
      if (typeof args.action !== "string" || typeof args.file_path !== "string") {
        return { content: safeStringify({ error: "action and file_path are required" }), isError: true }
      }
      const filePath = resolve(args.file_path)
      if (!existsSync(filePath)) {
        return { content: safeStringify({ error: `File not found: ${filePath}` }), isError: true }
      }
      return {
        content: safeStringify({
          status: "unavailable",
          action: args.action,
          file: filePath,
          note: "LSP requires a language server executable. Install one (e.g., typescript-language-server for TS, pylsp for Python) and configure in .deepicode/lsp.json. For now, try grep or read_file instead.",
        }),
        isError: false,
      }
    },
  }
}
