import type { ContextReductionMode } from "./manager.js"

export type ContextPolicyMode = ContextReductionMode | "compact"

export interface ContextPolicy {
  mode: ContextPolicyMode
  triggerRatio: number
  targetRatio: number
}

export const DEFAULT_CONTEXT_POLICY: ContextPolicy = {
  mode: "trim",
  triggerRatio: 0.70,
  targetRatio: 0.30,
}

export function validateContextPolicy(policy: Partial<ContextPolicy>): boolean {
  if (policy.mode !== undefined && policy.mode !== "trim" && policy.mode !== "compress" && policy.mode !== "compact") {
    return false
  }

  if (policy.triggerRatio !== undefined) {
    if (typeof policy.triggerRatio !== "number" || policy.triggerRatio < 0.1 || policy.triggerRatio > 0.95) {
      return false
    }
  }

  if (policy.targetRatio !== undefined) {
    if (typeof policy.targetRatio !== "number" || policy.targetRatio < 0.05 || policy.targetRatio > 0.95) {
      return false
    }
  }

  if (policy.triggerRatio !== undefined && policy.targetRatio !== undefined) {
    if (policy.targetRatio >= policy.triggerRatio) {
      return false
    }
  }

  return true
}

export function mergeContextPolicy(
  base: ContextPolicy,
  override: Partial<ContextPolicy>
): ContextPolicy {
  if (!validateContextPolicy(override)) {
    return { ...base }
  }

  const merged = { ...base, ...override }

  if (merged.targetRatio >= merged.triggerRatio) {
    merged.targetRatio = Math.max(0.05, merged.triggerRatio - 0.05)
  }

  return merged
}
