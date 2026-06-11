/**
 * Internal context budget estimator — simple, deterministic, synchronous.
 * Used for fold/trim decisions only. Not for displaying token usage to users.
 */

export interface FoldDecision {
  action: "none" | "suggest" | "force"
  ratio: number
  used: number
  total: number
}

const MSG_OVERHEAD = 10
const CHARS_PER_TOKEN = 4

/**
 * Estimate context budget from messages (internal use only).
 * Returns estimated tokens for budget protection, not for user display.
 */
export function estimateTokens(messages: Array<{ role?: string; content?: string | null; reasoning_content?: string | null }>): number {
  let total = 0
  for (const msg of messages) {
    total += MSG_OVERHEAD
    if (msg.content) total += Math.ceil(msg.content.length / CHARS_PER_TOKEN)
    if (msg.reasoning_content) total += Math.ceil(msg.reasoning_content.length / CHARS_PER_TOKEN)
  }
  return total
}

export function getFoldDecision(used: number, total: number): FoldDecision {
  const ratio = total > 0 ? used / total : 0
  if (ratio <= 0.65) return { action: "none", ratio, used, total }
  if (ratio <= 0.80) return { action: "suggest", ratio, used, total }
  return { action: "force", ratio, used, total }
}
