export interface FuzzyEditResult {
  edited: string
  replacedCount: number
  method: string
}

export function fuzzyReplaceOnce(haystack: string, needle: string, replacement: string): FuzzyEditResult | null {
  // Pass 1: exact match (prefer last occurrence if multiple)
  const allOccurrences = findAllOccurrences(haystack, needle)
  if (allOccurrences.length > 0) {
    if (allOccurrences.length >= 2) {
      // Multi-occurrence: prefer the last one (more likely the intended edit target)
      const lastIdx = allOccurrences[allOccurrences.length - 1]
      return { edited: haystack.slice(0, lastIdx) + replacement + haystack.slice(lastIdx + needle.length), replacedCount: 1, method: "multiOccurrence" }
    }
    return { edited: haystack.slice(0, allOccurrences[0]) + replacement + haystack.slice(allOccurrences[0] + needle.length), replacedCount: 1, method: "exact" }
  }

  // Pass 2: trimmed variants (trim entire needle, or trim right sides of lines)
  const trimmedNeedle = needle.trim()
  if (trimmedNeedle) {
    let j = haystack.indexOf(trimmedNeedle)
    if (j >= 0) {
      return { edited: haystack.slice(0, j) + replacement + haystack.slice(j + trimmedNeedle.length), replacedCount: 1, method: "trimmed_full" }
    }
  }

  const rightTrimmed = trimRightLines(needle)
  if (rightTrimmed && rightTrimmed !== needle) {
    let j = haystack.indexOf(rightTrimmed)
    if (j >= 0) {
      return { edited: haystack.slice(0, j) + replacement + haystack.slice(j + rightTrimmed.length), replacedCount: 1, method: "trimmed_lines" }
    }
  }

  // Pass 3: trimmedBoundary — left+right trim each line (preserves line structure)
  const boundaryResult = trimmedBoundaryPass(haystack, needle, replacement)
  if (boundaryResult) return boundaryResult

  // Pass 4: blockAnchor — use distinctive first+last lines as anchors
  const blockResult = blockAnchorPass(haystack, needle, replacement)
  if (blockResult) return blockResult

  // Pass 5: contextAware — use first+last lines as anchors with approximate middle
  const contextResult = contextAwarePass(haystack, needle, replacement)
  if (contextResult) return contextResult

  // Pass 6: escapeNormalized — normalize literal escape sequences
  const escapeResult = escapeNormalizedPass(haystack, needle, replacement)
  if (escapeResult) return escapeResult

  // Pass 7: Flexible whitespace match using regex (most aggressive — last resort)
  try {
    const trimmed = needle.trim()
    if (trimmed) {
      const parts = trimmed.split(/\s+/)
      if (parts.length > 1) {
        const escapedParts = parts.map(escapeRegExp)
        const flexRegex = new RegExp(escapedParts.join('\\s+'))
        const match = haystack.match(flexRegex)
        if (match && match.index !== undefined) {
          return {
            edited: haystack.slice(0, match.index) + replacement + haystack.slice(match.index + match[0].length),
            replacedCount: 1,
            method: "flexible_whitespace"
          }
        }
      }
    }
  } catch (e) {
    // Ignore regex compilation errors
  }

  return null
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimRightLines(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .join("\n")
}

function trimBothLines(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
}

function blockAnchorPass(haystack: string, needle: string, replacement: string): FuzzyEditResult | null {
  const needleLines = needle.split("\n")
  const firstAnchor = needleLines.find(l => l.trim())?.trim()
  const lastAnchor = needleLines.slice().reverse().find(l => l.trim())?.trim()
  if (!firstAnchor || !lastAnchor || firstAnchor === lastAnchor) return null

  const haystackLines = haystack.split("\n")
  let firstLineIdx = -1
  let lastLineIdx = -1

  for (let i = 0; i < haystackLines.length; i++) {
    if (haystackLines[i].trim() === firstAnchor) { firstLineIdx = i; break }
  }
  if (firstLineIdx < 0) return null

  for (let i = firstLineIdx + 1; i < haystackLines.length; i++) {
    if (haystackLines[i].trim() === lastAnchor) { lastLineIdx = i; break }
  }
  if (lastLineIdx < 0 || lastLineIdx - firstLineIdx + 1 < needleLines.length) return null

  const regionLines = haystackLines.slice(firstLineIdx, lastLineIdx + 1)
  const trimmedNeedle = needleLines.map(l => l.trim())
  const trimmedRegion = regionLines.map(l => l.trim())

  let matches = 0
  for (let i = 0; i < trimmedNeedle.length && i < trimmedRegion.length; i++) {
    if (trimmedNeedle[i] === trimmedRegion[i]) matches++
  }

  const threshold = Math.max(3, Math.floor(trimmedNeedle.length * 0.55))
  if (matches < threshold) return null

  const before = haystackLines.slice(0, firstLineIdx).join("\n")
  const after = haystackLines.slice(lastLineIdx + 1).join("\n")
  const prefix = before ? before + "\n" : ""
  const suffix = after ? "\n" + after : ""

  return {
    edited: prefix + replacement + suffix,
    replacedCount: 1,
    method: "blockAnchor",
  }
}

function escapeNormalizedPass(haystack: string, needle: string, replacement: string): FuzzyEditResult | null {
  const normalized = needle
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\t/g, "\t")
    .replace(/\\\\"/g, '"')
    .replace(/\\\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")

  if (normalized === needle) return null

  const idx = haystack.indexOf(normalized)
  if (idx < 0) return null

  return {
    edited: haystack.slice(0, idx) + replacement + haystack.slice(idx + normalized.length),
    replacedCount: 1,
    method: "escapeNormalized",
  }
}

function trimmedBoundaryPass(haystack: string, needle: string, replacement: string): FuzzyEditResult | null {
  const trimmed = trimBothLines(needle)
  if (trimmed === needle) return null

  const idx = haystack.indexOf(trimmed)
  if (idx < 0) return null

  return {
    edited: haystack.slice(0, idx) + replacement + haystack.slice(idx + trimmed.length),
    replacedCount: 1,
    method: "trimmedBoundary",
  }
}

function contextAwarePass(haystack: string, needle: string, replacement: string): FuzzyEditResult | null {
  const lines = needle.split("\n")
  if (lines.length < 3) return null

  const firstLine = lines[0].trim()
  const lastLine = lines[lines.length - 1].trim()
  if (!firstLine || !lastLine) return null
  if (firstLine === lastLine && lines.length > 2) return null

  const haystackLines = haystack.split("\n")
  let firstMatch = -1
  let lastMatch = -1

  for (let i = 0; i < haystackLines.length; i++) {
    if (haystackLines[i].trim() === firstLine) { firstMatch = i; break }
  }
  if (firstMatch < 0) return null

  for (let i = firstMatch + 1; i < haystackLines.length; i++) {
    if (haystackLines[i].trim() === lastLine) { lastMatch = i; break }
  }
  if (lastMatch < 0) return null

  const regionLines = haystackLines.slice(firstMatch, lastMatch + 1)
  if (regionLines.length < lines.length) return null

  let matchingLines = 0
  for (let i = 0; i < lines.length && i < regionLines.length; i++) {
    const nTrimmed = lines[i].trim()
    const hTrimmed = regionLines[i].trim()
    if (nTrimmed && hTrimmed && nTrimmed === hTrimmed) matchingLines++
  }

  const threshold = Math.max(2, Math.floor(lines.length * 0.4))
  if (matchingLines < threshold) return null

  const start = haystackLines.slice(0, firstMatch).join("\n")
  const end = haystackLines.slice(lastMatch + 1).join("\n")
  const prefix = start ? start + "\n" : ""
  const suffix = end ? "\n" + end : ""

  return {
    edited: prefix + replacement + suffix,
    replacedCount: 1,
    method: "contextAware",
  }
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  const indices: number[] = []
  let searchFrom = 0
  while (true) {
    const idx = haystack.indexOf(needle, searchFrom)
    if (idx < 0) break
    indices.push(idx)
    searchFrom = idx + needle.length
  }
  return indices
}
