/**
 * Shell command pattern extraction — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/tool/shell.ts
 *
 * Extracts file paths and command patterns from shell commands
 * for permission evaluation.
 */

import type { ShellScan } from "../types.js"

/* ── File-touching commands ── */

const POSIX_FILE_COMMANDS = new Set([
  "rm", "rmdir", "cp", "mv", "mkdir", "touch", "chmod", "chown", "chgrp",
  "ln", "link", "unlink", "rename", "shred", "dd",
  "cat", "head", "tail", "less", "more", "wc", "sort", "uniq", "cut", "tr",
  "tee", "xargs", "find", "ls", "stat", "file", "du", "df",
  "tar", "gzip", "gunzip", "bzip2", "xz", "zip", "unzip",
  "git", "svn", "hg",
  "node", "python", "python3", "ruby", "perl", "php",
  "npm", "npx", "yarn", "pnpm", "bun",
  "cargo", "rustc", "go",
  "gcc", "g++", "clang", "make", "cmake",
  "docker", "podman",
  "ssh", "scp", "rsync", "curl", "wget",
])

const WINDOWS_FILE_COMMANDS = new Set([
  "del", "rmdir", "rd", "copy", "xcopy", "robocopy", "move", "ren", "rename",
  "mkdir", "md", "type", "more", "find", "findstr",
  "git", "svn",
  "node", "python", "ruby", "perl",
  "npm", "npx", "yarn", "pnpm",
  "cargo", "go",
  "docker", "podman",
])

/* ── CWD-changing commands ── */

const CWD_COMMANDS = new Set(["cd", "pushd", "popd", "chdir", "Set-Location"])

/* ── Pattern Extraction ── */

/**
 * Extract permission patterns from a shell command.
 * Returns file paths, command patterns, and suggested "always" patterns.
 */
export function extractShellPatterns(
  command: string,
  cwd: string,
  shell: "bash" | "powershell" = "bash",
): ShellScan {
  const scan: ShellScan = {
    dirs: new Set(),
    patterns: new Set(),
    always: new Set(),
  }

  if (!command.trim()) return scan

  // Simple tokenization (not a full parser, but sufficient for pattern extraction)
  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) return scan

  const cmd = tokens[0]?.toLowerCase() ?? ""

  // Check if this is a file-touching command
  const fileCommands = shell === "powershell" ? WINDOWS_FILE_COMMANDS : POSIX_FILE_COMMANDS
  if (fileCommands.has(cmd)) {
    // Extract file path arguments
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i]
      if (!token) continue

      // Skip flags
      if (token.startsWith("-")) continue

      // Resolve the path
      const resolved = resolvePath(token, cwd)
      if (resolved) {
        if (isExternalDirectory(resolved, cwd)) {
          scan.dirs.add(resolved)
        } else {
          scan.patterns.add(token)
        }
      }
    }

    // Suggest "always" patterns for common safe commands
    if (cmd === "cat" || cmd === "head" || cmd === "tail" || cmd === "less" || cmd === "more" || cmd === "wc" || cmd === "sort") {
      for (const token of tokens.slice(1)) {
        if (!token.startsWith("-")) {
          scan.always.add(token)
        }
      }
    }
  }

  // Check for CWD-changing commands
  if (CWD_COMMANDS.has(cmd)) {
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i]
      if (token && !token.startsWith("-")) {
        const resolved = resolvePath(token, cwd)
        if (resolved && isExternalDirectory(resolved, cwd)) {
          scan.dirs.add(resolved)
        }
      }
    }
  }

  // Always include the command itself as a pattern
  scan.patterns.add(cmd)

  return scan
}

/**
 * Generate "always" patterns for a command.
 * These are patterns that can be auto-approved.
 */
export function generateAlwaysPatterns(command: string): string[] {
  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) return []

  const cmd = tokens[0]?.toLowerCase() ?? ""
  const patterns: string[] = []

  // Read-only commands can always be approved
  if (cmd === "cat" || cmd === "head" || cmd === "tail" || cmd === "less" || cmd === "more" || cmd === "wc" || cmd === "sort" || cmd === "uniq" || cmd === "cut" || cmd === "tr") {
    patterns.push(command)
  }

  // ls and find can be approved
  if (cmd === "ls" || cmd === "find" || cmd === "stat" || cmd === "file" || cmd === "du") {
    patterns.push(command)
  }

  return patterns
}

/* ── Helpers ── */

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (const char of command) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }

    if (char === " " && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function resolvePath(token: string, cwd: string): string | null {
  if (!token) return null

  // Handle ~ expansion
  if (token.startsWith("~")) {
    return token.replace("~", process.env.HOME ?? "/root")
  }

  // Handle absolute paths
  if (token.startsWith("/")) {
    return token
  }

  // Handle relative paths
  return `${cwd}/${token}`
}

function isExternalDirectory(path: string, cwd: string): boolean {
  const normalizedCwd = cwd.replace(/\/$/, "")
  const normalizedPath = path.replace(/\/$/, "")

  // Check if path is outside the workspace
  return !normalizedPath.startsWith(normalizedCwd)
}
