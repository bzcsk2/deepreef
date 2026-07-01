import { describe, it, expect } from "vitest"
import { validateShellCommand, matchDeniedShellPattern, matchSensitivePathInCommand } from "../src/shell-dual-track/shell-security.js"

describe("matchDeniedShellPattern", () => {
  it("git push is not denied (approval-tier)", () => {
    expect(matchDeniedShellPattern("git push origin main", "bash")).toBeNull()
  })

  it("git commit is not denied (approval-tier)", () => {
    expect(matchDeniedShellPattern("git commit -m 'fix'", "bash")).toBeNull()
  })

  it("git status is not denied", () => {
    expect(matchDeniedShellPattern("git status", "bash")).toBeNull()
  })

  it("standalone dd without if= is not denied", () => {
    expect(matchDeniedShellPattern("dd if=/dev/zero of=/dev/sda", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("echo dd", "bash")).toBeNull()
    expect(matchDeniedShellPattern("dd --help", "bash")).toBeNull()
  })

  it("rm -rf / is denied", () => {
    expect(matchDeniedShellPattern("rm -rf /", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("rm -r /*", "bash")).not.toBeNull()
  })

  it("rm -r src/* is NOT denied (regression: was a false positive)", () => {
    expect(matchDeniedShellPattern("rm -r src/*", "bash")).toBeNull()
    expect(matchDeniedShellPattern("rm -rf build/*", "bash")).toBeNull()
  })

  it("rm root variants with -- are denied", () => {
    expect(matchDeniedShellPattern("rm -rf -- /", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("rm -rf --no-preserve-root /", "bash")).not.toBeNull()
  })

  it("rm with multiple flags is denied", () => {
    expect(matchDeniedShellPattern("rm -rf -v /", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("rm -r -f -v /*", "bash")).not.toBeNull()
  })

  it("sudo is denied", () => {
    expect(matchDeniedShellPattern("sudo rm -rf /", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("sudo apt update", "bash")).not.toBeNull()
  })

  it("mkfs and fdisk are denied", () => {
    expect(matchDeniedShellPattern("mkfs.ext4 /dev/sda1", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("mkfs /dev/sda1", "bash")).not.toBeNull()
    expect(matchDeniedShellPattern("fdisk /dev/sda", "bash")).not.toBeNull()
  })

  it("chmod -R 777 / is denied", () => {
    expect(matchDeniedShellPattern("chmod -R 777 /", "bash")).not.toBeNull()
  })
})

describe("matchSensitivePathInCommand", () => {
  it("cat .env is rejected", () => {
    expect(matchSensitivePathInCommand("cat .env")).toBe(".env")
  })

  it("cat .env.local is rejected", () => {
    expect(matchSensitivePathInCommand("cat .env.local")).toBe(".env.local")
  })

  it("cat .npmrc is rejected", () => {
    expect(matchSensitivePathInCommand("cat .npmrc")).toBe(".npmrc")
  })

  it("cat .aws/credentials is rejected", () => {
    expect(matchSensitivePathInCommand("cat .aws/credentials")).toBe(".aws/credentials")
  })

  it("cat foo/.env is rejected", () => {
    expect(matchSensitivePathInCommand("cat foo/.env")).toBe("foo/.env")
  })

  it("cat .ssh/id_rsa remains rejected", () => {
    expect(matchSensitivePathInCommand("cat .ssh/id_rsa")).toBe(".ssh/id_rsa")
  })

  it("validateShellCommand rejects cat .env", () => {
    const r = validateShellCommand("cat .env", "bash")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("sensitive file")
  })
})

describe("validateShellCommand", () => {
  it("git push is allowed", () => {
    const r = validateShellCommand("git push origin main", "bash")
    expect(r.ok).toBe(true)
  })

  it("git commit -m is allowed", () => {
    const r = validateShellCommand("git commit -m 'message'", "bash")
    expect(r.ok).toBe(true)
  })

  it("rm -rf / is rejected", () => {
    const r = validateShellCommand("rm -rf /", "bash")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("denied")
  })

  it("sudo command is rejected", () => {
    const r = validateShellCommand("sudo apt update", "bash")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("denied")
  })

  it("standalone dd command (without if=) is allowed", () => {
    const r = validateShellCommand("dd --help", "bash")
    expect(r.ok).toBe(true)
  })

  it("dd with if= is rejected", () => {
    const r = validateShellCommand("dd if=/dev/zero of=/dev/sda", "bash")
    expect(r.ok).toBe(false)
  })

  it("empty command is rejected", () => {
    const r = validateShellCommand("", "bash")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("required")
  })
})
