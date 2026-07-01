import { resolve, dirname, relative, isAbsolute, sep } from "node:path"
import { realpath } from "node:fs/promises"

export class PathContainmentError extends Error {
  constructor(path: string) {
    super(`Path is outside the project directory: ${path}`)
    this.name = "PathContainmentError"
  }
}

/**
 * Resolve user-provided path within cwd, with symlink containment checking.
 *
 * - If the target exists: resolves symlinks via realpath, verifies it's under cwd.
 * - If it does not exist: resolves the nearest existing parent to check containment,
 *   then returns the original resolved path (parent symlinks resolved, suffix appended).
 * - Throws PathContainmentError if the resolved path escapes cwd.
 */
export async function resolvePath(userPath: string, cwd: string): Promise<string> {
  const resolved = resolve(cwd, userPath)
  const realCwd = await realpath(cwd)

  try {
    const real = await realpath(resolved)
    ensureContained(real, realCwd)
    return real
  } catch {
    if (resolved === realCwd) return realCwd
    // Path doesn't exist yet — resolve nearest existing parent
    let parent = dirname(resolved)
    while (parent !== dirname(parent)) {
      try {
        const realParent = await realpath(parent)
        ensureContained(realParent, realCwd)
        const suffix = resolved.slice(parent.length)
        const result = resolve(realParent, suffix.replace(/^[/\\]/, ""))
        ensureContained(result, realCwd)
        return result
      } catch {
        parent = dirname(parent)
      }
    }
    // Fallback: cwd itself is the last parent
    ensureContained(resolved, realCwd)
    return resolved
  }
}

function ensureContained(absPath: string, basePath: string): void {
  const rel = relative(basePath, absPath)
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathContainmentError(absPath)
  }
}
