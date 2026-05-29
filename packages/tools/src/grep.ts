import { resolve } from "node:path"
import { spawnSync } from "node:child_process"
import type { AgentTool } from "../../core/src/interface.js"

export function createGrepTool(): AgentTool {
  return {
    name: "grep",
    description: "Search file contents using regular expressions. Returns matching files with line numbers. Uses ripgrep (rg) if available, otherwise falls back to grep.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression to search for." },
        path: { type: "string", description: "Directory or file to search in (optional, defaults to working directory)." },
        include: { type: "string", description: "File pattern to include (e.g. '*.ts', '*.{ts,tsx}')." },
      },
      required: ["pattern"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args, ctx) {
      if (typeof args.pattern !== "string" || !args.pattern) {
        return { content: JSON.stringify({ error: "pattern is required" }), isError: true }
      }

      const searchPath = typeof args.path === "string" ? resolve(ctx.cwd, args.path) : ctx.cwd
      const pattern = args.pattern
      const include = typeof args.include === "string" ? args.include : undefined

      let stdout: string
      try {
        stdout = runSearch(pattern, searchPath, include)
      } catch {
        return { content: JSON.stringify({ error: "Search failed. Pattern may be invalid or path not found." }), isError: true }
      }

      const lines = stdout.split("\n").filter(Boolean)
      const maxResults = 200
      const truncated = lines.length > maxResults
      const results = truncated ? lines.slice(0, maxResults) : lines

      return {
        content: JSON.stringify({
          pattern,
          path: args.path ?? ctx.cwd,
          results,
          totalMatches: lines.length,
          truncated,
          cwd: ctx.cwd,
        }),
        isError: false,
      }
    },
  }
}

function runSearch(pattern: string, searchPath: string, include?: string): string {
  try {
    const rgArgs = ["-n", "--no-heading"]
    if (include) rgArgs.push("-g", include)
    rgArgs.push(pattern, searchPath)
    const result = spawnSync("rg", rgArgs, { encoding: "utf-8", timeout: 15000 })
    if (result.error || result.status === 127) throw result.error ?? new Error("rg not found")
    return result.stdout ?? ""
  } catch {
    // rg not found or failed, fallback to grep
    const grepArgs = ["-rn"]
    if (include) grepArgs.push(`--include=${include}`)
    grepArgs.push(pattern, searchPath)
    const result = spawnSync("grep", grepArgs, { encoding: "utf-8", timeout: 15000 })
    // grep returns exit code 1 when no matches found
    if (result.status === 1) return ""
    if (result.error) throw result.error
    return result.stdout ?? ""
  }
}
