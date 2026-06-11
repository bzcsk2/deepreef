/**
 * Permission Rules Engine — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/permission/index.ts
 *
 * Pattern-based permission evaluation with wildcard matching.
 * Last-match-wins semantics for rule evaluation.
 */

import type { PermissionAction, PermissionDecision, PermissionRule } from "./types.js"

/* ── Wildcard Matching ── */

/**
 * Match a string against a wildcard pattern.
 * Supports * (any characters) and ? (single character).
 */
function matchWildcard(pattern: string, value: string): boolean {
  if (pattern === "*") return true
  if (pattern === value) return true

  // Convert wildcard pattern to regex
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars (except * and ?)
    .replace(/\*/g, ".*") // * -> .*
    .replace(/\?/g, ".")  // ? -> .
    + "$"

  try {
    const regex = new RegExp(regexStr)
    return regex.test(value)
  } catch {
    return pattern === value
  }
}

/* ── Rule Evaluation ── */

/**
 * Evaluate a permission request against one or more rulesets.
 * Uses "last match wins" semantics — later rulesets override earlier ones.
 * Falls back to "ask" if no rule matches.
 *
 * Adapted from OpenCode's evaluate() function.
 */
export function evaluateRules(
  permission: string,
  pattern: string,
  ...rulesets: PermissionRule[][]
): PermissionDecision {
  let decision: PermissionDecision = "ask"

  for (const ruleset of rulesets) {
    for (const rule of ruleset) {
      if (matchWildcard(rule.permission, permission) && matchWildcard(rule.pattern, pattern)) {
        decision = rule.action
      }
    }
  }

  return decision
}

/* ── Ruleset Construction ── */

/**
 * Flatten multiple rulesets into a single array.
 */
export function mergeRulesets(...rulesets: PermissionRule[][]): PermissionRule[] {
  return rulesets.flat()
}

/**
 * Convert PermissionConfig rules to PermissionRule array.
 */
export function fromConfig(rules: Array<{ permission: string; pattern?: string; action: PermissionAction }>): PermissionRule[] {
  return rules.map(rule => ({
    permission: rule.permission,
    pattern: rule.pattern ?? "*",
    action: rule.action,
    source: "config" as const,
  }))
}

/**
 * Get tools that are deny-only (all patterns denied).
 */
export function getDisabledTools(rules: PermissionRule[]): Set<string> {
  const disabled = new Set<string>()
  for (const rule of rules) {
    if (rule.action === "deny" && rule.pattern === "*") {
      disabled.add(rule.permission)
    }
  }
  return disabled
}

/**
 * Create a session-approved ruleset from an "always" reply.
 * These rules are temporary and only last for the current session.
 */
export function createSessionRule(
  permission: string,
  pattern: string,
): PermissionRule {
  return {
    permission,
    pattern,
    action: "allow",
    source: "session",
  }
}
