# 架构

最后更新：2026-06-25。

## 产品意图

DeepReef 是一个终端原生的 AI 循环代理运行时，专为受监督的本地、免费和低成本编码模型设计。其核心产品理念并非"一个强大模型包办一切"，而是一个受控循环：更强或更可靠的模型负责规划、审查、恢复和判断，而更便宜或本地的模型负责执行可验证的工作。

当前的思维模型如下：

```text
Supervisor 规划 / 审查 / 纠正
  -> Worker 执行工程工作
  -> Worker 报告结果和证据
  -> Supervisor 决定继续 / 修改 / 完成 / 阻塞 / 询问用户
```

DeepReef 处于 pre-1.0 阶段。公共 API、配置结构、包边界和提供者预设仍可能发生变化。

## 仓库结构

DeepReef 是一个 TypeScript/Bun 单体仓库，以 `@deepreef/cli` 形式发布。可执行命令为 `deepreef`。

| 包 | 路径 | 职责 |
| --- | --- | --- |
| `@deepreef/core` | `packages/core/` | 引擎、提供者配置、上下文、会话、工作流、目标、邮箱、权限、测试框架、模型配置文件、结构化协议。 |
| `@deepreef/cli` | `packages/cli/` | CLI 入口、TUI 启动、管道模式、工具注册、插件/内存/MCP 连接、Supervisor/Worker 连接。 |
| `@deepreef/tui` | `packages/tui/` | Ink/React UI、桥接、时间线、斜杠命令、模型选择器、工作流/目标用户体验、诊断、设置。 |
| `@deepreef/tools` | `packages/tools/` | 默认工程工具：文件、编辑、shell、搜索、web、任务、技能、工作流、笔记本。 |
| `@deepreef/mcp` | `packages/mcp/` | MCP 主机/客户端、资源列表、工具列表、代理工具调用。 |
| `@deepreef/plugin` | `packages/plugin/` | 插件运行时、内容包、钩子、规则、命令、技能、工具。 |
| `@deepreef/memory` | `packages/memory/` | AgentMemory 运行时、内存工具、钩子、MCP 服务器/代理、评估/检索。 |
| `@deepreef/security` | `packages/security/` | 权限引擎、钩子管理器、文件快照保护。 |
| `@deepreef/ink` | `packages/ink/` | 终端渲染原语和主题基础设施。 |
| `@deepreef/shell` | `packages/shell/` | Shell 状态基础设施。 |

## 运行时映射

```text
TUI / CLI / 管道模式
        |
        v
ReasonixEngine
        |
        v
AsyncGenerator<LoopEvent>
        |
        +-- ContextManager / ChatClient / SessionWriter
        +-- StreamingToolExecutor / Permission / Hooks
        +-- WorkflowCoordinator / DualAgentRuntime
        +-- Plugin / MCP / Memory
        |
        v
TUI 桥接 / 转录存储 / 运行时状态
```

核心引擎发出事件流。CLI 和 TUI 消费者将该流投射为文本输出、时间线条目、状态栏、权限提示、问题提示和工作流状态。

## 核心引擎边界

| 路径 | 角色 |
| --- | --- |
| `packages/core/src/engine.ts` | `ReasonixEngine`：提交、恢复、配置更新、工具注册。 |
| `packages/core/src/loop.ts` | 主单代理循环。 |
| `packages/core/src/client.ts` | 兼容 OpenAI 的 SSE 客户端。 |
| `packages/core/src/config/` 和 `packages/core/src/config.ts` | 统一配置管理器及提供者/模型预设。 |
| `packages/core/src/context/` | 不可变前缀、追加日志、草稿、修复、摘要、令牌估算。 |
| `packages/core/src/streaming-executor.ts` | 共享/独占流式工具执行。 |
| `packages/core/src/workflow-coordinator/` | Supervisor/Worker 状态机和结构化协议。 |
| `packages/core/src/goal/` | GoalStore、GoalRuntime、目标工具、引导提示。 |
| `packages/core/src/agent-comm/` | 邮箱、AgentCommController、邮箱工具。 |
| `packages/core/src/dual-agent-runtime/` | Worker/Supervisor 引擎封装。 |
| `packages/core/src/resolve-effective-tools.ts` | 按角色/模式/工作流阶段筛选工具。 |

## CLI 启动路径

`packages/cli/src/index.ts` 处理顶级命令分发。`packages/cli/src/tui.ts` 执行交互式运行时连接：

1. 加载配置。
2. 创建 `ReasonixEngine`。
3. 在后台加载 MCP、插件/内容包和内存系统。
4. 注册默认工具、插件工具、MCP 代理工具和内存工具。
5. 在 TTY 模式下，创建 Supervisor 引擎、`DualAgentRuntime`、`GoalStore`、`Mailbox` 和 `WorkflowCoordinator`。
6. 注册动态目标/邮箱治理工具，使工具执行读取当前工作流/线程/控制器而非过期对象。
7. 渲染 `@deepreef/tui` 应用。

非 TTY 输入使用管道模式。

## TUI 状态路径

TUI 入口点包括：

- `packages/tui/src/App.tsx`
- `packages/tui/src/bridge.tsx`
- `packages/tui/src/store/bridge-runtime.ts`
- `packages/tui/src/store/transcript-store.ts`
- `packages/tui/src/store/transcript-reader.ts`
- `packages/tui/src/DeepiMessages.tsx`

UI 中仍包含部分旧桥接状态，而较新的存储/运行时组件负责转录、诊断和有界队列的职责。长会话的性能优化应聚焦于转录存储、读取器缓存行为、桥接运行时队列限制和时间线渲染窗口。不要将 UI 裁剪与核心引擎上下文截断混为一谈，除非任务明确涉及两者。

## 工作流循环

`WorkflowCoordinator` 驱动当前的 Supervisor/Worker 循环：

```text
idle
  -> supervisor_analyse
  -> worker_do
  -> worker_report
  -> supervisor_check
  -> supervisor_intervene
  -> waiting_user
  -> completed / blocked / failed
```

当前行为：

- Supervisor 在 `supervisor_analyse` 阶段生成计划。
- Worker 在 `worker_do` 阶段执行计划。
- Worker 在 `worker_report` 阶段报告结果和证据。
- Supervisor 在 `supervisor_check` 阶段审查证据并决定下一个状态。
- `parseSupervisorDecision()` 优先使用 Zod 验证的结构化 JSON。
- 旧版字符串回退方式仍然可用，但应视为较低置信度。
- `approve` 仅在完成审计具有证据时才能通过。
- `blocked` 需要重复的阻塞证据，而非单个未经支持的断言。
- 邮箱工作流存在于 `useMailboxWorkflow` 分支之后，但默认路径仍通过协调器状态传递计划/报告。

## 目标与邮箱

`GoalStore` 将会话树下的活动循环目标持久化：

```text
.deepreef/sessions/<sessionId>/goal.json
```

目标状态值：

```text
active | paused | blocked | usage_limited | budget_limited | complete
```

模型侧的 `update_goal` 有意保持窄范围：它只能标记为 `complete` 或 `blocked`；暂停、恢复、预算限制和清除操作属于用户/系统控制。这防止模型静默重写用户的治理状态。

邮箱支持使用 JSONL 风格的队列语义，并暴露 `send_message`、`followup_task` 和 `read_mailbox`。它对于未来的多步代理通信很有用，但还不是默认的工作流传输方式。

## 工具与权限边界

`resolveEffectiveTools()` 是核心的工具筛选边界：

- Worker 循环根据代理配置和硬策略接收工程工具。
- Supervisor 循环接收按阶段限定的工具；在审查阶段不应自由自我探索或编辑。
- Supervisor 单独/子代理路径使用较小的允许列表。
- 目标和邮箱工具是由协调器管理的治理工具，而非任意 Worker 工具。
- 写操作仍会经过权限和钩子系统。
- 配置中的工具策略 `deny` 规则是硬性拒绝，不能通过 TUI 权限提示覆盖。

## 提供者与模型层

提供者预设位于 `packages/core/src/config.ts`；统一配置加载位于 `packages/core/src/config/` 下。当前提供者系列包括 `zen`、`deepseek`、`mimo`、`kilo`、`openai-compatible`、`nvidia`、`qwen`、`kimi`、`zai`、`stepfun` 和 `openai`。

确切的模型矩阵和推荐的角色分配维护在 [OPERATIONS.md](OPERATIONS.md#model-providers) 中。

## 扩展系统

- 插件/内容包：`packages/plugin/`
- MCP：`packages/mcp/`
- 技能：`packages/tools/src/skills/` 以及插件技能目录
- AgentMemory：`packages/memory/`

这些系统应在启动时软失败。失败的扩展不应阻止基础 CLI/TUI 代理运行，除非用户明确将该扩展标记为必需。

## 当前实现状态

已实现的基础设施：

- CLI、TUI、核心运行时、工具、安全、插件、MCP、内存、工作流、目标和邮箱基础设施。
- 统一的 TOML 配置控制平面，包含用户/项目配置路径和配置 CLI 命令。
- Supervisor/Worker 结构化决策解析与审计门控。
- TUI i18n 基础，支持中文/英文切换。
- 有界的长会话 TUI 存储/渲染工作已有基线实现。

仍在加固中：

- 工作流在真实工程任务上的可靠性。
- 目标延续和预算治理与真实用量计费的关联。
- 提供者能力画像和本地模型推荐。
- 跨平台包/安装验证。
- 公共 API 稳定性。

## 真相来源路径

| 主题 | 来源 |
| --- | --- |
| CLI 入口 | `packages/cli/src/index.ts`、`packages/cli/src/tui.ts` |
| 引擎 | `packages/core/src/engine.ts`、`packages/core/src/loop.ts` |
| 配置 | `packages/core/src/config/`、`packages/cli/src/commands/config.ts` |
| 提供者预设 | `packages/core/src/config.ts` |
| 工作流 | `packages/core/src/workflow-coordinator/` |
| 目标 | `packages/core/src/goal/` |
| 邮箱 | `packages/core/src/agent-comm/` |
| TUI 应用 | `packages/tui/src/App.tsx` |
| TUI 存储 | `packages/tui/src/store/` |
| 斜杠命令 | `packages/tui/src/CommandRegistry.ts`、`packages/tui/src/commands.ts` |
| 工具筛选 | `packages/core/src/resolve-effective-tools.ts` |
| 默认工具 | `packages/tools/src/` |

## 编码代理的不变规则

- 不要将 Supervisor 和 Worker 合并为无差别的代理，除非任务明确涉及产品重新设计。
- 不要让 Supervisor 在每个工作流阶段都获得广泛的写/搜索工具访问权限。
- 在工作流路径期望审计时，不要将模型的主张视为无需证据的完成。
- 不要将会话、目标、邮箱条目、令牌用量或工作流阶段等运行时状态移入静态项目文档。
- 不要让本地扩展失败成为致命错误，除非用户选择了那种严格行为。
- 不要添加新的公共命令、配置键或提供者 ID 而未更新 `OPERATIONS.md` 和测试。
