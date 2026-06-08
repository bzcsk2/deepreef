import { readFileSync } from "node:fs"
import type { ContentAsset } from "./types.js"

const MAX_RULES_LENGTH = 16_000

export interface RuleResult {
  systemPrompt: string
  count: number
  skippedCount: number
  warnings: string[]
}

export function compileRules(rules: ContentAsset[]): RuleResult {
  const warnings: string[] = []
  let systemPrompt = ""
  let count = 0
  let skippedCount = 0

  for (const rule of rules) {
    try {
      const content = readFileSync(rule.path, "utf8")
      const trimmed = content.trim()
      
      // Extract frontmatter body if present
      const body = trimmed.startsWith("---")
        ? trimmed.replace(/^---\n[\s\S]*?\n---\n?/, "")
        : trimmed

      if (!body) {
        skippedCount++
        continue
      }

      const entry = `## ${rule.id}\n\n${body}\n`
      
      // Check if adding this would exceed the limit
      if (systemPrompt.length + entry.length > MAX_RULES_LENGTH) {
        if (systemPrompt.length === 0) {
          // First rule is too big, truncate it
          const available = MAX_RULES_LENGTH - `## ${rule.id}\n\n`.length - "\n".length
          systemPrompt = `## ${rule.id}\n\n${body.slice(0, available)}\n`
          warnings.push(`Rule "${rule.id}" truncated to fit ${MAX_RULES_LENGTH} limit`)
        } else {
          warnings.push(`Rule "${rule.id}" skipped: exceeds remaining budget (${MAX_RULES_LENGTH - systemPrompt.length} chars)`)
        }
        skippedCount++
        continue
      }

      systemPrompt += entry
      count++
    } catch (e) {
      warnings.push(`Failed to read rule "${rule.id}" at ${rule.path}: ${e instanceof Error ? e.message : String(e)}`)
      skippedCount++
    }
  }

  if (count > 0) {
    const header = "## Rules\n\n"
    systemPrompt = header + systemPrompt
  }

  return { systemPrompt, count, skippedCount, warnings }
}
