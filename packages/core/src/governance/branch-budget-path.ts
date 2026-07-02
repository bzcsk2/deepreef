import path from "node:path"

import { isUnderRoot, resolveAgainstWorkspace } from "./path-scope.js"

/**
 * BranchBudget 统一使用 workspace 相对路径（POSIX `/`），合并绝对/相对重复键。
 */
export function canonicalBudgetPath(
  workspaceRoot: string | undefined,
  rawPath: string | undefined | null,
): string | undefined {
  if (!rawPath?.trim()) return undefined
  const trimmed = rawPath.trim()
  if (!workspaceRoot?.trim()) {
    return trimmed.replace(/\\/g, "/")
  }

  const abs = resolveAgainstWorkspace(trimmed, workspaceRoot)
  if (!isUnderRoot(abs, workspaceRoot)) {
    return trimmed.replace(/\\/g, "/")
  }

  const rel = path.relative(path.resolve(workspaceRoot), abs)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return trimmed.replace(/\\/g, "/")
  }
  return rel.replace(/\\/g, "/")
}

/**
 * checkpoint 恢复后合并同文件不同路径表示的编辑计数。
 *
 * G5: 原 Math.max 会低估实际编辑次数。同一文件出现两个不同键（相对路径 vs
 * 绝对路径）必然源自两次独立的 recordFileEdit 调用（即两次真实编辑），
 * 应累加而非取较大值。幂等性由 bindWorkspaceRoot 的同 root 早退 +
 * applySnapshot 的整体替换 map 保证，sum 不会在重复调用下累加。
 */
export function mergeBudgetPathMap(
  map: Map<string, number>,
  workspaceRoot: string,
): Map<string, number> {
  const merged = new Map<string, number>()
  for (const [rawKey, count] of map) {
    const key = canonicalBudgetPath(workspaceRoot, rawKey) ?? rawKey.replace(/\\/g, "/")
    merged.set(key, (merged.get(key) ?? 0) + count)
  }
  return merged
}

/** 合并 bypass 路径集合时同样规范化键（保留 API 供未来扩展）。 */
export function mergeBudgetPathSet(
  paths: Set<string>,
  workspaceRoot: string,
): Set<string> {
  const merged = new Set<string>()
  for (const raw of paths) {
    merged.add(canonicalBudgetPath(workspaceRoot, raw) ?? raw.replace(/\\/g, "/"))
  }
  return merged
}
