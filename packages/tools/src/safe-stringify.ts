const MAX_SAFE_LENGTH = 200_000
const REPLACEMENT_CHAR_THRESHOLD = 0.05

export function safeStringify(obj: unknown, maxLen = MAX_SAFE_LENGTH): string {
  try {
    const raw = JSON.stringify(obj)
    if (raw.length <= maxLen) return raw
    return raw.slice(0, maxLen) + `\n... [truncated: ${raw.length - maxLen} more chars]`
  } catch {
    const fallback = String(obj)
    if (fallback.length <= maxLen) return fallback
    return fallback.slice(0, maxLen) + `\n... [truncated: ${fallback.length - maxLen} more chars]`
  }
}

export function hasBinaryEncoding(s: string): boolean {
  if (!s) return false
  let count = 0
  for (const ch of s) {
    if (ch === "\uFFFD") count++
  }
  return count / s.length > REPLACEMENT_CHAR_THRESHOLD
}
