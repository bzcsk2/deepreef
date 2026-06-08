import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import type { InstallProfiles, InstallModules, InstallComponents, ContentPackDiagnostic } from "./types.js"

export interface EccManifests {
  profiles?: InstallProfiles
  modules?: InstallModules
  components?: InstallComponents
  diagnostics: ContentPackDiagnostic[]
}

export function loadEccManifests(rootDir: string): EccManifests {
  const diagnostics: ContentPackDiagnostic[] = []
  const pluginId = rootDir.split("/").pop() ?? "ecc"

  const profiles = tryLoadJson<InstallProfiles>(resolve(rootDir, "manifests", "install-profiles.json"), "install-profiles.json", pluginId, diagnostics)
  const modules = tryLoadJson<InstallModules>(resolve(rootDir, "manifests", "install-modules.json"), "install-modules.json", pluginId, diagnostics)
  const components = tryLoadJson<InstallComponents>(resolve(rootDir, "manifests", "install-components.json"), "install-components.json", pluginId, diagnostics)

  return { profiles, modules, components, diagnostics }
}

function tryLoadJson<T>(path: string, name: string, pluginId: string, diagnostics: ContentPackDiagnostic[]): T | undefined {
  try {
    if (!existsSync(path)) return undefined
    const raw = readFileSync(path, "utf8")
    return JSON.parse(raw) as T
  } catch (e) {
    diagnostics.push({
      type: "warn",
      pluginId,
      message: `Could not load ${name}`,
      detail: e instanceof Error ? e.message : String(e),
    })
    return undefined
  }
}
