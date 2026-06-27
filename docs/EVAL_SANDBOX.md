# LoopRig `/eval` 沙箱实施计划

最后更新：2026-06-27。

本文件是给后续开发 agent 的实施规范，不是讨论稿。目标是为 LoopRig 增加正式可用的 `/eval` 沙箱机制，并且保持当前“主 TUI 实时可见”的交互方式，不退回子菜单或隐藏执行。

## 1. 目标

本次要落地的是三件事：

1. `/eval` 的官方分数默认来自沙箱环境，而不是宿主真实环境。
2. 用户在 TUI 中运行 `/eval` 时，仍然像 `/loop` 一样实时看到 Worker/Supervisor 的执行过程。
3. Linux 默认强沙箱使用 `bubblewrap`，并且 **LoopRig 自带可用的 `bwrap`**，用户不需要额外安装。

要区分两类结果：

- 官方可比分数：`sandbox`，后续可扩展到 `container`
- 诊断结果：`localenv`

`localenv` 只用于真实项目诊断，不进入默认官方分数。

## 2. 现状判断

基于当前仓库，必须从这些事实出发：

- 当前固定评测代码已经在 `packages/core/src/eval/*` 和 `packages/tui/src/eval/*`。
- 当前 `packages/core/src/eval/workspace.ts` 只有 fixture 复制、workspace 初始化、baseline git commit；这只是轻隔离，不是 OS 级沙箱。
- 当前 `packages/core/src/eval/verifier.ts` 直接在宿主机上 `execSync` 跑命令，没有 provider 抽象。
- 当前 `/eval` 已经接到主 TUI 流程里，最近也已经修过 Worker/Supervisor 双引擎接线和实时运行问题。
- 当前根包 `package.json` 的 npm 打包内容只有 `dist` 和文档，没有任何原生资源分发链路。
- 当前项目展示名已经是 LoopRig，但仓库里仍有 `@deepreef/*` 包名和 `.deepreef` 运行目录；本任务不要顺手大规模改这些历史路径。

结论：

- 不能另起一套平行 runtime。
- 不能把 `/eval` 再做回隐藏子流程。
- 不能只做“建议安装 `bwrap`”；必须做“内置可用 fallback”。

## 3. 必须遵守的决策

后续 agent 按下面的约束开发，不要自行改方向。

### 3.1 交互约束

- `/eval` 必须继续在主 TUI 内运行。
- Worker/Supervisor 的消息、工具调用、阶段变化必须继续走现有 bridge/timeline。
- 不允许把 case 执行放进看不见的子菜单、子终端、隐藏 transcript。
- `/eval-cancel` 必须仍然能中断当前 case 和整个评测运行。

### 3.2 评分约束

- `sandbox` 是默认官方评测环境。
- `localenv` 是诊断模式，默认不记入官方能力分。
- 后续加 `container` 时，也可以进入官方分，但必须记录镜像和配置。
- 任何“直接在宿主当前项目里执行”的模式，都不能当默认官方分数来源。

### 3.3 架构约束

- 第一阶段不要新建独立 `packages/eval`。
- 沙箱能力落在 `packages/core`，UI 调整落在 `packages/tui`。
- 优先复用现有 `runFixedEval()`、EvalWizard、bridge、dual runtime、permission/governance。
- 不要照搬 Codex 的 Rust 实现；只学习它的分层思路和 `bwrap` fallback 策略。

### 3.4 分发约束

- LoopRig 必须随包携带 Linux `bwrap` 二进制。
- 运行时优先使用系统 PATH 中可用的 `bwrap`。
- 如果系统没有 `bwrap`，自动回退到 LoopRig 自带的二进制。
- 不允许要求用户手动安装 `bwrap` 才能用默认 `/eval sandbox`。
- 不允许运行时联网下载 `bwrap`。

## 4. 用户侧目标行为

`/eval` 的用户侧主结构要固定为：

```text
测试大项固定：
  1. Worker 基础编码能力
  2. Worker 工具使用能力
  3. 弱模型稳定性
  4. Supervisor 纠偏能力
  5. 长任务持续运行能力
  6. 安全边界与权限控制

测试环境固定：
  1. sandbox
  2. container
  3. localenv
```

目标用户流如下：

```text
/eval
  -> 选择 category
  -> 选择 environment（默认 sandbox）
  -> 选择固定测试集
  -> 开始运行
  -> 主 TUI 实时显示 worker/supervisor 过程
  -> 每个 case 结束后显示 PASS/FAIL/ERROR、score、provider
  -> 全部结束后显示 summary 和 report 路径
```

这里的“固定测试集”是 category + environment 下的预定义 case 集，不再对用户暴露 `smoke / standard / stress`。

环境定义固定为：

- `sandbox`
  - 默认官方评测环境
  - 使用 fixture-copy 或 git worktree
  - 任务固定、依赖固定、验证命令固定
  - Linux 强隔离提供者是 `bwrap`
- `container`
  - 强隔离评测环境
  - 使用 Docker / Podman，后续可扩展到 gVisor
  - 用于外部 benchmark 和复杂依赖 case
- `localenv`
  - 当前项目的 shadow workspace / worktree 诊断模式
  - 默认不进入官方分

每个 category 下都要固定提供这三个环境入口，含义如下：

- Worker 基础编码能力
  - `sandbox`：固定小型编码 case
  - `container`：真实依赖项目和外部 benchmark case
  - `localenv`：当前项目编码流程诊断
- Worker 工具使用能力
  - `sandbox`：基础 read/edit/search/shell/verifier 工具链
  - `container`：复杂 shell、依赖安装、跨语言工具链
  - `localenv`：用户真实工具链适配性
- 弱模型稳定性
  - `sandbox`：固定 harness 下能否闭环
  - `container`：复杂工程环境下的稳定性
  - `localenv`：真实项目中的循环、停滞、失控观察
- Supervisor 纠偏能力
  - `sandbox`：基于固定失败证据的纠偏
  - `container`：复杂失败、多轮恢复
  - `localenv`：真实项目中的接管效果
- 长任务持续运行能力
  - `sandbox`：多 case 连续运行
  - `container`：长依赖链、多阶段 verifier
  - `localenv`：真实项目连续工作能力
- 安全边界与权限控制
  - `sandbox`：forbidden files、workspace 边界、危险命令拒绝
  - `container`：更强隔离下的网络、进程、文件系统权限
  - `localenv`：真实环境权限风险诊断

如果当前平台没有正式强沙箱 provider：

- Linux：允许 `soft-workspace` 作为过渡，但 UI 必须明确标注为“diagnostic only”或“fallback”
- macOS / Windows：第一阶段可以先只支持 `soft-workspace` / `localenv`
- 不要伪装成“官方 sandbox 已启用”

## 5. 代码落点

推荐目录如下：

```text
packages/core/src/sandbox/
  types.ts
  detect.ts
  provider-registry.ts
  soft-workspace.ts
  bwrap.ts
  bundled-bwrap.ts
  exec.ts

packages/core/src/eval/
  types.ts
  workspace.ts
  verifier.ts
  runner.ts
  report.ts

packages/tui/src/eval/
  EvalWizard.tsx
  EvalRunPanel.tsx
  EvalSummaryPanel.tsx
```

说明：

- `sandbox/*` 负责 provider 发现、命令包装、平台差异。
- `eval/*` 负责 case workspace、manifest、verifier、runner、report。
- 不要把 `bwrap` 逻辑散落到 `workspace.ts` 或 `verifier.ts` 里。

## 6. 核心抽象

至少补齐下面这组类型。

```ts
export type EvalEnvironmentId = "sandbox" | "localenv" | "container";

export type EvalCategoryId =
  | "coding-basics"
  | "tool-use"
  | "weak-model"
  | "supervisor-recovery"
  | "long-run"
  | "safety";

export type SandboxProviderId =
  | "soft-workspace"
  | "bwrap"
  | "seatbelt"
  | "docker";

export interface SandboxCapabilities {
  available: boolean;
  official: boolean;
  providerId: SandboxProviderId;
  reason?: string;
}

export interface SandboxCommand {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNetwork?: boolean;
  readRoots: string[];
  writeRoots: string[];
  readonlyRoots?: string[];
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface SandboxProvider {
  id: SandboxProviderId;
  canRun(): Promise<SandboxCapabilities>;
  run(input: SandboxCommand): Promise<SandboxResult>;
}
```

现有 eval 类型需要增加环境维度，例如：

```ts
export interface EvalCaseManifest {
  category: EvalCategoryId;
  environment: EvalEnvironmentId;
  cases: Array<{
    id: string;
    title: string;
    source: string;
    workspace: {
      mode: "fixture-copy" | "git-worktree" | "container";
      path?: string;
      image?: string;
    };
    isolation: {
      type: EvalEnvironmentId;
      allowNetwork?: boolean;
      allowOutsideWorkspace?: boolean;
      requireGitClean?: boolean;
      generatePatchOnly?: boolean;
      officialScore: boolean;
    };
    verify: {
      commands: string[];
    };
  }>;
}
```

`FixedEvalOptions` 至少需要增加：

```ts
environmentId?: EvalEnvironmentId;
testSetId?: string;
```

迁移约束：

- 当前代码里的 `suite` 字段可以暂时保留为内部兼容层。
- 但新的 `/eval` 用户交互和新文档中，不再把 `smoke / standard / stress` 作为正式主结构。
- 如果需要兼容旧 fixture，可把旧 `suite` 映射为内部 `testSetId`，不要继续暴露给用户。

## 7. provider 选择规则

第一阶段规则写死，不要做成复杂策略系统。

### 7.1 `sandbox`

Linux：

1. 尝试系统 PATH 中的 `bwrap`
2. 否则尝试 LoopRig 自带 `bwrap`
3. 两者都不可用时，降级到 `soft-workspace`
4. 降级后结果必须标注为非官方或 fallback，不得混入正式分数

macOS：

1. 第一阶段先不做正式强沙箱
2. 可临时走 `soft-workspace`
3. 后续单独补 `seatbelt`

Windows：

1. 第一阶段先不做原生强沙箱
2. 可临时走 `soft-workspace`
3. 后续再评估 WSL2 + `bwrap` 或原生实现

### 7.2 `localenv`

- 默认 provider 是 `soft-workspace` 或 `worktree`
- 必须显式标记为 diagnostic
- 如果实现真实当前项目副本，优先 `git worktree`，其次 shadow copy

### 7.3 `container`

- 第一阶段不必落地
- 类型和 UI 先留扩展位即可

## 8. `bwrap` 的强制要求

这是本次文档的重点，后续 agent 不要弱化。

### 8.1 必须自带二进制

仓库需要新增资源目录，至少覆盖：

```text
packages/cli/resources/bwrap/linux-x64/bwrap
packages/cli/resources/bwrap/linux-arm64/bwrap
```

如果当前只做 Linux，第一版只要求这两个架构。

不要做成：

- 只在 README 里提示用户 `apt install bubblewrap`
- 运行时自动 curl 下载
- 发布包不带二进制，只在本地开发目录里存在

### 8.2 打包要求

根包和 CLI 包都要能把资源带进 npm 包。

至少要做这些事：

- 更新根 `package.json` 的 `files`，把资源目录纳入发布内容
- 在 `build` 或 `prepublishOnly` 阶段把 `packages/cli/resources` 复制进最终发布目录
- 提供稳定的运行时查找函数，例如 `resolveBundledBwrap()`
- `npm pack --dry-run` 必须能看到 `bwrap` 资源进入 tarball

### 8.3 运行时查找规则

固定顺序：

1. `which bwrap`
2. 验证系统 `bwrap` 可执行
3. 否则查找随包分发的 `bwrap`
4. 验证 bundled `bwrap` 可执行
5. 都失败则返回明确诊断

诊断信息必须包含：

- 当前平台
- 当前架构
- 系统 `bwrap` 是否存在
- bundled `bwrap` 查找路径
- 为什么不可用

### 8.4 `bwrap` 最小策略

Linux 官方 sandbox 最小策略要求：

- 根文件系统只读
- workspace 可写
- workspace 内 `.git` 默认只读
- 默认无网络
- 新 PID namespace
- 独立 session
- 清理敏感环境变量
- `HOME` 指向 workspace 内临时目录
- verifier 和 shell 工具命令都通过同一层 sandbox 包装执行

不要把 `bwrap` 只接到 verifier。那样 Worker 期间跑的 shell 仍然在宿主机上，沙箱就不成立。

## 9. 与现有 eval 的接线要求

后续 agent 需要按下面的边界改，不要越改越散。

### 9.1 `workspace.ts`

当前职责太单一，需要拆成两层：

- workspace staging
  - 建 run 目录
  - copy fixture / create worktree
  - baseline git init + commit
- sandbox session metadata
  - 当前 provider
  - 是否 official
  - workspace roots
  - home/tmp 目录

### 9.2 `verifier.ts`

当前 `execSync(command, { cwd: workspaceDir })` 必须改掉。

目标：

- verifier 命令统一走 `SandboxProvider.run()`
- file-assert verifier 仍然可以直接读 workspace 文件
- script verifier 也必须跑在同一 sandbox 里

### 9.3 Worker/Supervisor 执行

`runFixedEval()` 不能只 sandbox verifier，还必须 sandbox Worker 实际执行环境。

要求：

- case 运行前把本次 workspace 根目录传给当前 engine/runtime
- shell 工具调用必须落到 sandbox wrapper
- 读写文件工具必须受现有 workspace scope 约束
- 现有 bridge/timeline 继续显示 live 过程

如果当前 runtime 无法按 case 动态切换 workspace：

- 先补 runtime 级 workspace override
- 不要绕开现有 bridge 直接偷偷起一个“离屏 agent”

### 9.4 报告

报告至少新增这些字段：

```ts
providerId: SandboxProviderId;
environmentId: EvalEnvironmentId;
categoryId: EvalCategoryId;
testSetId: string;
officialScore: boolean;
fallbackReason?: string;
```

最终 Markdown/JSON 报告里必须能看出：

- 本次跑的是 `sandbox` 还是 `localenv`
- 实际 provider 是 `bwrap` 还是 `soft-workspace`
- 是否属于官方可比分数

## 10. 分阶段实施

按下面顺序推进，不要跳阶段。

### P0：保持主 TUI 实时执行不回退

目标：

- `/eval` 继续走现有主界面
- Worker/Supervisor 过程实时可见
- 不引入新的隐藏子菜单执行流

验收：

- 手动运行 `/eval`
- TUI 中可以持续看到 Worker 工具调用和阶段流转
- `/eval-cancel` 仍然有效

### P1：抽出 `SandboxProvider`，保留 `soft-workspace`

目标：

- 为现有 `workspace copy + baseline git` 实现 provider 化
- verifier 命令改为统一走 provider
- 报告和类型补 `category/environment/testSet` 字段

验收：

- 现有 eval 测试全部通过
- 旧 fixture 兼容运行不回归
- report 能显示 provider=`soft-workspace`

### P2：Linux `bwrap` provider + bundled fallback

目标：

- 增加 `bwrap` provider
- 增加 bundled `bwrap` 解析
- Linux `sandbox` 默认优先 `bwrap`

验收：

- 在系统未安装 `bwrap` 的 Linux 上，靠 bundled binary 也能跑 `/eval sandbox`
- 在系统已安装 `bwrap` 的 Linux 上，优先使用系统版本
- verifier 与 Worker shell 都运行在 `bwrap` 中
- 默认禁网有效
- 试图访问 workspace 外路径会失败

### P3：`localenv` 诊断模式

目标：

- 支持当前项目 `git worktree` 或 shadow workspace
- 默认不进入官方分

验收：

- 报告明确 `officialScore=false`
- 真实项目不会被直接原地修改

### P4：`container`

目标：

- 为后续外部 benchmark 预留正式 provider

第一阶段不要求实现完成。

## 11. 测试要求

至少补这几类测试。

### 单元测试

- `resolveBundledBwrap()` 在不同平台/架构下的路径选择
- provider 探测顺序：系统 `bwrap` 优先，bundled 次之
- `officialScore` / fallback 规则

### 集成测试

- `runFixedEval()` 在 `soft-workspace` 下可正常完成
- Linux 上 `bwrap` provider 的 argv 生成正确
- verifier 命令通过 provider 运行，而不是直接宿主 `execSync`

### 打包测试

- `npm pack --dry-run` 包含 bundled `bwrap`
- 发布产物中资源路径存在

### 手动验收

- 本机未安装 `bwrap` 时，`/eval sandbox` 仍可运行
- TUI 可实时看到 Worker 测试过程
- 最终报告能显示 provider、official/fallback 状态、report 路径

## 12. 明确不做的事

本轮不做这些：

- 不重写整套 eval runtime
- 不把 `/eval` 再拆成独立 app
- 不先做 Terminal-Bench / SWE-bench 接入
- 不顺手全面重命名 `@deepreef/*` 包名或 `.deepreef` 目录
- 不要求用户自行安装 `bwrap`
- 不依赖运行时下载原生二进制

## 13. 最终交付标准

只有同时满足下面条件，才算这轮沙箱机制完成：

1. `/eval` 继续在主 TUI 中实时可见运行，不是子菜单。
2. LoopRig Linux 默认 `sandbox` 可以使用 `bwrap`。
3. 本机没装 `bwrap` 时，LoopRig 自带的 bundled `bwrap` 仍可工作。
4. Worker 的 shell 执行和 verifier 都经过同一层 sandbox provider。
5. 报告能明确区分 `official sandbox score` 和 `diagnostic/localenv result`。
6. 发布包里真实包含 `bwrap` 资源，而不是仅开发态可用。

后续 agent 直接按本文件实施，不要再把方案改回“只做本地 copy workspace”或“让用户自行安装 `bwrap`”。
