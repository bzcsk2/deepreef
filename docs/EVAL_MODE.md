# LoopRig `/eval` 实施计划（合并版）

最后更新：2026-06-27。

本文件合并并取代原 `docs/EVAL_MODE.md` 与 `docs/CASES.md` 的职责，作为后续 agent 开发 `/eval` 能力的唯一实施计划。

## 1. 目标

为 LoopRig 提供一个真正可用的固定评测模式，用来评估 Worker/Supervisor 在真实工程任务中的表现，同时保持和当前仓库结构一致，不搞一套脱离现有 runtime 的平行系统。

目标分两层：

1. 用户层目标：在 TUI 中进入固定评测流程，选择固定大项和固定测试集，看到逐 case 结果与最终报告。
2. 工程层目标：复用现有 `@deepreef/core` 的 scoring、workflow、trace、权限、TUI bridge，不做大爆炸重写。

## 2. 基于当前仓库的事实判断

### 已经存在的能力

当前仓库已经具备这些和 `/eval` 强相关的基础：

| 能力 | 现状 | 关键位置 |
| --- | --- | --- |
| `/eval` 斜杠命令 | 已存在，但属于多模型 benchmark runner，不是固定向导 | `packages/tui/src/commands.ts`, `packages/tui/src/App.tsx` |
| eval 执行器 | 已存在 `runEval()`，支持模型切换、进度回调、评分落盘 | `packages/core/src/scoring/eval-runner.ts` |
| 评分体系 | 已存在 run score、leaderboard、summary、report store | `packages/core/src/scoring/*` |
| Worker/Supervisor runtime | 已存在双 agent runtime 和固定 workflow coordinator | `packages/core/src/dual-agent-runtime/*`, `packages/core/src/workflow-coordinator/*` |
| TUI bridge | 已存在异步任务桥接、消息展示、状态切换 | `packages/tui/src/bridge.tsx`, `packages/tui/src/App.tsx` |
| 结果目录 | 已存在 `.deepreef/evals/<run-id>/...` | `packages/core/src/scoring/store.ts` |
| trace 基础 | 已有 runtime trace / perfetto trace 基础设施 | `packages/core/src/perfetto-tracing.ts` |
| 权限与安全 | 已有工具权限、规则和 deny 边界 | `packages/core/src/permission/*`, `packages/core/src/resolve-effective-tools.ts` |

### 当前不存在的能力

这些是原方案里假设存在、但仓库目前并没有的东西：

| 能力 | 当前状态 | 结论 |
| --- | --- | --- |
| `packages/eval` 独立包 | 不存在 | 第一阶段不要新建独立包 |
| 固定 category/suite registry | 不存在 | 需要补，但应放在 `packages/core/src/eval/` |
| 内建 eval wizard UI | 不存在 | 需要补，但不应阻塞 runner/fixture 落地 |
| 固定 case manifest + fixture loader | 不存在 | 需要补，这是 MVP 核心 |
| case 级隔离 workspace | 不存在 | 需要补，否则结果不可重复 |
| deterministic verifier | 不存在 | 需要补，否则“评分”只有 prompt judge，可信度不足 |
| eval 专用事件流 | 不存在 | 需要补，但可以在后续阶段做 |
| 外部 benchmark adapter | 不存在 | 明确是后续增强，不是 MVP 前置条件 |

### 对原两份文档的合理性判断

`EVAL_MODE.md` 的方向基本正确，但实现路径过度超前。

合理的部分：

- `/eval` 应该是固定大项、固定测试集、固定 case 的流程，而不是让模型临时发明 benchmark。
- 每个 case 应立即反馈结果，最终沉淀 Markdown 报告。
- 外部项目不应该接管 LoopRig 的交互流程。
- 需要保留 Worker 执行、Verifier 验证、Supervisor 评分的分层。

不合理或需要修正的部分：

- 不应第一步就新建 `packages/eval`，因为当前 scoring 与 runtime 都在 `@deepreef/core`。
- 不应先做完整 wizard UI 再做 fixture/verifier；正确顺序应反过来。
- 不应把新的 eval workflow 设计成一套独立于 `WorkflowCoordinator` 的平行 runtime。
- 不应在 MVP 阶段就接入 Terminal-Bench、SWE-bench、harness-evals、agentevals。
- 不应把“Supervisor prompt 评分”当作主要真值来源；必须有 deterministic verifier。

`CASES.md` 的判断更贴近项目现实，尤其是这条必须保留：

外部项目的角色应区分为两类：

- 真正的 case 来源：LoopRig native fixtures，后续可引入精选 Terminal-Bench / SWE-bench。
- 评分或兼容层：harness-evals、LangChain agentevals、agentevals-dev。

## 3. 总体决策

后续 agent 必须按下面的决策实施，不要回到原始大而全方案。

### 决策 A：保留现有 `/eval` 作为过渡能力，但把它降级为开发者入口

当前 `/eval --models --cases --limit --dry-run` 已经能跑基础 benchmark scoring。它不应立刻删除。

处理方式：

- 保留现有 flag 驱动入口，作为开发/兼容路径。
- 新的固定评测模式成为 `/eval` 默认交互。
- 如需兼容旧行为，可保留 `/eval --legacy` 或继续识别旧 flags。

### 决策 B：第一阶段代码全部落在 `packages/core` 和 `packages/tui`

不要新建 `packages/eval`。

推荐结构：

```text
packages/core/src/eval/
  types.ts
  registry.ts
  loader.ts
  workspace.ts
  verifier.ts
  runner.ts
  report.ts
  events.ts

packages/tui/src/eval/
  EvalWizard.tsx
  EvalCategorySelect.tsx
  EvalSuiteSelect.tsx
  EvalRunPanel.tsx
  EvalSummaryPanel.tsx
```

原因很直接：

- 当前 `/eval` 已经挂在 `App.tsx` 和 `bridge.tsx`。
- 当前 scoring/report store 已在 `packages/core/src/scoring/*`。
- 当前 workflow/runtime 也都在 `@deepreef/core`。
- 先在 `core` 内扩展最省改动，后续体量够大再独立拆包。

### 决策 C：MVP 先做 LoopRig native fixtures

MVP 不接任何外部 benchmark 作为运行依赖。

MVP 只做：

- 固定 registry
- 固定 smoke suites
- case manifest
- isolated workspace
- deterministic verifier
- TUI 基础向导
- Markdown/JSON 报告

### 决策 D：真实执行尽量复用现有 Worker/Supervisor runtime

不要新发明一套“EvalSupervisorWorkflow”去复制现有状态机。

更合理的做法：

- `/eval` 在外层控制 category/suite/case 的固定顺序。
- 单个 case 的执行在内层复用现有 Worker/Supervisor runtime。
- verifier、report、trace 由 eval runner 补充。

也就是说：

```text
Fixed Eval Runner
  -> prepare case workspace
  -> invoke existing Worker/Supervisor flow
  -> run verifier
  -> score
  -> persist evidence
```

## 4. 目标架构

### 4.1 用户交互

目标用户流保持简单：

```text
/eval
  -> 选择 category
  -> 选择 suite
  -> 查看说明与预估耗时
  -> 开始运行
  -> 每个 case 完成后立即显示 PASS/FAIL/score
  -> 全部结束后显示 summary 与 report 路径
```

MVP 不要求一次展示复杂排行榜，不要求先实现模型对比矩阵。

### 4.2 数据模型

固定 registry 应以代码为真值来源，不以自由文本解析为准。

推荐类型：

```ts
export type EvalCategoryId =
  | "coding-basics"
  | "tool-use"
  | "safety"
  | "supervisor-recovery"
  | "long-run"
  | "weak-model";

export type EvalSuiteId = "smoke" | "standard" | "stress";

export interface EvalCaseRef {
  id: string;
  title: string;
  difficulty: EvalSuiteId;
  manifestId: string;
}

export interface EvalSuite {
  id: EvalSuiteId;
  title: string;
  description: string;
  estimatedMinutes: string;
  cases: EvalCaseRef[];
}

export interface EvalCategory {
  id: EvalCategoryId;
  title: string;
  description: string;
  suites: EvalSuite[];
}
```

### 4.3 case manifest

每个 case 至少要有这些字段：

```ts
interface EvalCaseManifest {
  id: string;
  category: EvalCategoryId;
  suite: EvalSuiteId;
  title: string;
  description: string;
  fixtureSource: string;
  setup?: string[];
  taskPrompt: string;
  expectedVerification: string[];
  verifier: {
    type: "command" | "script" | "file-assert";
    command?: string;
    scriptPath?: string;
    fileAssertions?: Array<{
      path: string;
      mustExist?: boolean;
      mustContain?: string[];
      mustNotContain?: string[];
    }>;
  };
  scoring?: {
    requireCleanGitDiff?: boolean;
    maxChangedFiles?: number;
  };
}
```

关键点：

- prompt 只是任务描述，不是评分真值。
- verifier 必须可以独立运行。
- manifest 必须能决定如何初始化 workspace。

### 4.4 落盘结构

继续复用现有 `.deepreef/evals` 目录。

建议结构：

```text
.deepreef/evals/<run-id>/
  meta.json
  summary.json
  summary.md
  registry.json
  cases/<case-id>/
    manifest.json
    worker-output.md
    supervisor-output.md
    verifier.json
    score.json
    trace.jsonl
    patch.diff
    workspace/
```

### 4.5 评分原则

评分必须分层：

1. verifier verdict：最高优先级。
2. objective signals：例如 changed files、verification commands、diff size、tool failure count。
3. supervisor assessment：只能作为补充，不是主裁判。

MVP 建议公式：

```text
final = verifier 0.70 + objective_signals 0.20 + supervisor_judge 0.10
```

如果 verifier 明确失败，则 final 不得高于及格线。

## 5. case 来源策略

这是合并 `CASES.md` 后保留的核心结论。

| 优先级 | 来源 | 用途 | 是否进入 MVP |
| --- | --- | --- | --- |
| P0 | LoopRig native fixtures | 主 case 库 | 是 |
| P1 | Terminal-Bench 精选子集 | 工具使用、长任务 | 否，后续 |
| P2 | SWE-bench Lite 精选子集 | 真实仓库修复 | 否，后续 |
| P3 | harness-evals | scorer / baseline / CI gate | 否，后续 |
| P4 | LangChain agentevals | trajectory scorer | 否，后续 |
| P5 | agentevals-dev | OTel trace scorer | 否，后续 |

明确禁止的误区：

- 不要把 harness-evals 当作 `/eval` 的主 case 仓库。
- 不要把 agentevals 当作 case 来源。
- 不要把 Terminal-Bench / SWE-bench 全量接入。
- 不要在 smoke 套件里引入重 Docker 依赖。

## 6. MVP 范围

MVP 只实现 3 个 category 的 smoke 套件：

| category | 原因 |
| --- | --- |
| `coding-basics` | 最容易做 deterministic verifier，最接近 LoopRig 主用途 |
| `tool-use` | 能直接验证读文件、搜索、编辑、shell 的基本闭环 |
| `safety` | LoopRig 已有权限/deny 体系，适合做固定约束测试 |

MVP 暂不实现：

- `weak-model`
- `long-run`
- `supervisor-recovery`
- `standard` / `stress` 全量套件
- 外部 benchmark adapter
- OTel trace scorer
- 跨模型 leaderboard UI

原因不是这些不重要，而是它们都依赖更稳定的 fixture、verifier 和 workspace 隔离基础。

## 7. 分阶段开发计划

下面是别的 agent 必须遵守的实施顺序。

### 阶段 0：基线梳理与兼容保护

目标：不破坏现有 `/eval` runner。

任务：

1. 阅读并理解现有 `/eval` 路径：
   `packages/tui/src/commands.ts`
   `packages/tui/src/App.tsx`
   `packages/tui/src/bridge.tsx`
   `packages/core/src/scoring/*`
2. 给当前 `/eval` 旧行为补最小测试，防止后续重构直接打断。
3. 明确新旧入口兼容策略。

验收：

- 现有 `/eval --dry-run` 仍可运行。
- 现有 scoring store 不被破坏。

### 阶段 1：固定 registry 与 manifest loader

目标：把“固定评测内容”变成代码事实。

任务：

1. 新增 `packages/core/src/eval/types.ts`。
2. 新增 `packages/core/src/eval/registry.ts`，定义固定 category/suite/case。
3. 新增 `packages/core/src/eval/loader.ts`，负责读取 manifest。
4. 为 MVP 准备少量 native cases。
5. 保留旧 benchmark catalog，不要直接删除 `packages/core/src/scoring/benchmark-catalog.ts`。

实现要求：

- category/suite 由 registry 驱动，不从用户自由文本推导。
- manifest loader 要有 schema 校验。
- case 数量先少，不要为了“完整”塞大量 placeholder。

验收：

- 能从 registry 列出 `coding-basics/tool-use/safety` 的 smoke cases。
- manifest 校验失败时能给出明确错误。

### 阶段 2：隔离 workspace 与 deterministic verifier

目标：让 case 具备可重复性。

任务：

1. 新增 `packages/core/src/eval/workspace.ts`。
2. 为每个 case 创建独立运行目录。
3. 在 case 开始前复制 fixture。
4. 执行 setup 命令。
5. 在 case 结束后运行 verifier 并产出结构化结果。

实现要求：

- workspace 必须隔离到 `.deepreef/evals/<run-id>/cases/<case-id>/workspace` 或等价路径。
- verifier 失败时必须能落盘 stdout/stderr/exitCode。
- 不允许靠“Supervisor 说通过了”代替 verifier。

验收：

- 至少 3 个 smoke case 可以在隔离目录中重复运行。
- 相同 case 重跑能得到稳定 verdict。

### 阶段 3：固定 eval runner

目标：用固定外层流程驱动单 case 执行。

任务：

1. 新增 `packages/core/src/eval/runner.ts`。
2. 外层 runner 顺序执行固定 case 列表。
3. 单 case 内部调用现有 Worker/Supervisor runtime。
4. 汇总 verifier、objective signals、supervisor assessment。
5. 生成 case result 与 suite summary。

实现要求：

- 不要复制现有 `WorkflowCoordinator` 状态机。
- 如现有 `runEval()` 可复用，应在内部改造成新的固定 runner 基础，而不是完全并存两套评分器。
- 每个 case 完成后必须产出事件或回调，供 TUI 实时显示。

验收：

- 能完整跑完一个 smoke suite。
- 过程中能看到 per-case 进度。

### 阶段 4：TUI wizard

目标：把固定评测模式真正暴露给用户。

任务：

1. 新增 `packages/tui/src/eval/*` 基础组件。
2. `/eval` 默认打开 category/suite 选择流程。
3. 运行中展示当前 case、总进度、最近结果。
4. 结束后展示 summary 和报告路径。

实现要求：

- 不要求第一版做复杂卡片 UI。
- 优先保证键盘导航和状态切换正确。
- 旧 flags 模式可以保留为兼容分支。

验收：

- 用户可以不输入额外参数，仅靠 `/eval` 完成一次 smoke run。
- Esc / 返回 / 取消逻辑清晰，不污染主会话。

### 阶段 5：证据包与报告

目标：让评测结果可审计。

任务：

1. 新增 `packages/core/src/eval/report.ts`。
2. 输出 `summary.md`、`summary.json`、case 级证据文件。
3. 保存 Worker/Supervisor 原始输出、verifier 结果、patch diff、trace 摘要。

实现要求：

- Markdown 报告面向人看。
- JSON 面向后续程序消费。
- 不要只存 final score。

验收：

- 任意 case 失败时，维护者能从落盘证据看出失败原因。

### 阶段 6：增强项

这些全部排在 MVP 之后：

1. `supervisor-recovery`、`long-run`、`weak-model` category。
2. `standard` 与 `stress` suites。
3. Terminal-Bench adapter。
4. SWE-bench Lite adapter。
5. harness-evals baseline adapter。
6. LangChain agentevals trajectory scorer。
7. agentevals-dev / OTel trace scorer。

## 8. 初始 smoke cases 建议

MVP 不要追求多，建议先做 6 到 9 个。

### `coding-basics`

建议 3 个：

1. TypeScript 类型错误修复
2. JSON/CLI 解析 bug 修复
3. 小范围测试失败修复

### `tool-use`

建议 3 个：

1. 必须先搜索再编辑
2. 必须运行验证命令
3. 命令失败后重试并修正

### `safety`

建议 2 到 3 个：

1. 禁止越权修改 fixture 之外文件
2. 遇到 deny 命令必须放弃并说明
3. 只读 case 中不得产生写 diff

## 9. 代码落点建议

别的 agent 开发时，优先修改这些位置：

| 目的 | 文件或目录 |
| --- | --- |
| slash command 解析 | `packages/tui/src/commands.ts` |
| `/eval` 入口逻辑 | `packages/tui/src/App.tsx` |
| eval 异步桥接 | `packages/tui/src/bridge.tsx` |
| 新 eval 核心代码 | `packages/core/src/eval/` |
| 评分复用点 | `packages/core/src/scoring/*` |
| workflow/runtime 复用点 | `packages/core/src/workflow-coordinator/*`, `packages/core/src/dual-agent-runtime/*` |
| 权限与安全 case | `packages/core/src/permission/*`, `packages/core/src/resolve-effective-tools.ts` |

## 10. 包装与发布注意事项

这是原文档没处理、但对 LoopRig 很重要的问题。

当前 npm 发布物主要来自根 `dist/`，`package.json.files` 不包含整个 `packages/` 源树。因此如果 eval fixtures/manifest 只放在源码目录，打包后的 CLI 可能找不到它们。

后续 agent 必须在实现时二选一：

1. 把 MVP manifests/fixtures 纳入构建产物复制流程。
2. 或把小型 builtin case 元数据直接内嵌进可打包的 TS 模块。

没有解决这个问题前，不要宣称 `/eval` 可在发布版 CLI 中可靠使用。

## 11. 测试与验收

每个阶段至少跑这些验证：

```bash
bun run typecheck
bun test packages/core packages/tui packages/cli
```

涉及 `/eval` 的新增测试建议覆盖：

1. slash command 解析与兼容行为
2. registry / manifest schema 校验
3. workspace 初始化与清理
4. verifier verdict 解析
5. runner progress 回调
6. 报告落盘
7. TUI 最小交互路径

最终 MVP 验收标准：

1. 用户在 TUI 输入 `/eval` 后能选择固定 smoke suite。
2. 至少能稳定跑完 1 个 category 的 3 个 native cases。
3. 每个 case 都有独立 workspace、verifier 结果和 score。
4. 结果落盘到 `.deepreef/evals/<run-id>/...`。
5. 现有旧 `/eval` 开发者能力没有被静默破坏，或已有明确替代入口。

## 12. 对后续 agent 的明确约束

后续 agent 按本计划开发时，必须遵守这些规则：

1. 先做 registry、fixture、verifier，再做 fancy UI。
2. 先复用 `packages/core/src/scoring/*` 和现有 runtime，不要另起炉灶。
3. 不要把外部 benchmark 接入当成 MVP 前置条件。
4. 不要让 prompt judge 替代 deterministic verification。
5. 不要第一阶段创建 `packages/eval`。
6. 不要提交大量空壳 case 或只写文档不落地 fixture。
7. 不要破坏现有 `/eval` flag 路径而不提供兼容方案。

如果后续实现与本文件冲突，以本文件为准；如实现过程中发现仓库真实结构再次变化，应先更新本文件，再继续扩展 `/eval`。
