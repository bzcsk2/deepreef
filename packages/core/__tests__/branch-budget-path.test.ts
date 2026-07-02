import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { BranchBudgetTracker } from "../src/governance/branch-budget.js"
import {
  canonicalBudgetPath,
  mergeBudgetPathMap,
} from "../src/governance/branch-budget-path.js"

describe("branch-budget-path", () => {
  it("canonicalBudgetPath normalizes absolute paths under workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "drf-budget-path-"))
    const abs = join(root, "src", "scenes", "ShopScene.ts")
    mkdirSync(join(root, "src", "scenes"), { recursive: true })
    writeFileSync(abs, "export {};\n")

    expect(canonicalBudgetPath(root, abs)).toBe("src/scenes/ShopScene.ts")
    expect(canonicalBudgetPath(root, "src/scenes/ShopScene.ts")).toBe("src/scenes/ShopScene.ts")
  })

  it("bindWorkspaceRoot merges absolute and relative edit counts", () => {
    const root = mkdtempSync(join(tmpdir(), "drf-budget-merge-"))
    const abs = join(root, "src", "a.ts")
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(abs, "x")

    const t = new BranchBudgetTracker({ fileEditMax: 3 })
    t.recordFileEdit("src/a.ts")
    t.recordFileEdit("src/a.ts")
    t.bindWorkspaceRoot(root)
    t.recordFileEdit(abs)

    expect(t.inspect().fileEdits["src/a.ts"]).toBe(3)
    expect(t.wouldBlockFileEdit("src/a.ts")).toBe(true)
    expect(t.wouldBlockFileEdit(abs)).toBe(true)
  })

  it("mergeBudgetPathMap sums counts per canonical key (G5)", () => {
    // G5: 同一文件以相对路径和绝对路径各记录了独立编辑次数（2 + 3 = 5），
    // 合并时应累加而非取 max，否则会低估实际编辑次数。
    const root = mkdtempSync(join(tmpdir(), "drf-budget-map-"))
    const merged = mergeBudgetPathMap(
      new Map([
        ["src/a.ts", 2],
        [join(root, "src", "a.ts"), 3],
      ]),
      root,
    )
    expect(merged.get("src/a.ts")).toBe(5)
  })
})
