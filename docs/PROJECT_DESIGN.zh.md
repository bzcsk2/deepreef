# DeepReef 项目设计文档

最后整理：2026-06-24。

## 1. 项目定位

DeepReef 是一个终端原生 AI loop agent，核心目标是让便宜、免费、本地模型也能在明确监督、证据汇报、失败恢复和权限边界下完成真实工程任务。

当前产品心智是：

```text
Supervisor 规划/审查/纠偏
  -> Worker 执行工程任务
  -> Worker 汇报结果和证据
  -> Supervisor 判断继续、修正、完成、阻塞或询问用户
```

DeepReef 不把强模型当成每一步施工者，而是优先把强模型用于计划、审查、恢复和最终判断，把低成本模型用于大量可验证的执行工作。

## 2. 当前实现概览

仓库是 TypeScript/Bun monorepo，npm 包名为 `@deepreef/cli`，命令行入口为 `deepreef`。

主要能力：

- Bun/TypeScript CLI 与 Ink/React TUI。
- OpenAI-compatible provider 抽象，支持 Zen、DeepSeek、Mimo、Kilo、NVIDIA、Qwen、Kimi、Stepfun/ZAI、OpenAI 和本地 endpoint。
- `ReasonixEngine` 核心事件流，通过 `AsyncGenerator<LoopEvent>` 驱动 CLI/TUI。
- 文件、编辑、Shell、搜索、Web、Task、Workflow、Notebook、MCP、Skills 等内置工具。
- Deny-first 权限、防危险命令、stale-read、文件快照等安全机制。
- Plugin/content-pack、MCP 和 AgentMemory 集成。
- Supervisor/Worker 双 Agent runtime、WorkflowCoordinator、GoalStore、Mailbox 和结构化决策协议。
- TUI transcript store、bridge runtime、diagnostics、workflow 展示和 per-role 模型配置。

## 3. 包结构

| 包 | 路径 | 当前职责 |
| --- | --- | --- |
| `@deepreef/core` | `packages/core/` | 引擎、Provider 配置、上下文、会话、workflow、goal、mailbox、权限、harness、模型 profile、结构化协议。 |
| `@deepreef/cli` | `packages/cli/` | CLI/TUI 启动、pipe 模式、工具注册、plugin/memory/MCP 接线、双 Agent runtime 接线。 |
| `@deepreef/tui` | `packages/tui/` | Ink/React UI、bridge、timeline、命令、模型选择、workflow/goal 操作、诊断和设置。 |
| `@deepreef/tools` | `packages/tools/` | 默认工程工具、文件/编辑/Shell/Web/Task/Skill/Workflow/Notebook 工具。 |
| `@deepreef/mcp` | `packages/mcp/` | MCP host/client 以及 MCP 资源、工具列表、工具调用代理。 |
| `@deepreef/plugin` | `packages/plugin/` | PluginRuntime、content-pack、hook/rule/command/skill/tool 适配。 |
| `@deepreef/memory` | `packages/memory/` | AgentMemory runtime、memory tools、hooks、MCP server/proxy 和评估/检索能力。 |
| `@deepreef/security` | `packages/security/` | PermissionEngine、HookManager、FileSnapshot。 |
| `@deepreef/ink` | `packages/ink/` | 终端渲染基础组件和主题系统。 |
| `@deepreef/shell` | `packages/shell/` | 壳层状态基础设施。 |

## 4. 核心运行链路

```text
CLI/TUI
  -> ReasonixEngine
  -> ContextManager + ChatClient
  -> StreamingToolExecutor
  -> ToolRegistry / Permission / Hooks
  -> LoopEvent stream
  -> TUI bridge / transcript store
```

普通对话由 Worker 引擎直接处理。进入 loop/workflow 后，`DualAgentRuntime` 固定持有 Worker 和 Supervisor 两个引擎，`WorkflowCoordinator` 推动阶段状态机：

```text
idle
  -> supervisor_analyse
  -> worker_do
  -> worker_report
  -> supervisor_check
  -> supervisor_intervene / waiting_user / completed / blocked / failed
```

当前主路径仍通过 coordinator state 传递 plan/report；Mailbox 工作流路径保留，默认未开启为主路径。

## 5. Goal 与 Mailbox

`GoalStore` 已落地为文件持久化：

```text
.deepreef/sessions/<threadId>/goal.json
```

状态模型：

```text
active | paused | blocked | usage_limited | budget_limited | complete
```

模型侧 `update_goal` 只允许 `complete` 或 `blocked`。暂停、恢复、预算限制、清除由用户命令或系统控制。

Mailbox 已落地为 JSONL 队列能力，提供 `send_message`、`followup_task`、`read_mailbox` 等工具；真实 CLI 已注册动态 provider，避免工具固定到过期 workflow/controller。

## 6. 配置现状

当前已实现的配置主要是窄配置：

- `.deepreef/last-config.json`：全局 fallback 模型配置。
- `.deepreef/role-config.json`：Worker/Supervisor per-role 模型配置。
- `.deepreef/model-targets.json`：项目级模型目标覆盖。
- 环境变量：provider API key/base URL/model，memory 开关等。
- TUI settings：界面和 workflow 偏好。

尚未实现完整的 `~/.deepreef/config.toml` / `<project>/.deepreef/config.toml` 统一配置系统，也没有 `deepreef config path|edit|validate|doctor` 命令。

## 7. 当前边界

DeepReef 当前是 pre-1.0：

- Workflow/goal/mailbox 已有真实接线和测试，但可靠性仍在打磨。
- TUI 长会话性能已有 store/diagnostics 基础，仍需要继续窗口化和上限治理。
- 配置系统还没有统一到完整 schema/control-plane。
- Public API、配置文件格式和内部包边界仍可能调整。

详细状态见 [STATUS.md](STATUS.md)，后续计划见 [TODO.md](TODO.md)。
