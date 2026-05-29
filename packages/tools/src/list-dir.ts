import { readdir, stat } from "node:fs/promises"
import { resolve } from "node:path"
import type { AgentTool } from "../../core/src/interface.js"

export function createListDirTool(): AgentTool {
  return {
    name: "list_dir",
    description: "List files and directories in a given path. Returns a structured listing with types and sizes.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list." },
      },
      required: ["path"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args, ctx) {
      if (typeof args.path !== "string" || !args.path) {
        return { content: JSON.stringify({ error: "path is required" }), isError: true }
      }
      const dir = resolve(ctx.cwd, args.path)

      let entries: string[]
      try {
        entries = await readdir(dir)
      } catch {
        return { content: JSON.stringify({ error: `Directory not found: ${args.path}` }), isError: true }
      }

      const items: Array<{ name: string; type: "file" | "dir"; size?: number }> = []
      for (const name of entries) {
        const full = resolve(dir, name)
        try {
          const st = await stat(full)
          items.push({ name, type: st.isDirectory() ? "dir" : "file", size: st.size })
        } catch {
          items.push({ name, type: "unknown" })
        }
      }

      return {
        content: JSON.stringify({ path: args.path, items, cwd: ctx.cwd }),
        isError: false,
      }
    },
  }
}
