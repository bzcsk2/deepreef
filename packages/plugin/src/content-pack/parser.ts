import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { ContentPackManifest } from "./types.js"

export interface ParseResult {
  manifest?: ContentPackManifest
  error?: string
}

export function parseManifest(manifestPath: string, rootDir: string): ParseResult {
  try {
    const raw = readFileSync(manifestPath, "utf8")
    const data = JSON.parse(raw)

    if (typeof data !== "object" || data === null) {
      return { error: "Manifest is not an object" }
    }

    const id = data.id ?? data.name ?? rootDir.split("/").pop() ?? "unknown"
    const name = data.name ?? id

    const skillDirs: string[] = []
    const agentFiles: string[] = []
    const ruleFiles: string[] = []
    const commandFiles: string[] = []

    // Discover default directories
    const defaultSkillsDir = resolve(rootDir, "skills")
    if (existsSync(defaultSkillsDir)) {
      skillDirs.push(defaultSkillsDir)
    }
    const defaultAgentsDir = resolve(rootDir, "agents")
    if (existsSync(defaultAgentsDir)) {
      try {
        for (const f of readdirSync(defaultAgentsDir)) {
          if (f.endsWith(".md")) {
            agentFiles.push(resolve(defaultAgentsDir, f))
          }
        }
      } catch {}
    }
    const defaultRulesDir = resolve(rootDir, "rules")
    if (existsSync(defaultRulesDir)) {
      try {
        for (const f of readdirSync(defaultRulesDir)) {
          ruleFiles.push(resolve(defaultRulesDir, f))
        }
      } catch {}
    }
    const defaultCommandsDir = resolve(rootDir, "commands")
    if (existsSync(defaultCommandsDir)) {
      try {
        for (const f of readdirSync(defaultCommandsDir)) {
          if (f.endsWith(".md")) {
            commandFiles.push(resolve(defaultCommandsDir, f))
          }
        }
      } catch {}
    }

    // Add manifest-declared assets
    if (Array.isArray(data.skills)) {
      for (const s of data.skills) {
        if (typeof s === "string") {
          const p = resolve(rootDir, s)
          const dir = existsSync(p) && statSync(p).isDirectory() ? p : dirname(p)
          if (!skillDirs.includes(dir)) skillDirs.push(dir)
        }
      }
    }
    if (Array.isArray(data.agents)) {
      for (const a of data.agents) {
        if (typeof a === "string") {
          agentFiles.push(resolve(rootDir, a))
        }
      }
    }
    if (Array.isArray(data.rules)) {
      for (const r of data.rules) {
        if (typeof r === "string") {
          ruleFiles.push(resolve(rootDir, r))
        }
      }
    }
    if (Array.isArray(data.commands)) {
      for (const c of data.commands) {
        if (typeof c === "string") {
          commandFiles.push(resolve(rootDir, c))
        }
      }
    }

    // Hook files
    const hookFiles: string[] = []
    const hooksJsonPath = resolve(rootDir, "hooks", "hooks.json")
    if (existsSync(hooksJsonPath)) {
      hookFiles.push(hooksJsonPath)
    }
    if (Array.isArray(data.hooks)) {
      for (const h of data.hooks) {
        if (typeof h === "string") {
          hookFiles.push(resolve(rootDir, h))
        }
      }
    }

    // MCP servers from manifest or .mcp.json
    const mcpServers: string[] = []
    if (data.mcpServers) {
      mcpServers.push(manifestPath)
    }
    const mcpJsonPath = resolve(rootDir, ".mcp.json")
    if (existsSync(mcpJsonPath)) {
      mcpServers.push(mcpJsonPath)
    }

    const sourceKind = manifestPath.includes("deepicode") ? "deepicode"
      : manifestPath.includes("codex") ? "codex"
      : "claude"

    return {
      manifest: {
        id,
        name,
        rootDir,
        sourceManifestPath: manifestPath,
        sourceKind,
        skillDirs,
        agentFiles,
        ruleFiles,
        commandFiles,
        hookFiles,
        mcpServers,
        profiles: data.profiles ?? data.installProfiles,
        modules: data.modules ?? data.installModules,
        components: data.components ?? data.installComponents,
        metadata: data,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

function dirname(p: string): string {
  return p.substring(0, p.lastIndexOf("/")) || "/"
}
