export type PluginKind = "runtime" | "content-pack"

export type ManifestSourceKind = "deepicode" | "codex" | "claude" | "ecc"

export interface ContentPackManifest {
  id: string
  name: string
  version?: string
  description?: string
  rootDir: string
  sourceManifestPath: string
  sourceKind: ManifestSourceKind
  skillDirs: string[]
  agentFiles: string[]
  ruleFiles: string[]
  commandFiles: string[]
  hookFiles?: string[]
  mcpServers?: string[]
  profiles?: InstallProfiles
  modules?: InstallModules
  components?: InstallComponents
  metadata?: Record<string, unknown>
}

export interface InstallProfile {
  id: string
  description?: string
  modules: string[]
}

export interface InstallProfiles {
  profiles: InstallProfile[]
}

export interface InstallModule {
  id: string
  description?: string
  dependencies?: string[]
  paths?: Record<string, string[]>
  targets?: string[]
  kind?: string
}

export interface InstallModules {
  modules: InstallModule[]
}

export interface InstallComponent {
  id: string
  description?: string
  modules: string[]
}

export interface InstallComponents {
  components: InstallComponent[]
}

export interface ContentAsset {
  kind: "skill" | "agent" | "rule" | "command" | "hook" | "mcp"
  id: string
  path: string
  sourcePluginId: string
  moduleId?: string
  componentId?: string
  enabledByDefault: boolean
}

export interface ContentPackDiagnostic {
  type: "info" | "warn" | "error"
  pluginId: string
  message: string
  detail?: string
}

export interface ResolvedContentPack {
  id: string
  name: string
  rootDir: string
  profile?: string
  modules: string[]
  components: string[]
  assets: {
    skills: ContentAsset[]
    agents: ContentAsset[]
    rules: ContentAsset[]
    commands: ContentAsset[]
    hooks: ContentAsset[]
    mcp: ContentAsset[]
  }
  diagnostics: ContentPackDiagnostic[]
}

export interface ContentPackPluginOptions {
  type?: "runtime" | "content-pack" | "auto"
  manifest?: string
  profile?: string
  target?: string
  targetMode?: "strict" | "compatible" | "ignore"
  modules?: string[]
  include?: string[]
  exclude?: string[]
  skills?: { enabled?: boolean }
  agents?: { enabled?: boolean }
  rules?: { enabled?: boolean; mode?: "system" | "skill" | "off" }
  commands?: { enabled?: boolean; mode?: "skill" | "off" }
  hooks?: {
    enabled?: boolean
    profile?: "minimal" | "standard" | "strict"
    allowCommandHooks?: boolean
    allowHttpHooks?: boolean
    allowPromptHooks?: boolean
    allowlist?: string[]
    denylist?: string[]
  }
  mcp?: {
    enabled?: boolean
    allowStdio?: boolean
    allowHttp?: boolean
    allowNpx?: boolean
    allowPlaceholderEnv?: boolean
    servers?: string[]
  }
}
