/**
 * Subagent permission system — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/agent/subagent-permissions.ts
 *
 * Handles permission inheritance from parent to child agents,
 * and the bubble mechanism for requesting parent approval.
 */

import type { SubagentPermissionMode } from "./types.js"
import type { PermissionRule, PermissionRequest } from "../permission/types.js"

/* ── Tool Tier Classification ── */

const WRITE_TOOLS = new Set(["write_file", "edit", "NotebookEdit", "patch"])
const EXEC_TOOLS = new Set(["bash", "exec"])

export function getToolTier(toolName: string): "read" | "write" | "exec" {
  if (EXEC_TOOLS.has(toolName)) return "exec"
  if (WRITE_TOOLS.has(toolName)) return "write"
  return "read"
}

/* ── Permission Check Result ── */

export interface SubagentPermissionCheck {
  allowed: boolean
  reason?: string
  /** If true, the request should be bubbled to the parent */
  bubble?: boolean
}

/**
 * Check if a subagent is allowed to use a tool based on its permission mode.
 */
export function checkSubagentPermission(
  toolName: string,
  permissionMode: SubagentPermissionMode,
): SubagentPermissionCheck {
  switch (permissionMode) {
    case "readonly": {
      const tier = getToolTier(toolName)
      if (tier === "write" || tier === "exec") {
        return { allowed: false, reason: `Subagent in readonly mode cannot use tool: ${toolName}` }
      }
      return { allowed: true }
    }

    case "denyExec": {
      const tier = getToolTier(toolName)
      if (tier === "exec") {
        return { allowed: false, reason: `Subagent in denyExec mode cannot run exec tool: ${toolName}` }
      }
      return { allowed: true }
    }

    case "acceptEdits": {
      const tier = getToolTier(toolName)
      if (tier === "exec") {
        // exec still needs approval via bubble
        return { allowed: false, bubble: true, reason: `Subagent in acceptEdits mode needs parent approval for exec: ${toolName}` }
      }
      return { allowed: true }
    }

    case "bubble": {
      // All tools need parent approval
      return { allowed: false, bubble: true, reason: `Subagent in bubble mode needs parent approval for: ${toolName}` }
    }

    default:
      return { allowed: false, reason: `Unknown permission mode: ${permissionMode}` }
  }
}

/* ── Permission Inheritance ── */

/**
 * Derive subagent permissions from parent permissions.
 * Adapted from OpenCode's deriveSubagentSessionPermission.
 *
 * Rules:
 * 1. Forward parent's deny rules (e.g., Plan Mode restrictions)
 * 2. Forward parent's external_directory rules
 * 3. Forward all deny rules from parent session
 * 4. Add default todowrite deny if not already permitted
 * 5. Add default task deny if not already permitted
 */
export function deriveSubagentPermissions(input: {
  parentRules: PermissionRule[]
  parentAgent: string
  subagentName: string
  subagentPermissionMode: SubagentPermissionMode
}): PermissionRule[] {
  const rules: PermissionRule[] = []

  // Forward parent's deny rules
  for (const rule of input.parentRules) {
    if (rule.action === "deny") {
      rules.push({
        ...rule,
        source: "agent",
      })
    }
  }

  // Forward external_directory rules from parent
  for (const rule of input.parentRules) {
    if (rule.permission === "external_directory") {
      rules.push({
        ...rule,
        source: "agent",
      })
    }
  }

  // Add default deny rules based on subagent mode
  if (input.subagentPermissionMode === "readonly") {
    // Deny write and exec
    rules.push(
      { permission: "write_file", pattern: "*", action: "deny", source: "agent" },
      { permission: "edit", pattern: "*", action: "deny", source: "agent" },
      { permission: "bash", pattern: "*", action: "deny", source: "agent" },
    )
  } else if (input.subagentPermissionMode === "denyExec") {
    // Deny exec only
    rules.push(
      { permission: "bash", pattern: "*", action: "deny", source: "agent" },
    )
  }

  // Add default todowrite deny if not already permitted
  const hasTodowritePermit = input.parentRules.some(
    r => r.permission === "todowrite" && r.action === "allow"
  )
  if (!hasTodowritePermit) {
    rules.push({
      permission: "todowrite",
      pattern: "*",
      action: "deny",
      source: "agent",
    })
  }

  // Add default task deny if not already permitted
  const hasTaskPermit = input.parentRules.some(
    r => r.permission === "task" && r.action === "allow"
  )
  if (!hasTaskPermit) {
    rules.push({
      permission: "task",
      pattern: "*",
      action: "deny",
      source: "agent",
    })
  }

  return rules
}

/* ── Bubble Request ── */

/**
 * Create a permission request for bubble to parent.
 */
export function createBubbleRequest(input: {
  sessionId: string
  toolName: string
  toolCallId: string
  patterns: string[]
  metadata: Record<string, unknown>
  parentSessionId: string
}): PermissionRequest {
  return {
    id: `bubble_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: input.sessionId,
    permission: input.toolName,
    patterns: input.patterns,
    always: [],
    metadata: input.metadata,
    tool: { toolCallId: input.toolCallId, toolName: input.toolName },
    parentSessionId: input.parentSessionId,
  }
}
