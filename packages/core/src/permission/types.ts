/**
 * Permission types — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/permission/index.ts
 * Source: packages/core/src/v1/config/permission.ts
 *
 * Defines the permission rule system, request lifecycle, and mode configuration.
 */

/* ── Permission Actions ── */

export type PermissionAction = "allow" | "ask" | "deny"

/* ── Permission Modes ── */

export type PermissionMode = "safe" | "balanced" | "yolo"

/* ── Permission Rules ── */

export interface PermissionRule {
  /** Permission name (e.g., "read", "edit", "bash", "external_directory") */
  permission: string
  /** Resource pattern (e.g., "*.ts", "/path/to/file", "cd *") */
  pattern: string
  /** Action to take when this rule matches */
  action: PermissionAction
  /** Source of the rule */
  source: "hard" | "config" | "agent" | "session"
}

/* ── Permission Request ── */

export interface PermissionRequest {
  /** Unique request ID */
  id: string
  /** Session ID this request belongs to */
  sessionId: string
  /** Permission name being requested */
  permission: string
  /** Resource patterns being accessed */
  patterns: string[]
  /** Suggested "always" patterns for the user */
  always: string[]
  /** Additional metadata (e.g., diff for edits, command for shell) */
  metadata: Record<string, unknown>
  /** Tool call information */
  tool?: { toolCallId: string; toolName: string }
  /** Parent session ID for subagent requests */
  parentSessionId?: string
}

/* ── Permission Reply ── */

export type PermissionReply = "once" | "always" | "reject"

/* ── Permission Decision ── */

export type PermissionDecision = "allow" | "deny" | "ask"

/* ── Permission Check Result ── */

export interface PermissionCheck {
  decision: PermissionDecision
  reason?: string
  rule?: PermissionRule
}

/* ── Permission Configuration ── */

export interface PermissionConfig {
  /** Global default action for unmatched permissions */
  default?: PermissionAction
  /** Mode override (safe/balanced/yolo) */
  mode?: PermissionMode
  /** Per-permission rules */
  rules?: Array<{
    permission: string
    pattern?: string
    action: PermissionAction
  }>
}

/* ── Shell Scan Result ── */

export interface ShellScan {
  /** External directories accessed */
  dirs: Set<string>
  /** Command patterns */
  patterns: Set<string>
  /** Suggested "always" patterns */
  always: Set<string>
}

/* ── Permission Service Interface ── */

export interface PermissionServiceInterface {
  /** Request permission from the user */
  ask(input: {
    sessionId: string
    permission: string
    patterns: string[]
    always?: string[]
    metadata?: Record<string, unknown>
    tool?: { toolCallId: string; toolName: string }
    parentSessionId?: string
  }): Promise<PermissionReply>

  /** Reply to a pending permission request */
  reply(input: { requestId: string; reply: PermissionReply; message?: string }): void

  /** List pending permission requests */
  list(sessionId?: string): PermissionRequest[]

  /** Reject all pending requests for a session */
  interrupt(sessionId?: string): void

  /** Shutdown and reject all pending requests */
  shutdown(): void
}

/* ── Permission Engine Interface ── */

export interface PermissionEngineInterface {
  /** Evaluate a permission request against rules */
  evaluate(permission: string, pattern: string): PermissionDecision

  /** Add a rule */
  addRule(rule: PermissionRule): void

  /** Remove rules matching a permission and optional pattern */
  removeRule(permission: string, pattern?: string): void

  /** Get all rules */
  getRules(): PermissionRule[]

  /** Clear all rules */
  clear(): void
}
