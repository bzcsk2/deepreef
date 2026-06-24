# Architecture

最后整理：2026-06-24。

## 总体形态

DeepReef 是 TypeScript/Bun monorepo，采用核壳分离：

```text
TUI / CLI / pipe mode
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
```

核心引擎输出事件流，TUI 通过 bridge 和 store 把事件投影成 timeline、状态栏、权限提示、问题提示和 workflow 状态。

## 核心包

| 路径 | 说明 |
| --- | --- |
| `packages/core/src/engine.ts` | `ReasonixEngine`，对外提交、恢复、配置更新、工具注册。 |
| `packages/core/src/loop.ts` | 主 agent loop。 |
| `packages/core/src/client.ts` | OpenAI-compatible SSE client。 |
| `packages/core/src/config.ts` | provider、last-config、role-config、model-targets。 |
| `packages/core/src/context/` | immutable prefix、append log、scratch、repair、summary、token estimation。 |
| `packages/core/src/streaming-executor.ts` | 工具执行器，区分 shared/exclusive。 |
| `packages/core/src/workflow-coordinator/` | Supervisor/Worker 阶段状态机和结构化协议。 |
| `packages/core/src/goal/` | GoalStore、GoalRuntime、goal tools、steering prompt。 |
| `packages/core/src/agent-comm/` | Mailbox、AgentCommController、mailbox tools。 |
| `packages/core/src/dual-agent-runtime/` | Worker/Supervisor 双引擎封装。 |
| `packages/core/src/resolve-effective-tools.ts` | 根据 role、mode、workflow phase 过滤工具。 |

## CLI 启动链路

`packages/cli/src/tui.ts` 负责真实接线：

- 加载 `loadConfig()`。
- 初始化 `ReasonixEngine`。
- 后台加载 MCP、Plugin/content-pack、Memory。
- 注册默认工具、plugin 工具、MCP 代理工具、memory tools。
- TTY 下创建 Supervisor engine、`DualAgentRuntime`、`GoalStore`、`Mailbox`、`WorkflowCoordinator`。
- 动态注册 goal/mailbox governance tools，工具执行时读取当前 workflow/thread/controller。
- 渲染 `@deepreef/tui` App。

非 TTY 输入走 pipe mode。

## TUI 状态链路

TUI 主要入口：

- `packages/tui/src/App.tsx`
- `packages/tui/src/bridge.tsx`
- `packages/tui/src/store/bridge-runtime.ts`
- `packages/tui/src/store/transcript-store.ts`
- `packages/tui/src/store/transcript-reader.ts`
- `packages/tui/src/DeepiMessages.tsx`

当前 TUI 同时保留 legacy bridge 状态和拆分后的 store/runtime 能力。长会话性能治理的核心落点是 transcript store、reader cache、bridge runtime 数组上限和 message rendering 窗口化。

## Workflow

`WorkflowCoordinator` 状态机：

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

当前真实主路径：

- Supervisor 在 `supervisor_analyse` 产出 plan。
- Worker 在 `worker_do` 执行 plan。
- Worker 在 `worker_report` 汇报。
- Supervisor 在 `supervisor_check` 审查并决定下一步。
- `parseSupervisorDecision()` 优先解析 Zod 校验的结构化 JSON，失败时走 legacy string fallback，并发出 low-confidence event。
- `approve` 需要结构化 completion audit 全部有证据才会真正完成。
- `blocked` 需要同一 blocker 连续 3 轮审计才会真正阻塞。

Mailbox workflow 路径保留在 `useMailboxWorkflow` 分支，默认不是主路径。

## Tool 权限边界

`resolveEffectiveTools()` 当前策略：

- Worker loop：工程工具按 agent 配置过滤；goal/mailbox 工具由 coordinator 管理，不直接给 Worker loop 随意调用。
- Supervisor loop：按 workflow phase 限制工具，默认治理工具优先，避免 Supervisor 无限自我探索。
- Supervisor alone/subagent：使用较小工具白名单。

写操作仍经过权限和 hook 路径。

## Provider 与模型

Provider 定义在 `packages/core/src/config.ts`：

- `zen`
- `deepseek`
- `mimo`
- `kilo`
- `openai-compatible`
- `nvidia`
- `qwen`
- `kimi`
- `zai`
- `stepfun`
- `openai`

配置优先级当前主要是环境变量、项目 `.deepreef/*` 窄配置和内置默认值；完整 TOML 配置系统仍是待办。

## 扩展系统

- Plugin/content-pack：`packages/plugin/`
- MCP：`packages/mcp/`
- Skills：`packages/tools/src/skills/` 和 plugin skill dirs
- AgentMemory：`packages/memory/`

这些系统在 CLI 启动时后台加载；失败时应保持基础 agent 可用。
