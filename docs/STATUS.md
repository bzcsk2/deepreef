# Current Status

最后整理：2026-06-24。

## 总体状态

DeepReef 当前处于 pre-1.0。核心 CLI、TUI、工具、安全、plugin、MCP、memory、workflow、goal 和 mailbox 基础已经落地，但 workflow 可靠性、统一配置系统和长会话 TUI 性能仍是主要打磨方向。

## 已落地

### Core

- `ReasonixEngine` 主 loop。
- OpenAI-compatible SSE client。
- provider/model 配置和热更新。
- Immutable prefix、append log、scratch、context policy、repair。
- Session 读写、恢复和 cleanup。
- StreamingToolExecutor，支持 shared/exclusive 工具调度。
- 权限服务、read-before-write、stale-read、防危险命令等基础安全能力。
- Harness strictness、model profile、capability catalog、benchmark 基础。

### Workflow / Goal / Mailbox

- `DualAgentRuntime` 持有 Worker/Supervisor。
- `WorkflowCoordinator` 阶段状态机。
- 结构化 Supervisor plan/report/decision schema。
- Supervisor decision 优先结构化解析，legacy fallback 标记 low confidence。
- 完成审计和阻塞审计 gate。
- `GoalStore` 文件持久化和 `/goal` TUI 命令。
- `get_goal`、`update_goal` 工具。
- `Mailbox`、`AgentCommController`、`send_message`、`followup_task`、`read_mailbox`。
- CLI 中动态注册 goal/mailbox 工具。

### TUI

- Ink/React TUI。
- Bridge、transcript store、transcript reader、bridge runtime。
- Model picker、session picker、skill modal、context modal、search overlay。
- Workflow mode router 和 workflow 状态展示。
- per-role 模型配置持久化。
- TUI diagnostics/frame metrics 基础。

### Ecosystem

- 默认工程工具集。
- MCP host/client 和 MCP 代理工具。
- Plugin/content-pack runtime。
- AgentMemory runtime、tools、hooks 和 MCP surface。
- Skills 加载和 plugin skill dirs。

## 部分落地或仍需打磨

- Workflow 主路径可运行，但可靠性仍需要更多真实任务 e2e 和失败恢复验证。
- Mailbox workflow 分支存在，但默认主路径仍使用 coordinator state 传递 plan/report。
- GoalRuntime 有 budget/usage/continuation 基础，但完整 idle continuation 与成本治理还需要收口。
- Supervisor/Worker 工具过滤已经分 role/phase，但实际任务中的工具集仍需要继续调参。
- TUI 长会话性能已有 store/diagnostics 基础，仍需要继续做窗口化和数据保留上限。
- Provider 列表较多，但各 provider 的模型能力 profile 和推荐组合还不完整。

## 尚未落地

- 完整统一配置系统：
  - `~/.deepreef/config.toml`
  - `<project>/.deepreef/config.toml`
  - `deepreef config path|edit|validate|doctor`
  - 配置迁移和模板。
- 稳定 public API。
- 完整跨平台 release/install 验证矩阵。
- 面向真实项目的 workflow reliability benchmark 报告。
- IDE/Web shell。

## 当前权威路径

| 主题 | 文件 |
| --- | --- |
| CLI 接线 | `packages/cli/src/tui.ts` |
| 引擎 | `packages/core/src/engine.ts`, `packages/core/src/loop.ts` |
| 配置 | `packages/core/src/config.ts`, `packages/core/src/schemas/config.ts` |
| Workflow | `packages/core/src/workflow-coordinator/` |
| Goal | `packages/core/src/goal/` |
| Mailbox | `packages/core/src/agent-comm/` |
| TUI app | `packages/tui/src/App.tsx` |
| TUI store | `packages/tui/src/store/` |
| 工具过滤 | `packages/core/src/resolve-effective-tools.ts` |
| 默认工具 | `packages/tools/src/` |
