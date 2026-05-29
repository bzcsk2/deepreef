import { describe, it, expect } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { hashAnchoredReplaceOnce } from "../src/hash-edit.js"
import { fuzzyReplaceOnce } from "../src/fuzzy-edit.js"

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "deepicode-edit-test-"))
}

describe("hashAnchoredReplaceOnce", () => {
  it("should replace exact match", async () => {
    const dir = tempDir()
    const file = join(dir, "test.txt")
    writeFileSync(file, "Hello world")

    const res = await hashAnchoredReplaceOnce(file, "world", "there")
    expect(res).not.toBeNull()
    expect(res!.replacedCount).toBe(1)
    expect(readFileSync(file, "utf-8")).toBe("Hello there")
    await rm(dir, { recursive: true })
  })

  it("should replace multi-line text", async () => {
    const dir = tempDir()
    const file = join(dir, "test.txt")
    writeFileSync(file, "line1\nline2\nline3\nline4")

    const res = await hashAnchoredReplaceOnce(file, "line2\nline3", "B\nC")
    expect(res).not.toBeNull()
    expect(readFileSync(file, "utf-8")).toBe("line1\nB\nC\nline4")
    await rm(dir, { recursive: true })
  })

  it("should return null when oldString not found", async () => {
    const dir = tempDir()
    const file = join(dir, "test.txt")
    writeFileSync(file, "Hello world")

    const res = await hashAnchoredReplaceOnce(file, "nope", "there")
    expect(res).toBeNull()
    expect(readFileSync(file, "utf-8")).toBe("Hello world")
    await rm(dir, { recursive: true })
  })

  it("should return null when oldHash does not match", async () => {
    const dir = tempDir()
    const file = join(dir, "test.txt")
    writeFileSync(file, "Hello world")

    const res = await hashAnchoredReplaceOnce(file, "world", "there", "badhash")
    expect(res).toBeNull()
    expect(readFileSync(file, "utf-8")).toBe("Hello world")
    await rm(dir, { recursive: true })
  })

  it("should succeed when oldHash matches", async () => {
    const dir = tempDir()
    const file = join(dir, "test.txt")
    writeFileSync(file, "Hello world")

    const h = sha256("world")
    const res = await hashAnchoredReplaceOnce(file, "world", "there", h)
    expect(res).not.toBeNull()
    expect(res!.replacedCount).toBe(1)
    expect(readFileSync(file, "utf-8")).toBe("Hello there")
    await rm(dir, { recursive: true })
  })

  it("should return null for empty oldString", async () => {
    const res = await hashAnchoredReplaceOnce("/nonexistent", "", "x")
    expect(res).toBeNull()
  })
})

describe("fuzzyReplaceOnce", () => {
  it("exact match", () => {
    const res = fuzzyReplaceOnce("Hello world", "world", "there")
    expect(res).not.toBeNull()
    expect(res!.edited).toBe("Hello there")
    expect(res!.method).toBe("exact")
  })

  it("trimmed_full match", () => {
    const res = fuzzyReplaceOnce("Hello  world", " world", " there")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("exact")
  })

  it("trimmed_lines match", () => {
    const res = fuzzyReplaceOnce("before\nline1\nline2\nafter", "line1 \nline2 ", "REPLACED")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("trimmed_lines")
    expect(res!.edited).toBe("before\nREPLACED\nafter")
  })

  it("flexible_whitespace match", () => {
    const res = fuzzyReplaceOnce("Hello   world", "Hello world", "Hi there")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("flexible_whitespace")
    expect(res!.edited).toBe("Hi there")
  })

  it("returns null when needle not found", () => {
    const res = fuzzyReplaceOnce("abc", "xyz", "123")
    expect(res).toBeNull()
  })

  it("blockAnchor: match via first+last line anchors", () => {
    const haystack = "some text\nstart anchor\nmiddle content\nmiddle extra\nend anchor\nmore text"
    const needle = "start anchor\nmiddle content\ndifferent whitespace\nend anchor"
    const res = fuzzyReplaceOnce(haystack, needle, "REPLACED")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("blockAnchor")
    expect(res!.edited).toBe("some text\nREPLACED\nmore text")
  })

  it("blockAnchor: returns null when anchors not found", () => {
    const res = fuzzyReplaceOnce("abc\ndef", "xyz\n123", "REPLACED")
    expect(res).toBeNull()
  })

  it("escapeNormalized: literal \\n becomes newline", () => {
    const haystack = "line1\nline2"
    const needle = "line1\\nline2"
    const res = fuzzyReplaceOnce(haystack, needle, "REPLACED")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("escapeNormalized")
    expect(res!.edited).toBe("REPLACED")
  })

  it("trimmedBoundary: left+right trim each line", () => {
    const haystack = "prefix\nhello world\nfoo bar\nsuffix"
    const needle = "  hello world  \n  foo bar  "
    const res = fuzzyReplaceOnce(haystack, needle, "REPLACED")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("trimmedBoundary")
    expect(res!.edited).toBe("prefix\nREPLACED\nsuffix")
  })

  it("contextAware: first+last line as anchors, middle approximately matches", () => {
    const haystack = "prefix\nfirst anchor\nmiddle-A\nmiddle-B\nmiddle-C\nlast anchor\nsuffix"
    const needle = "first anchor\ndifferent X\ndifferent Y\ndifferent Z\nlast anchor"
    const res = fuzzyReplaceOnce(haystack, needle, "REPLACED")
    expect(res).not.toBeNull()
    expect(res!.method).toBe("contextAware")
    expect(res!.edited).toBe("prefix\nREPLACED\nsuffix")
  })

  it("should reject ambiguous old_string with multiple occurrences", () => {
    const haystack = "common\ncommon\nunique"
    const needle = "common"
    const res = fuzzyReplaceOnce(haystack, needle, "REPLACED")
    expect(res).toBeNull()
  })

  it("should match unique old_string with surrounding context", () => {
    const haystack = "function a() { return 1 }\nfunction b() { return 2 }"
    const result = fuzzyReplaceOnce(haystack, "a() { return 1", "a() { return 42")
    expect(result).not.toBeNull()
    expect(result!.edited).toContain("return 42")
  })
})
