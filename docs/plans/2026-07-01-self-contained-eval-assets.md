# Self-Contained Eval Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make LoopRig eval mode work from npm package without external benchmark files, git bundles, or manual .pt downloads.

**Architecture:** Add `resources/eval-assets/` as the single source of truth for packaged benchmark data. Create asset resolver with dev/install fallback chain. Replace git bundle materializer with tar.gz snapshot extraction. Migrate lock and task files from `curated/` to `resources/eval-assets/`. Remove PyTorch large-weight cases from packaged assets.

**Tech Stack:** TypeScript, Node.js, tar, git, sha256

---

### Task 1: Asset resolver foundation + error types

**Files:**
- Create: `packages/core/src/eval/assets/resolve-assets-root.ts`
- Create: `packages/core/src/eval/assets/assets-lock.ts`
- Create: `packages/core/src/eval/assets/extract-safe.ts`
- Modify: `packages/core/src/eval/types.ts` — add asset error types
- Create: `packages/core/src/eval/assets/__tests__/resolve-assets-root.test.ts`

**Step 1: Add error types to types.ts**

Add `MissingEvalAssetError`, `CorruptEvalAssetError`, `UnsafeEvalAssetPathError`, `EvalAssetExtractionError` classes.

**Step 2: Create resolve-assets-root.ts**

`getEvalAssetsRoot()` with lookup order:
1. LOOPRIG_EVAL_ASSETS_DIR env var
2. npm package root: `import.meta.url` upward search for package.json → `resources/eval-assets`
3. repo root: `process.cwd()` → `resources/eval-assets`
4. Development fallback: `packages/core/src/eval/curated`

`getEvalAssetPath(relativePath)` — joins relative path to root, calls assertSafeAssetRelativePath
`assertSafeAssetRelativePath(relativePath)` — rejects `/`, `..`, Windows drives, absolute paths

**Step 3: Create extract-safe.ts**

`extractSafeTarGz(assetPath, workspaceDir)`:
1. List tar entries with `tar -tzf`
2. Validate each entry: no absolute path, no `..`, no Windows drive
3. Extract with `tar -xzf` to workspaceDir
4. Throw UnsafeEvalAssetPathError / EvalAssetExtractionError

**Step 4: Create assets-lock.ts**

`AssetsLock` class with:
- `load()` — parse `assets.lock.json`
- `verifySha256(relativePath, expectedSha256)` — check file integrity
- `getSweBenchSnapshot(repo, baseCommit)` — look up snapshot ref
- Validation: safe paths, sha256 format

**Step 5: Write tests and verify**

### Task 2: Create resources/eval-assets directory + migrate lock files

**Files:**
- Create: `resources/eval-assets/assets.lock.json` (minimal, with empty snapshots)
- Create: `resources/eval-assets/swe-bench/lock.json` (copy from curated)
- Create: `resources/eval-assets/terminal-bench/lock.json` (copy from curated)
- Create: `resources/eval-assets/terminal-bench/tasks/` (copy Terminal-Bench task dirs)
- Modify: `packages/core/src/eval/sources/swe-bench.ts` — read from resources first
- Modify: `packages/core/src/eval/sources/terminal-bench.ts` — read from resources first
- Modify: `packages/core/src/eval/generated/registry.ts` — read category-map from resources

### Task 3: SWE-bench snapshot materializer

**Files:**
- Create: `packages/core/src/eval/materialize/swe-bench-snapshot.ts`
- Modify: `packages/core/src/eval/materialize/swe-bench.ts` — use snapshot
- Modify: `packages/core/src/eval/materialize/shared.ts` — throw on missing handler
- Modify: `packages/core/src/eval/workspace.ts` — handle materializer errors

### Task 4: Terminal-Bench package asset path

**Files:**
- Modify: `packages/core/src/eval/sources/terminal-bench.ts` — use getEvalAssetPath for task path
- Modify: `packages/core/src/eval/materialize/terminal-bench.ts` — task path from assets

### Task 5: PyTorch large-weight removal

**Files:**
- Modify: `resources/eval-assets/terminal-bench/lock.json` — remove pytorch-model-recovery, pytorch-model-cli

### Task 6: Build/verify/size scripts

**Files:**
- Create: `scripts/eval-assets/build-swe-snapshots.ts`
- Create: `scripts/eval-assets/verify-assets.ts`
- Create: `scripts/eval-assets/check-size.ts`
- Modify: `package.json` — add scripts

### Task 7: weak-model/smoke suite + tests

**Files:**
- Create: tests for asset resolver, materializer, runner smoke
- Ensure at least one lightweight case in weak-model/smoke

### Task 8: Documentation

**Files:**
- Modify: `README.md`, `README.zh.md`, `docs/DEVELOPMENT.md`
