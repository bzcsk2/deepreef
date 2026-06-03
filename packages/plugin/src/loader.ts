import { pluginSource, type PluginConfigItem } from "./config.js"

export interface PluginModule {
  id: string
  server: (...args: unknown[]) => unknown
  [key: string]: unknown
}

export interface PluginLoaded extends PluginConfigItem {
  mod: PluginModule
}

export type PluginLoadError =
  | { type: "import_failed"; spec: string; cause: string }
  | { type: "missing_id"; spec: string }
  | { type: "server_not_function"; spec: string }
  | { type: "duplicate_id"; id: string; spec: string }
  | { type: "load_error"; spec: string; cause: string }

export interface PluginLoadResult {
  loaded: PluginLoaded[]
  errors: PluginLoadError[]
}

async function importPlugin(spec: string): Promise<{ mod: unknown; error?: string }> {
  try {
    const mod = await import(spec)
    const exported = mod.default ?? mod
    return { mod: exported }
  } catch (e) {
    return { mod: null, error: e instanceof Error ? e.message : String(e) }
  }
}

function validatePlugin(mod: unknown, spec: string): { plugin?: PluginModule; error?: PluginLoadError } {
  if (!mod || typeof mod !== "object") {
    return { error: { type: "import_failed", spec, cause: "Module is not an object" } }
  }

  const record = mod as Record<string, unknown>

  if (typeof record.id !== "string" || !record.id) {
    return { error: { type: "missing_id", spec } }
  }

  if (typeof record.server !== "function") {
    return { error: { type: "server_not_function", spec } }
  }

  return {
    plugin: {
      id: record.id,
      server: record.server as (...args: unknown[]) => unknown,
    },
  }
}

export async function loadPlugins(items: PluginConfigItem[]): Promise<PluginLoadResult> {
  const loaded: PluginLoaded[] = []
  const errors: PluginLoadError[] = []
  const seenIds = new Set<string>()

  for (const item of items) {
    if (item.source === "npm") {
      errors.push({ type: "import_failed", spec: item.spec, cause: "npm_plugin_not_installed" })
      continue
    }

    const { mod, error: importError } = await importPlugin(item.spec)
    if (importError) {
      errors.push({ type: "import_failed", spec: item.spec, cause: importError })
      continue
    }

    const { plugin, error: validateError } = validatePlugin(mod, item.spec)
    if (validateError) {
      errors.push(validateError)
      continue
    }

    if (seenIds.has(plugin!.id)) {
      errors.push({ type: "duplicate_id", id: plugin!.id, spec: item.spec })
      continue
    }

    seenIds.add(plugin!.id)
    loaded.push({ ...item, mod: plugin! })
  }

  return { loaded, errors }
}
