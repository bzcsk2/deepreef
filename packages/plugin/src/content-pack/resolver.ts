import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import type {
  ContentPackManifest, ResolvedContentPack, ContentAsset,
  ContentPackDiagnostic, ContentPackPluginOptions, InstallModule,
} from "./types.js"
import { findManifest } from "./discovery.js"
import { parseManifest } from "./parser.js"
import { loadEccManifests } from "./ecc-manifests.js"

const DEFAULT_OPTIONS: ContentPackPluginOptions = {
  type: "auto",
  target: "deepicode",
  targetMode: "compatible",
  skills: { enabled: true },
  agents: { enabled: true },
  rules: { enabled: true, mode: "system" },
  commands: { enabled: false, mode: "off" },
  hooks: { enabled: false },
  mcp: { enabled: false, allowStdio: true, allowHttp: false, allowNpx: false, allowPlaceholderEnv: false },
}

export function resolveContentPack(
  specPath: string,
  rawOptions: ContentPackPluginOptions,
): ResolvedContentPack {
  const options = { ...DEFAULT_OPTIONS, ...rawOptions }
  const diagnostics: ContentPackDiagnostic[] = []
  const pluginId = specPath.split("/").pop() ?? "unknown"

  // Find manifest
  const { manifestPath, sourceKind } = findManifest(specPath)
  if (!manifestPath) {
    diagnostics.push({ type: "error", pluginId, message: "No manifest file found" })
    return emptyResult(pluginId, specPath, diagnostics)
  }

  const result = parseManifest(manifestPath, specPath)
  if (result.error || !result.manifest) {
    diagnostics.push({ type: "error", pluginId, message: `Failed to parse manifest: ${result.error}` })
    return emptyResult(pluginId, specPath, diagnostics)
  }

  const manifest = result.manifest

  // Load ECC-specific manifests if available
  const ecc = loadEccManifests(specPath)
  diagnostics.push(...ecc.diagnostics)

  const mergedProfiles = manifest.profiles ?? ecc.profiles
  const mergedModules = manifest.modules ?? ecc.modules
  const mergedComponents = manifest.components ?? ecc.components

  // Select modules based on profile + include/exclude
  const selectedModules = selectModules(mergedProfiles, mergedModules, mergedComponents, options, pluginId, diagnostics)

  // Resolve module paths to assets
  const assets = resolveAssets(manifest, selectedModules, mergedModules, options, pluginId, diagnostics)

  return {
    id: manifest.id,
    name: manifest.name,
    rootDir: specPath,
    profile: options.profile,
    modules: [...selectedModules],
    components: [...(options.include ?? [])],
    assets,
    diagnostics,
  }
}

function selectModules(
  profiles: any,
  modules: any,
  components: any,
  options: ContentPackPluginOptions,
  pluginId: string,
  diagnostics: ContentPackDiagnostic[],
): Set<string> {
  const selected = new Set<string>()

  // Profile-based selection
  if (profiles && options.profile) {
    const profile = Array.isArray(profiles.profiles)
      ? profiles.profiles.find((p: any) => p.id === options.profile)
      : undefined
    if (profile) {
      for (const m of profile.modules ?? []) selected.add(m)
    } else {
      diagnostics.push({ type: "warn", pluginId, message: `Profile "${options.profile}" not found` })
    }
  }

  // Direct module options
  for (const m of options.modules ?? []) selected.add(m)

  // Include components
  if (components && options.include) {
    for (const compId of options.include) {
      const comp = Array.isArray(components.components)
        ? components.components.find((c: any) => c.id === compId)
        : undefined
      if (comp) {
        for (const m of comp.modules ?? []) selected.add(m)
      }
    }
  }

  // Expand dependencies
  if (modules && Array.isArray(modules.modules)) {
    const deps = new Set<string>()
    for (const mId of selected) {
      expandDeps(mId, modules.modules, deps)
    }
    for (const d of deps) selected.add(d)
  }

  // Exclude components
  if (components && options.exclude) {
    for (const compId of options.exclude) {
      const comp = Array.isArray(components.components)
        ? components.components.find((c: any) => c.id === compId)
        : undefined
      if (comp) {
        for (const m of comp.modules ?? []) selected.delete(m)
      }
    }
  }

  // Filter by target if strict
  if (options.targetMode === "strict" && modules && Array.isArray(modules.modules)) {
    for (const mId of [...selected]) {
      const mod = modules.modules.find((m: any) => m.id === mId)
      if (mod && mod.targets && !mod.targets.includes(options.target ?? "deepicode")) {
        selected.delete(mId)
        diagnostics.push({ type: "info", pluginId, message: `Module "${mId}" skipped: not compatible with target "${options.target}"` })
      }
    }
  }

  return selected
}

function expandDeps(mId: string, allModules: InstallModule[], deps: Set<string>): void {
  const mod = allModules.find((m) => m.id === mId)
  if (!mod || !mod.dependencies) return
  for (const dep of mod.dependencies) {
    if (!deps.has(dep)) {
      deps.add(dep)
      expandDeps(dep, allModules, deps)
    }
  }
}

function resolveAssets(
  manifest: ContentPackManifest,
  selectedModules: Set<string>,
  allModules: any,
  options: ContentPackPluginOptions,
  pluginId: string,
  diagnostics: ContentPackDiagnostic[],
): ResolvedContentPack["assets"] {
  const assets: ResolvedContentPack["assets"] = {
    skills: [],
    agents: [],
    rules: [],
    commands: [],
    hooks: [],
    mcp: [],
  }

  // Find which modules have which path types
  const modulePaths: Record<string, Record<string, string[]>> = {}
  if (allModules && Array.isArray(allModules.modules)) {
    for (const mod of allModules.modules) {
      if (selectedModules.has(mod.id) && mod.paths) {
        modulePaths[mod.id] = mod.paths
      }
    }
  }

  // Collect unique directories/files per kind
  const skillDirs = new Set(manifest.skillDirs)
  const agentFiles = new Set(manifest.agentFiles)
  const ruleFiles = new Set(manifest.ruleFiles)
  const commandFiles = new Set(manifest.commandFiles)

  // Add module paths for selected modules
  for (const [, paths] of Object.entries(modulePaths)) {
    for (const [kind, files] of Object.entries(paths)) {
      for (const f of files) {
        const fullPath = resolve(manifest.rootDir, f)
        if (kind === "skills" || kind === "skill") skillDirs.add(fullPath)
        else if (kind === "agents" || kind === "agent") agentFiles.add(fullPath)
        else if (kind === "rules" || kind === "rule") ruleFiles.add(fullPath)
        else if (kind === "commands" || kind === "command") commandFiles.add(fullPath)
      }
    }
  }

  // Guard against path traversal
  for (const dir of skillDirs) {
    if (!dir.startsWith(manifest.rootDir)) {
      diagnostics.push({ type: "error", pluginId, message: `Skill directory path traversal blocked: ${dir}` })
      continue
    }
    if (options.skills?.enabled !== false) {
      assets.skills.push({ kind: "skill", id: dir, path: dir, sourcePluginId: pluginId, enabledByDefault: true })
    }
  }

  for (const file of agentFiles) {
    if (!file.startsWith(manifest.rootDir)) {
      diagnostics.push({ type: "error", pluginId, message: `Agent file path traversal blocked: ${file}` })
      continue
    }
    if (options.agents?.enabled !== false) {
      const id = file.split("/").pop()?.replace(/\.md$/i, "") ?? "unknown"
      assets.agents.push({ kind: "agent", id, path: file, sourcePluginId: pluginId, enabledByDefault: true })
    }
  }

  for (const file of ruleFiles) {
    if (!file.startsWith(manifest.rootDir)) {
      diagnostics.push({ type: "error", pluginId, message: `Rule file path traversal blocked: ${file}` })
      continue
    }
    if (options.rules?.enabled !== false) {
      const id = file.split("/").pop() ?? "unknown"
      assets.rules.push({ kind: "rule", id, path: file, sourcePluginId: pluginId, enabledByDefault: true })
    }
  }

  for (const file of commandFiles) {
    if (!file.startsWith(manifest.rootDir)) {
      diagnostics.push({ type: "error", pluginId, message: `Command file path traversal blocked: ${file}` })
      continue
    }
    if (options.commands?.enabled === true) {
      const id = file.split("/").pop()?.replace(/\.md$/i, "") ?? "unknown"
      assets.commands.push({ kind: "command", id, path: file, sourcePluginId: pluginId, enabledByDefault: true })
    }
  }

  // Hooks
  for (const file of manifest.hookFiles ?? []) {
    if (options.hooks?.enabled === true) {
      assets.hooks.push({ kind: "hook", id: file, path: file, sourcePluginId: pluginId, enabledByDefault: false })
    }
  }

  // MCP
  for (const src of manifest.mcpServers ?? []) {
    if (options.mcp?.enabled === true) {
      assets.mcp.push({ kind: "mcp", id: src, path: src, sourcePluginId: pluginId, enabledByDefault: false })
    }
  }

  return assets
}

function emptyResult(id: string, rootDir: string, diagnostics: ContentPackDiagnostic[]): ResolvedContentPack {
  return {
    id,
    name: id,
    rootDir,
    modules: [],
    components: [],
    assets: { skills: [], agents: [], rules: [], commands: [], hooks: [], mcp: [] },
    diagnostics,
  }
}
