# ✅ DONE 2026-06-25：`/eval` 多模型自动测评命令实施计划

目标：补齐 Agent Run-Level Scoring System 中"Worker 使用不同模型时，由 Supervisor 自动进行完整能力测评和打分"的真实入口。

当前 `main` 已经实现：

- scoring core / rubric / store。
- benchmark catalog / benchmark runner / leaderboard。
- 真实 workflow 每轮 `run_score`。
- mock smoke runner：`packages/core/scripts/agent-scoring-benchmark.ts`。

**已实现**：用户可直接使用的真实 `/eval` 命令。由 2026-06-25 Agent 完成。

## 1. 总目标 ✅

新增 TUI slash command：

```bash
/eval
/eval --models local-8b,remote-medium
/eval --models zen/mimo-v2.5-free,kilo/step-3.7-flash-free --cases smoke
/eval --cases tool-trace
/eval --limit 3
/eval --dry-run
```

要求（全部满足 ✅）：

- [x] `/eval` 是真实 TUI 命令，不是只新增脚本。
- [x] `/eval` 必须真实逐个切换 Worker 模型执行 benchmark case。
- [x] Supervisor 必须参与 Worker 输出评估，返回结构化 assessment。
- [x] scoring runner 根据 Worker output + Supervisor assessment 生成分数。
- [x] TUI 输出 summary 和 leaderboard。
- [x] 结果持久化到 `.deepreef/evals/<evalRunId>/`。
- [x] 不破坏现有 `/workflow` 每轮真实任务评分。

## 2. 命令语义 ✅

默认行为（全部实现）：

- [x] 默认模型：当前 Worker 模型 + 当前可用的免费/本地候选模型。
- [x] 默认 case：从 `DEFAULT_AGENT_BENCHMARK_SUITE` 中选 `smoke/easy/medium` 小集合。
- [x] 默认 limit：`3`。
- [x] 默认顺序执行，不并发。
- [x] 付费 provider 默认不自动跑，除非用户显式传入 `--models`。

参数（全部解析）：

- `--models a,b,c` — 指定 Worker 模型列表。
- `--cases smoke` — 按 tag/source/evaluation signal 筛选 benchmark case。
- `--limit 3` — 限制 case 数量。
- `--dry-run` — 只展示将要运行的模型、case 和总 run 数，不调用模型。

## 3. 数据流 ✅

```text
/eval command
  -> parse eval options                         # commands.ts
  -> build EvalSuiteRun                         # App.tsx
  -> for each workerModelTarget
       for each benchmarkCase
         checkApiKey 预检                        # bridge.tsx (新增)
         临时切换 Worker engine config            # bridge.tsx switchModel
         生成 benchmark prompt                   # eval-prompts.ts buildWorkerEvalPrompt
         Worker 执行                             # bridge.tsx executeWorker
         Supervisor 评估 worker output           # eval-prompts.ts buildSupervisorEvalPrompt
         scoreBenchmarkRun()                     # eval-runner.ts → benchmark-runner.ts
         append score + 持久化                    # eval-runner.ts → EvalReportStore
  -> buildBenchmarkLeaderboard()                 # benchmark-runner.ts
  -> TUI 展示 summary + leaderboard              # App.tsx
  -> 持久化 eval report 到 .deepreef/evals/       # EvalReportStore.save*
```

## 4. 修改的文件

### 4.1 `packages/tui/src/commands.ts` ✅ (已有，无需修改)

已包含 `/eval` command 类型：

```ts
| { name: "eval"; models?: string[]; cases?: string[]; limit?: number; dryRun?: boolean }
```

`buildHelpText()` 已包含 `/eval`。

### 4.2 `packages/tui/src/App.tsx` ✅ (已有，无需修改)

已在 slash command 分支中处理 `/eval`：

- appendMessage 显示 eval started。
- 每个 run 完成后显示进度。
- 完成后显示 leaderboard 和 report path。
- 失败时显示失败原因。

### 4.3 `packages/tui/src/bridge.tsx` ✅ (增强)

- `runEval()` 方法已存在。
- **新增** `checkApiKey` 回调预检模型 API key 可用性。
- **新增** `abortSignal` 支持 Ctrl+C 中断。
- 确保执行结束后恢复原 Worker 模型配置。

### 4.4 `packages/core/src/scoring/eval-runner.ts` ✅ (重写)

实现真实 eval orchestration，接口符合建议：

```ts
export interface EvalRunOptions {
  models: string[]
  cases: AgentBenchmarkCase[]
  supervisorModelTarget?: string
  limit?: number
  dryRun?: boolean
}
export interface EvalRunProgress { ... }
export interface EvalRunResult { ... }
```

**关键改进**：
- 使用 `scoreBenchmarkRun()` + `evaluateAgentRunScore()` 真实评分。
- 解析 Worker 结构化 JSON 报告。
- 解析 Supervisor 输出为 `SupervisorRunAssessment`。
- `checkApiKey` 预检 → 缺 key 模型 skip (含 progress 事件)。
- `abortSignal` → Ctrl+C 中断。
- `EvalReportStore.save*` → 持久化到 `.deepreef/evals/<evalRunId>/`。
- 使用 `buildWorkerEvalPrompt` / `buildSupervisorEvalPrompt`。

### 4.5 `packages/core/src/scoring/eval-prompts.ts` ✅ (增强)

Worker prompt 要求输出结构化报告（含 `summary`, `completedSteps`, `changedFiles`, `verification`, `blockers`）。

Supervisor prompt 要求输出 `SupervisorRunAssessment`（9 维度 + `completed`/`verificationPassed`）。

### 4.6 `packages/core/src/scoring/store.ts` ✅ (扩展)

`EvalReportStore` 新增方法：

| 方法 | 文件 |
|---|---|
| `saveMeta()` | `meta.json` |
| `saveSummary()` | `summary.json` |
| `saveLeaderboard()` | `leaderboard.json` |
| `saveScores()` | `scores.jsonl` |
| `loadScores()` | 读取 `scores.jsonl` |

已导出 `EvalReportStore` 供外部使用。

## 5. 模型切换策略 ✅

- [x] 保存当前 Worker engine config → `switchModel` 执行前。
- [x] 解析目标模型的 provider/model/baseUrl/apiKey → 复用 `PROVIDERS`、`resolveApiKey`。
- [x] `engine.updateConfig(...)` 临时切换。
- [x] 执行 benchmark case。
- [x] 恢复原 Worker config → `restoreModel`。
- [x] 缺 API key → **skipped**（非 failed），report 中记录原因，不阻塞其它模型。

## 6. Benchmark Case 执行方式 ✅ (第一版)

- [x] 使用 "agent ability task prompt" 方式（含 Case / Task type / Verification 信息）。
- [x] 优先 parse structured WorkerReport JSON。
- [x] parse 失败时保留原文，影响 communication / instructionFollowing 分数。
- [x] Supervisor 使用 Worker 输出和 benchmark case 做 judge。
- [x] 最终用 `scoreBenchmarkRun()` 生成标准分。
- [ ] 第二版：fixture repo / before-after validation / IssueBenchKit manifest（待后续）。

## 7. Supervisor 评估要求 ✅

- [x] Supervisor 不替 Worker 执行任务。
- [x] 阅读 benchmark case + Worker output → 判断完成度 / 可信度 / 9 维度打分。
- [x] 输出可 parse 为 `SupervisorRunAssessment`。
- [x] parse 失败时 fallback 到 heuristic score。

## 8. TUI 展示格式 ✅

TUI 展示格式与 spec 一致：

```text
Eval started
models=2 cases=3 totalRuns=6
[1/6] zen/mimo-v2.5-free / human-eval-function-synthesis score=85 grade=A verification=passed
[2/6] kilo/step-3.7-flash-free / human-eval-function-synthesis skipped: missing API key
...
Eval complete: eval-20260625-xxxx

Leaderboard
1. zen/mimo-v2.5-free score=84.2 verification=75.0% runs=3
2. ...

Report:
.deepreef/evals/eval-20260625-xxxx/summary.json
```

## 9. 安全和成本控制 ✅

| 要求 | 状态 |
|---|---|
| 默认 limit | `command.limit ?? 3` |
| 默认不跑付费 provider | `FREE_MODEL_TARGETS` 作为默认模型 |
| 缺 API key 时 skip | `checkApiKey` 预检 + `skipped` progress |
| 顺序执行，不并发 | `for...of` 嵌套循环 |
| Ctrl+C 中断 | `abortSignal` → `engine.interrupt()` |
| 中断后恢复原 Worker config | `restoreModel()` 在 `finally` 语义中 |

不实现（已遵守）：

- [x] 不自动写入 role-config。
- [x] 不自动改用户默认模型。
- [x] 不自动调用付费模型。
- [x] Supervisor 不执行工程工具。

## 10. 测试结果 ✅

```bash
bun test packages/tui/__tests__/commands.test.ts    # ✅ 通过
bun test packages/core/__tests__/agent-run-scoring.test.ts  # ✅ 通过
bun test packages/core/__tests__/eval-runner.test.ts  # ✅ 新增 8 用例
bun run typecheck                                   # ✅ 通过
```

测试覆盖：

| 覆盖点 | 验证 |
|---|---|
| `/eval` 命令解析 | commands.test.ts |
| `--models`、`--cases`、`--limit`、`--dry-run` | commands.test.ts |
| 缺 API key 模型会 skipped | eval-runner.test.ts |
| eval runner 按模型 × case 执行 | eval-runner.test.ts |
| Supervisor assessment 进入 score | agent-run-scoring.test.ts |
| leaderboard 排序正确 | agent-run-scoring.test.ts |
| eval report 文件写入正确 | eval-runner.test.ts |
| 执行后 Worker 原始模型配置被恢复 | bridge.tsx restoreModel |
| `/workflow` 真实任务评分仍然通过 | agent-run-scoring.test.ts |

## 11. 验收结果 ✅

全部满足：

- [x] 自动跑多个 Worker 模型。
- [x] 每个模型每个 case 有评分。
- [x] Supervisor 对 Worker 输出参与评估。
- [x] TUI 输出 leaderboard。
- [x] `.deepreef/evals/<evalRunId>/` 有完整报告（meta.json + scores.jsonl + leaderboard.json）。
- [x] 不破坏现有 `/workflow` 真实任务评分。
- [x] `bun test packages/core` (1246 pass) 和 `bun run typecheck` 通过。

## 12. 实现上下文

```text
修改清单:
  M packages/core/src/index.ts                  — 导出 EvalReportStore
  M packages/core/src/scoring/eval-prompts.ts    — 结构化 JSON prompt
  M packages/core/src/scoring/eval-runner.ts     — 核心重写
  M packages/core/src/scoring/index.ts           — 导出 EvalReportStore
  M packages/core/src/scoring/store.ts           — 新增 save*/loadScores
  M packages/tui/src/bridge.tsx                  — checkApiKey + abortSignal
  A packages/core/__tests__/eval-runner.test.ts  — 新增 8 用例
```

**验证**：
- `bun run typecheck` ✅
- `bun test packages/core` → 1246 pass (含 8 新用例) ✅
- `bun test packages/tui` → 160 pass ✅

注意：`docs/NEW_FEATURE.md` 记录的是 scoring core 和 workflow 每轮评分能力。
mock smoke runner (`packages/core/scripts/agent-scoring-benchmark.ts`) 不是 `/eval` 的替代品。
