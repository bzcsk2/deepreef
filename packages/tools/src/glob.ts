import { isAbsolute, relative, resolve } from "node:path"
import { realpathSync } from "node:fs"
import type { AgentTool } from "@deepreef/core"
import { safeStringify } from "./safe-stringify.js"
import fg from "fast-glob"

const MAX_RESULTS = 100
const DEFAULT_PATH = process.cwd()

export function createGlobTool(): AgentTool {
  return {
    name: "glob",
    description: "Fast file pattern matching tool. Finds files and directories matching a glob pattern.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "The glob pattern to match files against (e.g. '**/*.ts', 'src/**/*.tsx')." },
        path: { type: "string", description: "The directory to search in (optional, defaults to working directory)." },
      },
      required: ["pattern"],
    },
    concurrency: "shared",
    approval: "read",
    async execute(args, ctx) {
      if (typeof args.pattern !== "string" || !args.pattern) {
        return { content: safeStringify({ error: "pattern is required" }), isError: true }
      }
      const searchPath = typeof args.path === "string" ? resolve(ctx.cwd, args.path) : ctx.cwd
      // Validate path is within project directory
      try {
        const realSearch = realpathSync(searchPath)
        const realBase = realpathSync(ctx.cwd)
        const rel = relative(realBase, realSearch)
        if (rel.startsWith("..") || isAbsolute(rel)) {
          return { content: safeStringify({ error: "path is outside the project directory" }), isError: true }
        }
      } catch {
        return { content: safeStringify({ error: `cannot resolve path: ${searchPath}` }), isError: true }
      }
      const pattern = args.pattern

      const t0 = Date.now()
      try {
        const results = await fg(pattern, {
          cwd: searchPath,
          absolute: false,
          dot: true,
          suppressErrors: true,
        })
        const elapsed = Date.now() - t0
        return {
          content: safeStringify({
            numFiles: Math.min(results.length, MAX_RESULTS),
            filenames: results.slice(0, MAX_RESULTS),
            truncated: results.length > MAX_RESULTS,
            durationMs: elapsed,
          }),
          isError: false,
        }
      } catch (e) {
        return {
          content: safeStringify({ error: `Glob error: ${e instanceof Error ? e.message : String(e)}` }),
          isError: true,
        }
      }
    },
  }
}
