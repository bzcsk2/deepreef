import { spawn } from "node:child_process"
import * as os from "node:os"
import { resolve } from "node:path"
import type { AgentTool } from "../../core/src/interface.js"

const DENY_PATTERNS = [
  /\brm\s+(?:-[A-Za-z]*r[A-Za-z]*\s+.*\/\*|.*-[A-Za-z]*r[A-Za-z]*\s+\/)/, // catch rm -rf / or rm -rf /*
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bdd\b/,
  /\bfdisk\b/,
  /\bmkfs\.\w+\b/,
]

function isDenied(command: string): string | null {
  for (const p of DENY_PATTERNS) {
    if (p.test(command.trim())) return p.source
  }
  return null
}

export function createBashTool(): AgentTool {
  return {
    name: "bash",
    description: "Run a shell command (bash). Returns stdout+stderr (truncated).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
        cwd: { type: "string", description: "Working directory (optional)." },
        timeout_ms: { type: "number", description: "Timeout in milliseconds." },
        max_chars: { type: "number", description: "Max chars for combined output." },
      },
      required: ["command"],
    },
    concurrency: "exclusive",
    approval: "exec",
    async execute(args, ctx) {
      if (typeof args.command !== "string" || !args.command.trim()) {
        return { content: JSON.stringify({ error: "command is required" }), isError: true }
      }
      const command = args.command
      const denied = isDenied(command)
      if (denied) {
        return { content: JSON.stringify({ error: `Command denied: matches dangerous pattern /${denied}/` }), isError: true }
      }
      const cwd = typeof args.cwd === "string" ? resolve(ctx.cwd, args.cwd) : ctx.cwd
      const timeoutMs = typeof args.timeout_ms === "number" ? Math.max(0, Math.floor(args.timeout_ms)) : 30_000
      const maxChars = typeof args.max_chars === "number" ? Math.max(0, Math.floor(args.max_chars)) : 200_000

      const out = await runBash(command, cwd, timeoutMs, maxChars, ctx.signal)
      return { content: JSON.stringify(out), isError: out.exitCode !== 0, metadata: { exitCode: out.exitCode } }
    },
  }
}

async function runBash(command: string, cwd: string, timeoutMs: number, maxChars: number, signal?: AbortSignal): Promise<{
  command: string
  cwd: string
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}> {
  return await new Promise((resolve, reject) => {
    const isWindows = os.platform() === "win32"
    // Use detached to create a process group on Unix, so we can kill children (zombies)
    const child = spawn("bash", ["-lc", command], { cwd, detached: !isWindows })
    
    let stdout = ""
    let stderr = ""
    let timedOut = false
    let done = false

    const killChild = () => {
      try {
        if (!isWindows && child.pid) {
          process.kill(-child.pid, "SIGKILL")
        } else {
          child.kill("SIGKILL")
        }
      } catch {
        child.kill("SIGKILL")
      }
    }

    const finish = (exitCode: number) => {
      if (done) return
      done = true
      resolve({
        command,
        cwd,
        stdout: truncate(stdout, maxChars),
        stderr: truncate(stderr, maxChars),
        exitCode,
        timedOut,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      killChild()
      finish(124)
    }, timeoutMs)

    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        killChild()
        finish(130)
        return
      }
      signal.addEventListener("abort", () => {
        clearTimeout(timer)
        killChild()
        finish(130)
      }, { once: true })
    }

    child.stdout.on("data", (b) => { stdout += String(b) })
    child.stderr.on("data", (b) => { stderr += String(b) })
    child.on("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      finish(code ?? 0)
    })
  })
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n... [truncated: ${s.length - max} more chars]`
}
