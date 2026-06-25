import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import type { AgentRunScore } from "./types.js"

export interface AgentScoreStoreOptions {
  basePath?: string
}

export class AgentScoreStore {
  private basePath: string

  constructor(options: AgentScoreStoreOptions = {}) {
    this.basePath = options.basePath ?? resolve(process.cwd(), ".deepreef", "scores")
  }

  private pathForWorkflow(workflowId: string): string {
    return resolve(this.basePath, `${safeName(workflowId)}.jsonl`)
  }

  append(score: AgentRunScore): void {
    const workflowId = score.workflowId ?? "benchmark"
    const path = this.pathForWorkflow(workflowId)
    mkdirSync(dirname(path), { recursive: true })
    const line = JSON.stringify(score)
    const existing = existsSync(path) ? readFileSync(path, "utf8") : ""
    writeFileSync(path, existing + line + "\n", "utf8")
  }

  list(workflowId: string): AgentRunScore[] {
    const path = this.pathForWorkflow(workflowId)
    if (!existsSync(path)) return []
    return readFileSync(path, "utf8")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AgentRunScore]
        } catch {
          return []
        }
      })
  }

  latest(workflowId: string): AgentRunScore | null {
    const scores = this.list(workflowId)
    return scores.at(-1) ?? null
  }
}

export class EvalReportStore {
  private basePath: string

  constructor(basePath?: string) {
    this.basePath = basePath ?? resolve(process.cwd(), ".deepreef", "evals")
  }

  listEvalRuns(): string[] {
    if (!existsSync(this.basePath)) return []
    return readdirSync(this.basePath)
      .filter(name => name.startsWith("eval-"))
      .sort()
      .reverse()
  }

  loadMeta(evalRunId: string): Record<string, unknown> | null {
    const path = resolve(this.basePath, evalRunId, "meta.json")
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, "utf8"))
    } catch {
      return null
    }
  }

  loadSummary(evalRunId: string): Record<string, unknown> | null {
    const path = resolve(this.basePath, evalRunId, "summary.json")
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, "utf8"))
    } catch {
      return null
    }
  }

  loadLeaderboard(evalRunId: string): Record<string, unknown> | null {
    const path = resolve(this.basePath, evalRunId, "leaderboard.json")
    if (!existsSync(path)) return null
    try {
      return JSON.parse(readFileSync(path, "utf8"))
    } catch {
      return null
    }
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "unknown"
}

import { readdirSync } from "node:fs"
