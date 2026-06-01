# Deepicode 中途指令与工具执行可靠性实施方案

最后更新：2026-06-01  
状态：可直接指导 Agent 分阶段开发  
适用范围：Core loop、工具执行器、TUI bridge、结果持久化、Hooks

> 本文是专项实施规范，不替代 `TODO.md`。开始开发前仍须阅读 `TODO.md` 的架构边界，并将每个完成项记录到 `DONE.md`。
>
> 本文基于当前仓库代码编写。禁止直接套用旧版伪代码；修改前必须重新读取目标文件和邻近测试。

---

## 0. 目标与结论

本专项解决两个相互关联但必须分阶段实施的问题：

1. **中途指令注入**：用户在工具链执行或模型流式输出期间继续输入时，允许 Core 在安全点把新指令追加到当前上下文，而不是一律等当前任务结束后重新 `submit()`。
2. **工具结果可靠性**：工具部分完成、权限拒绝或中断时，每个已声明的 tool call 必须获得且仅获得一个 tool result，避免下一次 API 请求因上下文不完整或重复结果而失败。

结果溢出持久化和 Hook 可观测性属于后续增强。动态 bash 并发判断、bash 特判级联取消、默认 LLM 摘要不进入首轮实现。

---

## 1. 当前架构事实

修改前必须确认以下事实仍成立：

```text
ReasonixEngine.submit()
  → runLoop(LoopOptions)
     → StreamingToolExecutor.run(toolCalls, signal, appendToolResult)
        → AgentTool.execute(args, ToolContext)

ReasonixEngine.submit()
  → AsyncGenerator<LoopEvent>
  → packages/tui/src/bridge.tsx
  → TimelineItem[] + TurnView
```

### 1.1 现有实现不可推翻

| 主题 | 当前实现 | 本专项要求 |
|------|----------|------------|
| LoopEvent | `{ role, content?, toolName?, toolCallIndex?, severity?, metadata? }` | 继续使用 role 模型；不要改成 `{ type: ... }` 联合类型 |
| runLoop | 接收 `LoopOptions` 对象 | 新能力通过 options 扩展；不要改回位置参数 |
| AbortController | 每次 `submit()` 创建独立 controller，`activeAbortController` 仅指向当前请求 | 保留；不要替换为跨请求共享 controller |
| 中断检查 | `signal` 负责终止请求和工具；`isInterrupted()` 负责 loop 快速退出 | 首轮保持双保险，不做无关清理 |
| TUI 队列 | `bridge.tsx` 内已有 `messageQueue`，负责当前 submit 结束后的串行提交 | 保留，不删除 |
| TUI 状态 | `TimelineItem[] + TurnView` | 不引入第二套 Store/Card 数据模型 |
| 工具并发 | `AgentTool.concurrency: "shared" | "exclusive"` | 首轮保持静态声明，不猜测命令安全性 |
| 权限 | `PermissionEngine` + `permission_ask` + `respondPermission(false)` | 中断时必须兑现等待中的权限 Promise |

### 1.2 两套队列必须分开

| 名称 | 所属层 | 用途 | 消费位置 |
|------|--------|------|----------|
| `pendingInstructionQueue` | Core `ReasonixEngine` | 在同一个 submit 内，把新用户指令注入当前上下文 | `runLoop()` 的安全点 |
| `messageQueue` | TUI `bridge.tsx` | 当前 submit 无法接收新指令时，排队为后续独立 submit | `processQueue()` |

禁止把两者合并。禁止在 Core 中递归调用 `submit()` 消费剩余消息。

---

## 2. 不可破坏的行为契约

### 2.1 中途指令契约

1. 新指令必须作为普通 `{ role: "user", content }` 写入上下文。
2. 禁止使用 `<system-reminder>`、伪造 system 消息或修改 ImmutablePrefix。
3. 每次只消费一条，保持用户输入顺序。
4. 队列必须有上限，首轮使用 `10`。
5. 中断清空 Core 的 `pendingInstructionQueue`。
6. 指令写入上下文后必须通过 SessionWriter 持久化完整 messages。
7. 空闲时调用 `enqueueInstruction()` 不得隐式启动任务，返回 `idle` 交由调用者决定是否 `submit()`。

### 2.2 安全点定义

只允许在以下位置写入中途指令：

1. 一批工具结果已经完整写入上下文后，下一轮 provider 请求开始前。
2. provider 返回最终回答后、`runLoop()` 即将产出 `done` 前。

第二个安全点用于处理“最终回答流式输出期间用户又输入了一条消息”的情况：如果队列不为空，先追加一条用户消息，再继续下一轮 provider 请求；不要结束当前 submit。

禁止在以下位置注入：

- SSE delta 尚未结束时。
- 工具仍在执行时。
- assistant tool_calls 已写入但对应 tool results 尚未补齐时。

### 2.3 工具结果契约

对于 provider 声明的每一个 tool call：

1. `appendToolResult(tc, result)` 必须执行且仅执行一次。
2. 成功、工具报错、未知工具、参数无法修复、权限拒绝、用户拒绝、执行中断都必须形成合法 `ToolResult`。
3. `ToolResult.content` 始终为字符串；错误结果使用 JSON 字符串。
4. 结果按 tool call 声明顺序写入上下文。
5. `loop.ts` 不得在 executor 抛错后对整批工具盲目补写结果。

### 2.4 中断契约

1. 保留 `ReasonixEngine.submit()` 内每次请求独立的 `AbortController`。
2. `interrupt()` 设置 `_interrupted = true`，abort 当前 controller，并清空 `pendingInstructionQueue`。
3. TUI `cancel()` 继续先调用 `engine.respondPermission(false)`，再调用 `engine.interrupt()`。
4. 本专项不改变 TUI `messageQueue` 的取消语义。如需 Ctrl+C 同时清空后续独立 submit，另开 UX 任务。
5. 不增加默认 `interruptBehavior: "block"`。工具收到 abort 后如何收尾，由工具自身实现保证；通用执行器不得静默继续启动新的工具。

---

## 3. 分阶段实施顺序

严格按阶段推进。每个 Phase 单独形成闭环，完成验证后再领取下一阶段。

| 顺序 | Phase | 内容 | 状态 |
|------|-------|------|------|
| 0 | P0 | 基线测试与契约测试 | ✅ 完成 |
| 1 | P1 | 工具结果恰好写入一次 | ✅ 完成 |
| 2 | P2 | Core 中途指令队列与 loop 安全点 | ✅ 完成 |
| 3 | P3 | TUI 路由与反馈 | ✅ 完成 |
| 4 | P4 | 结果溢出持久化 | ✅ 完成 |
| 5 | P5 | Hook 可观测性增强 | ✅ 完成 |
| 6 | P5.5 | 工具执行期间细粒度进度流 | 可选，独立提交 |
| 7 | P6 | 本轮明确暂缓项 | 不实现 |

---

## 4. P0：先补测试，不改生产行为

### 4.1 目标

锁定现状和期望契约，为后续修改提供回归保护。

### 4.2 文件

```text
packages/core/__tests__/streaming-executor.test.ts
packages/core/__tests__/engine-tools.test.ts
packages/tui/__tests__/bridge.test.ts
```

### 4.3 必须增加的测试

| 编号 | 场景 | 断言 |
|------|------|------|
| P0-1 | shared batch 中一个成功、一个失败 | 每个调用只追加一个结果，顺序与声明顺序一致 |
| P0-2 | exclusive 工具权限被拒绝 | 上下文收到一个错误 ToolResult |
| P0-3 | shared 工具权限被拒绝 | 上下文收到一个错误 ToolResult |
| P0-4 | 工具执行期间 interrupt | 已完成调用不重复写结果，未完成调用获得错误结果 |
| P0-5 | 权限弹窗期间 cancel | Promise 被兑现，generator 能结束 |
| P0-6 | TUI 运行中再次输入 | 现有基线仍进入 `messageQueue`，串行提交不丢消息 |

P0-3 和 P0-4 在当前实现上可能失败。测试应明确暴露缺陷，不要为了全绿而弱化断言。

### 4.4 验收

```bash
bun test packages/core/__tests__/streaming-executor.test.ts packages/core/__tests__/engine-tools.test.ts
bun test packages/tui/__tests__/bridge.test.ts
```

---

## 5. P1：工具结果恰好写入一次

### 5.1 目标

由 `StreamingToolExecutor` 统一拥有 tool result 的最终写入责任。`loop.ts` 只负责驱动 executor 和持久化 messages。

### 5.2 文件

```text
packages/core/src/streaming-executor.ts
packages/core/src/loop.ts
packages/core/__tests__/streaming-executor.test.ts
packages/core/__tests__/engine-tools.test.ts
```

### 5.3 推荐设计

在 executor 内部为一次 `run()` 建立局部 settled 集合，不要把状态挂成跨请求实例字段：

```typescript
type ToolExecutionState = "queued" | "running" | "settled"

interface TrackedExecution {
  tc: ToolCall
  index: number
  state: ToolExecutionState
}
```

实现一个局部 helper，所有分支统一通过它追加结果：

```typescript
const settle = (
  tracked: TrackedExecution,
  result: ToolResult,
): boolean => {
  if (tracked.state === "settled") return false
  tracked.state = "settled"
  appendToolResult(tracked.tc, result)
  return true
}
```

要求：

1. shared 与 exclusive 路径复用同一 settle 规则。
2. 权限拒绝也必须 settle。
3. signal 已 abort 时，不再启动排队中的 exclusive 工具，直接 settle 为取消错误。
4. 已经运行的工具由 `ToolContext.signal` 接收 abort；无论 handler resolve 还是 reject，最终只 settle 一次。
5. executor 返回后，loop 可以认为所有 tool calls 已 settle。
6. 删除 `loop.ts` 中 catch 后“为整批 toolCalls 全部补结果”的逻辑。executor 内部必须捕获调度异常，通过局部 settled 集合只为尚未 settled 的调用补错误，并产出 warning。预期内的取消和工具错误不应继续抛给 loop。

### 5.4 不要做

- 不增加 bash 名称特判。
- 不根据命令文本动态决定 shared/exclusive。
- 不增加跨 run 的 `_tracked`、`_hasErrored` 或共享 sibling controller。
- 不把 Core 的执行状态类型命名为 `ToolStatus`，避免与 TUI `ToolStatus` 冲突。

### 5.5 验收

P0-1 至 P0-5 全绿，并运行：

```bash
bun run typecheck
bun test packages/core/__tests__/streaming-executor.test.ts packages/core/__tests__/engine-tools.test.ts
git diff --check
```

---

## 6. P2：Core 中途指令队列

### 6.1 目标

允许当前 submit 在安全点消费后续输入，不创建第二个 submit，不改变 prefix。

### 6.2 文件

```text
packages/core/src/interface.ts
packages/core/src/engine.ts
packages/core/src/loop.ts
packages/core/__tests__/engine-tools.test.ts
packages/core/__tests__/session.test.ts
```

### 6.3 接口扩展

沿用当前 role-based LoopEvent，不新增 `type` 联合类型：

```typescript
export type EnqueueInstructionResult =
  | { status: "queued"; queueLength: number }
  | { status: "idle"; queueLength: 0 }
  | { status: "ignored"; queueLength: number }
  | { status: "full"; queueLength: number }

export interface CoreEngine {
  // 现有字段保持不动
  enqueueInstruction(instruction: string): EnqueueInstructionResult
}
```

注入确认复用 `status` 事件：

```typescript
{
  role: "status",
  content: "instruction_injected",
  metadata: {
    kind: "instruction_injected",
    queueLength,
    turnCount,
  },
}
```

不要把完整指令文本复制到 UI status 事件，避免敏感内容重复扩散。完整文本已经存在于 messages 和 session 持久化中。

### 6.4 Engine 实现约束

```typescript
private pendingInstructionQueue: string[] = []
private isSubmitting = false
private static readonly MAX_PENDING_INSTRUCTIONS = 10
```

要求：

1. `submit()` 入口设置 `isSubmitting = true`，`finally` 中恢复为 false，保证异常路径一致。
2. `enqueueInstruction()` 对输入执行 `trim()`；空字符串返回 `ignored`，不得入队。
3. 只有 `isSubmitting === true` 时才允许入队。
4. 达到上限返回 `full`，不得静默丢弃旧消息。
5. `interrupt()` 清空队列。
6. 不递归调用 `submit()`。

如果实现者发现并发 submit 已经可能发生，不要顺手重构。记录到 `TODO.md` 的 H8，保持本专项只覆盖单 active submit 的 TUI 主路径。

### 6.5 LoopOptions 扩展

```typescript
export interface PendingInstruction {
  content: string
  remaining: number
}

export interface LoopOptions {
  // 现有字段保持不动
  takePendingInstruction?: () => PendingInstruction | null
}
```

在 `runLoop()` 内写一个局部 helper：

```typescript
const appendPendingInstruction = (): LoopEvent | null => {
  const pending = takePendingInstruction?.()
  if (!pending) return null
  ctx.log.append({ role: "user", content: pending.content })
  sessionWriter?.enqueue({
    ts: Date.now(),
    type: "messages",
    payload: ctx.buildMessages(),
  })
  return {
    role: "status",
    content: "instruction_injected",
    metadata: {
      kind: "instruction_injected",
      queueLength: pending.remaining,
      turnCount,
    },
  }
}
```

调用位置：

1. 每批工具执行并持久化结果后，在下一次 while 循环开始前消费一条。
2. 非 tool-use 的最终 `done` 分支中，先检查队列；如果消费到消息，yield status 并 `continue`，否则正常 yield `done` 并 return。

注意：不要在每轮同时调用两次 helper。实现时可通过布尔标志或统一放在 while 顶部，确保每个安全点只消费一条。

### 6.6 必须增加的测试

| 编号 | 场景 | 断言 |
|------|------|------|
| P2-1 | idle enqueue | 返回 `idle`，上下文不变 |
| P2-2 | 工具执行期间 enqueue | 工具结果后追加普通 user 消息，下一轮 provider 可见 |
| P2-3 | 最终回答 SSE 期间 enqueue | 当前 submit 不结束，追加 user 消息后继续一轮 |
| P2-4 | 连续 enqueue 三条 | 按输入顺序逐轮消费 |
| P2-5 | 超过十条 | 第十一条返回 `full`，已有十条不丢失 |
| P2-6 | enqueue 后 interrupt | 队列清空，中断后新 submit 正常 |
| P2-7 | session persistence | 注入消息出现在 JSONL messages 记录中 |

### 6.7 验收

```bash
bun run typecheck
bun test packages/core/__tests__/engine-tools.test.ts packages/core/__tests__/session.test.ts
git diff --check
```

---

## 7. P3：TUI 路由与反馈

### 7.1 目标

运行中输入优先尝试注入当前 submit；无法注入时，保留现有串行 `messageQueue` 作为后续 submit。

### 7.2 文件

```text
packages/tui/src/bridge.tsx
packages/tui/src/App.tsx
packages/tui/src/DeepiPromptInput.tsx
packages/tui/src/StatusBar.tsx
packages/tui/__tests__/bridge.test.ts
```

### 7.3 bridge 路由

`createBridge()` 内保留现有闭包变量 `running`、`processingQueue`、`activeRequest`。

运行中再次 `submit(text)` 时：

```typescript
const result = engine.enqueueInstruction(text)

if (result.status === "queued") {
  // 更新注入队列计数和提示，不追加 messageQueue
  return
}

if (result.status === "full") {
  // 不丢消息：追加到现有 messageQueue，提示将作为后续任务执行
  return
}

if (result.status === "ignored") return

// idle 竞态：追加到现有 messageQueue，由 processQueue 串行提交
```

BridgeState 可以新增：

```typescript
pendingInstructionCount: number
statusMessage: string | null
```

现有 `messageQueue.length` 继续表示后续独立 submit 数量。UI 不得把两个计数混为一个。

消费 Core status 事件时：

```typescript
if (event.role === "status" && event.metadata?.kind === "instruction_injected") {
  // 使用 metadata.queueLength 更新 pendingInstructionCount
}
```

### 7.4 UI 文案

输入框和 StatusBar 区分显示：

```text
当前任务待注入: 2
后续任务队列: 1
```

暂不把 Core 错误消息纳入 i18n；若 T30 已经开始，新增 TUI 文案必须走现有 `t(key)`。

### 7.5 必须增加的测试

| 编号 | 场景 | 断言 |
|------|------|------|
| P3-1 | running + queued | 不进入 messageQueue，注入计数增加 |
| P3-2 | running + full | 输入进入 messageQueue，不丢消息 |
| P3-3 | running + idle race | 输入进入 messageQueue，当前 submit 结束后继续 |
| P3-4 | injected status | pendingInstructionCount 按 Core metadata 更新 |
| P3-5 | cancel | 仍按顺序调用 `respondPermission(false)` 和 `interrupt()` |
| P3-6 | 原有串行队列 | 回归测试保持通过 |

### 7.6 验收

```bash
bun run typecheck
bun test packages/tui/__tests__/bridge.test.ts
bun test
git diff --check
```

---

## 8. P4：结果溢出持久化

P4 是独立增强。P1–P3 全绿后再开发。

### 8.1 目标

工具结果过大时，完整内容写入项目内部文件；上下文只保留预览和检索路径，降低上下文膨胀。

### 8.2 文件

```text
packages/core/src/result-persistence.ts        # 新增
packages/core/src/streaming-executor.ts
packages/core/__tests__/result-persistence.test.ts  # 新增
packages/core/__tests__/streaming-executor.test.ts
```

### 8.3 约束

1. 默认阈值在 Core 统一配置，不依赖每个工具主动声明。建议首轮 `200_000` chars。
2. 允许 AgentTool 增加可选覆盖值：

```typescript
maxResultSizeChars?: number
```

3. 写入路径固定为 `.deepicode/results/<sessionId>/`。
4. sessionId、tool call id 必须清洗或替换为随机 UUID，禁止路径穿越。
5. 目录权限 `0700`，文件权限 `0600`。
6. 文件名不可包含用户输入。
7. metadata 记录 `persistedPath`、`originalChars`、`previewChars`。
8. 预览使用确定性截断，不调用外部模型。
9. 写入失败时回退为截断预览并产出 warning，不阻塞主流程。
10. 增加单 session 配额和清理策略；建议首轮配额 `50 MiB`。

### 8.4 与现有工具截断的关系

`shell-exec.ts`、`file-ops.ts` 已存在工具级截断。P4 开发前先明确：

- 工具级截断用于防止子进程或文件读取内存失控。
- Core 级持久化只能保存 handler 实际返回的完整内容。
- 如果工具已经截断，Core 不得声称已持久化原始完整输出。

需要保存 bash 原始完整输出时，另开工具层任务设计流式落盘，不要在 P4 中扩大范围。

### 8.5 验收

覆盖超限、未超限、写入失败、权限、配额、路径清洗测试，并运行全量测试。

---

## 9. P5：Hook 可观测性增强

P5 是独立增强，不阻塞 P1–P4。

### 9.1 当前问题

`runBeforeToolCall()` 已 fail-safe；`runAfterToolCall()` 已吞掉 hook 异常；`runOnLoopEvent()` 的异步 rejection 目前缺少可靠隔离。

### 9.2 文件

```text
packages/security/src/hooks.ts
packages/security/__tests__/hooks.test.ts
packages/core/src/engine.ts
```

### 9.3 要求

1. 保持 before hook 失败即 deny。
2. after 和 loop-event hook 失败不得中断主流程。
3. 增加可选错误观察回调，避免完全静默：

```typescript
onHookError?: (error: unknown, phase: "before" | "after" | "loop_event") => void
```

4. `engine.ts` 调用异步 hook 时显式 `void promise.catch(...)`，不要用同步 try/catch 假装捕获 rejection。
5. 不在本阶段增加 HookResult DSL。

### 9.4 验收

```bash
bun test packages/security/__tests__/hooks.test.ts
bun run typecheck
bun test
git diff --check
```

---

## 10. P5.5：工具执行期间细粒度进度流

P5.5 是独立增强。它补齐工具开始和结束之间的反馈空窗，但不得改变 `ToolResult`、权限、中断和 settled 契约。建议在 P1–P3 稳定后实施；与 P4、P5 无强依赖。

### 10.1 目标

当前 executor 已经会产出粗粒度事件：

```text
tool_start
tool_progress: "running"
... 等待 handler.execute() 返回 ...
tool / error
tool_progress: "done"
```

P5.5 增加执行期间的实时事件，使 TUI 可以显示：

```text
bash 已运行 3.2s
stdout 新增 1.8 KiB
正在读取文件元数据
已处理 120 / 500 项
```

首轮以 `bash` 为主要接入工具。其他工具可以逐步使用同一接口；未接入的现有工具行为不变。

### 10.2 设计原则

1. 保持 `AgentTool.execute(args, context): Promise<ToolResult>` 向后兼容，不把全部工具改写为 async generator。
2. 在 `ToolContext` 增加可选同步回调 `reportProgress()`。工具可以报告进度，但不能直接构造 `LoopEvent`。
3. executor 负责把工具回调转换为 `tool_progress`，统一限流、截断、排队和清理。
4. 实时进度按到达顺序 yield；最终 tool results 仍按 provider 声明顺序 settle 和写入上下文。
5. 进度仅用于 UI 和可观测性，不写入模型上下文，不改变最终 `ToolResult`。
6. raw stdout/stderr 进度默认是 transient，不写入 session JSONL，避免敏感内容重复落盘和会话文件膨胀。
7. 所有队列有界。慢 TUI 不得反压工具子进程，也不得导致内存无限增长。

### 10.3 文件

```text
packages/core/src/interface.ts
packages/core/src/streaming-executor.ts
packages/core/src/loop.ts
packages/core/__tests__/streaming-executor.test.ts
packages/tools/src/shell-exec.ts
packages/tools/__tests__/bash.test.ts
packages/tui/src/bridge.tsx
packages/tui/src/DeepiMessages.tsx
packages/tui/__tests__/bridge.test.ts
```

如果实现通用异步队列，新增：

```text
packages/core/src/progress-channel.ts
packages/core/__tests__/progress-channel.test.ts
```

### 10.4 ToolContext 接口扩展

在 `packages/core/src/interface.ts` 增加：

```typescript
export interface ToolProgressUpdate {
  kind: "status" | "heartbeat" | "output" | "fraction"
  message?: string
  elapsedMs?: number
  current?: number
  total?: number
  unit?: string
  stream?: "stdout" | "stderr"
  chunk?: string
}

export interface ToolContext {
  // 现有字段保持不动
  reportProgress?: (update: ToolProgressUpdate) => void
}
```

约束：

1. 回调为同步 `void`，handler 不等待 UI。
2. `chunk` 只用于短预览，不代表完整日志。
3. 工具不得通过 progress 上报完整敏感文件内容。
4. executor 必须校验字段类型、截断文本并忽略异常 update。

### 10.5 LoopEvent 编码

继续复用现有 `tool_progress` role，不增加第二套事件模型：

```typescript
{
  role: "tool_progress",
  content: "update",
  toolName: tc.function.name,
  toolCallIndex: index,
  metadata: {
    kind: update.kind,
    message: update.message,
    elapsedMs: update.elapsedMs,
    current: update.current,
    total: update.total,
    unit: update.unit,
    stream: update.stream,
    chunk: update.chunk,
    transient: update.kind === "output" || update.kind === "heartbeat",
  },
}
```

保留已有 `content: "running"` 和 `content: "done"`。TUI 必须兼容不带 metadata 的旧事件。

### 10.6 executor 的进度通道

`handler.execute()` 返回 Promise，回调发生在 Promise 完成前。executor 不能从回调内部直接 `yield`，必须通过局部有界异步队列转发。

推荐增加 `ProgressChannel`：

```typescript
interface QueuedToolProgress {
  toolName: string
  toolCallIndex: number
  update: ToolProgressUpdate
}

interface ProgressChannel {
  publish(progress: QueuedToolProgress): void
  next(signal?: AbortSignal): Promise<QueuedToolProgress | null>
  close(): void
}
```

行为约束：

1. channel 只属于单次 `StreamingToolExecutor.run()`，禁止挂到 executor 实例形成跨请求状态。
2. 队列上限建议 `64` 条。
3. 队列满时优先合并或丢弃旧 heartbeat 和旧 output chunk，保留最新状态；不得阻塞 handler。
4. 单工具 output 更新最多每 `100ms` 向 TUI 发一次；heartbeat 最多每 `1000ms` 一次。
5. 单次 `chunk` 截断到 `4096` chars；TUI 仅保留每个工具最近 `8192` chars 的 live preview。
6. handler resolve、reject 或 abort 后必须停止 heartbeat，关闭监听并释放 timer。
7. progress channel 异常不得改变 tool result。

executor 执行逻辑分两类：

- **exclusive 工具**：启动 handler Promise，同时通过 `Promise.race()` 等待“下一条 progress”或“handler 完成”；progress 到达立即 yield。
- **shared batch**：所有 handler 先启动，共用一个带 `toolCallIndex` 的 channel；进度按到达顺序 yield。全部 handler 结束后，最终结果仍按声明 index 排序再 settle。

不得为了实时 progress 改变 P1 的“每个 tool call 恰好 settle 一次”规则。

### 10.7 通用 heartbeat

executor 为仍在运行的顶层工具生成 heartbeat，即使 handler 从未调用 `reportProgress()`，TUI 也能显示耗时：

```typescript
{
  kind: "heartbeat",
  message: "still running",
  elapsedMs: Date.now() - startedAt,
}
```

要求：

1. 首次 heartbeat 在运行 `1000ms` 后产生。
2. 每秒最多一条。
3. 工具完成后立即停止。
4. heartbeat 不写 session JSONL。

### 10.8 bash 首轮接入

在 `packages/tools/src/shell-exec.ts` 中：

1. `spawn()` 成功后报告 `{ kind: "status", message: "process started" }`。
2. `stdout` 收到 data 时继续累积最终结果，同时报告 `{ kind: "output", stream: "stdout", chunk }`。
3. `stderr` 同理。
4. 超时报告 `{ kind: "status", message: "terminating after timeout" }`。
5. abort 报告 `{ kind: "status", message: "cancelled" }`。
6. 最终 `ToolResult` 语义保持不变，仍由 `runBash()` 返回截断后的 stdout、stderr、exitCode 和 timedOut。

不要把完整 stdout/stderr 复制进 session progress 事件。需要保存完整 bash 输出时，使用 P4 中描述的独立流式落盘任务。

### 10.9 nested tools 的边界

首轮只为顶层 tool call 建立 TUI 进度卡片。`ToolContext.invokeTool()` 触发的嵌套工具暂不向 TUI 直接冒泡 progress，避免缺少独立 `toolCallIndex` 时错误覆盖父工具状态。

如需显示 Workflow 子步骤，另开任务设计：

```text
parentToolCallIndex
childSequence
childToolName
```

禁止复用父工具 index 假装子工具是顶层工具。

### 10.10 session 持久化

当前 `loop.ts` 会持久化 executor 产出的每个事件。P5.5 必须新增过滤规则：

```typescript
function shouldPersistToolEvent(event: LoopEvent): boolean {
  return !(event.role === "tool_progress" && event.metadata?.transient === true)
}
```

要求：

1. `output` chunk 和 heartbeat 默认不持久化。
2. `running`、`done` 和低频 status 可以保留。
3. 最终 `tool` / `error` 事件和 messages 记录照常持久化。
4. 过滤仅影响 SessionWriter，不影响 TUI yield。

### 10.11 TUI 消费

在 `ToolStatus` 中增加：

```typescript
progressMessage?: string
liveOutput?: string
elapsedMs?: number
```

`bridge.tsx` 消费 `tool_progress: "update"`：

1. 用 `toolCallIndex` 定位当前活跃工具。
2. 更新 `progressMessage` 和 `elapsedMs`。
3. `metadata.chunk` 追加到 `liveOutput` 尾部，并裁剪到最近 `8192` chars。
4. `done` 后清理 `progressMessage`；最终 `tool.output` 仍来自 terminal 事件。
5. 不把 liveOutput 混入最终上下文，不参与消息搜索，除非后续明确增加该功能。

`DeepiMessages.tsx` 对 running 工具显示：

```text
bash 运行中 3.2s
  stdout: ...最近若干行...
```

限制预览行数，避免 Ink 长会话重绘成本失控。

### 10.12 必须增加的测试

| 编号 | 场景 | 断言 |
|------|------|------|
| P5.5-1 | 工具主动报告 status | terminal result 前能收到 `tool_progress: update` |
| P5.5-2 | 长工具不主动报告 | 1s 后收到 heartbeat，完成后 timer 清理 |
| P5.5-3 | bash stdout/stderr | TUI 收到分流 chunk；最终 ToolResult 仍包含输出 |
| P5.5-4 | output 高频写入 | executor 限流，队列有界，最新预览保留 |
| P5.5-5 | shared 工具交错报告 | progress 按到达顺序；最终结果按声明顺序 settle |
| P5.5-6 | interrupt | heartbeat 停止，子进程结束，不产生完成后的残留 update |
| P5.5-7 | session persistence | transient chunk 和 heartbeat 不进入 JSONL |
| P5.5-8 | TUI live preview | 尾部裁剪到 8192 chars，done 后 terminal output 正常显示 |
| P5.5-9 | 旧工具未调用回调 | 行为兼容，原有测试保持通过 |

### 10.13 验收

```bash
bun run typecheck
bun test packages/core/__tests__/progress-channel.test.ts packages/core/__tests__/streaming-executor.test.ts
bun test packages/tools/__tests__/bash.test.ts
bun test packages/tui/__tests__/bridge.test.ts
bun test
git diff --check
```

人工检查：

1. 运行 `bash` 长任务时，工具卡片每秒更新时间。
2. bash 持续输出时，工具卡片实时显示 stdout/stderr 尾部。
3. Ctrl+C 后子进程停止，卡片不再刷新。
4. 高频输出任务不会导致 TUI 明显卡顿或 session JSONL 快速膨胀。

---

## 11. P6：明确暂缓

以下想法不是永久否决，但本轮禁止顺手实现：

| 暂缓项 | 原因 | 重新评估条件 |
|--------|------|--------------|
| 根据 bash 文本动态判断是否可并发 | shell 语义无法靠简单规则可靠分类 | 有独立威胁模型、白名单设计和测试矩阵 |
| bash 失败后自动取消所有兄弟工具 | 独立工具未必依赖 bash，通用 executor 不应包含工具名特判 | 引入通用 dependency group 或显式 `failFast` 元数据 |
| 默认 LLM 结果摘要 | 增加成本、延迟和隐私风险 | P4 稳定后，有独立配置、预算、超时和隐私设计 |
| 跨请求共享 AbortController | 容易导致旧请求清理或取消新请求 | 除非出现可复现缺陷证明当前 per-submit 模型不足 |
| Core 尾递归 `submit()` | 容易引入重入、状态和 controller 生命周期问题 | 不采用；由 loop 安全点和 TUI messageQueue 覆盖需求 |
| 默认 `interruptBehavior: "block"` | 用户中断后继续启动工具违反预期 | 如需原子收尾，在具体工具内部实现 |

---

## 12. 风险矩阵

| 风险 | 影响 | 缓解 |
|------|------|------|
| 两套队列重复消费同一消息 | 高 | 队列分层；queued 成功后禁止再写 messageQueue |
| 最终 SSE 期间入队形成孤儿指令 | 高 | 最终 done 前增加安全点，消费后继续 loop |
| tool result 重复写入 | 高 | executor 局部 settled 集合；loop 禁止整批盲补 |
| 权限拒绝未形成 tool result | 高 | shared/exclusive 所有拒绝分支统一 settle |
| interrupt 后启动新的 exclusive 工具 | 高 | dispatch 前检查 signal，未启动项直接 settle 为取消 |
| 注入消息污染 prefix cache | 中 | 只追加普通 user 消息，不修改 system prompt 和 tool specs |
| session 泄漏敏感大结果 | 高 | P4 使用 0700/0600、配额、清理策略和安全文件名 |
| TUI 队列计数误导用户 | 中 | pendingInstructionCount 与 messageQueue.length 分开显示 |
| hook rejection 形成未处理 Promise | 中 | 显式 `.catch()`，增加 hook 错误回调 |
| progress 高频事件拖慢 TUI | 高 | executor 限流；channel 有界；TUI 只保留尾部预览 |
| stdout/stderr 在 session 中重复泄漏 | 高 | output 和 heartbeat 标记 transient，SessionWriter 过滤 |
| shared 工具 progress 与终态顺序混淆 | 中 | progress 按到达顺序；terminal results 按声明 index settle |
| 工具结束后 timer 或监听残留 | 中 | resolve、reject、abort 全路径 close channel 并清理 timer |

---

## 13. Agent 工作规范

每个 Agent 每次只领取一个 Phase，遵循：

1. 阅读本 Phase 列出的生产文件和邻近测试。
2. 先增加能失败的目标测试。
3. 只实现使本 Phase 验收通过的最小改动。
4. 不重构未列出的模块，不处理 P6 暂缓项。
5. 运行目标测试、`bun run typecheck`、`bun test`、`git diff --check`。
6. 将结果记录到 `DONE.md`，包括修改文件、测试命令、测试数量和仍保留的限制。
7. 如果发现本文与代码已不一致，先更新本文或 `TODO.md`，不要按过时伪代码强行修改。

工作区可能已有用户或其他 Agent 的改动。禁止使用 `git reset --hard`、`git checkout --` 或批量格式化清理无关文件。

---

## 14. 交付物清单

### P1–P3 首轮交付

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/core/src/interface.ts` | 修改 | `enqueueInstruction()` 类型和 CoreEngine 接口 |
| `packages/core/src/engine.ts` | 修改 | 有界 pendingInstructionQueue；保留 per-submit controller |
| `packages/core/src/loop.ts` | 修改 | 安全点注入；移除整批盲补结果 |
| `packages/core/src/streaming-executor.ts` | 修改 | settled 跟踪；所有分支恰好写入一个结果 |
| `packages/tui/src/bridge.tsx` | 修改 | 注入优先路由；保留 messageQueue fallback |
| `packages/tui/src/DeepiPromptInput.tsx` | 修改 | 区分待注入与后续任务数量 |
| `packages/tui/src/StatusBar.tsx` | 修改 | 队列状态展示 |
| `packages/core/__tests__/streaming-executor.test.ts` | 修改 | 结果和中断契约 |
| `packages/core/__tests__/engine-tools.test.ts` | 修改 | 注入安全点和 Core 队列 |
| `packages/core/__tests__/session.test.ts` | 修改 | 注入持久化 |
| `packages/tui/__tests__/bridge.test.ts` | 修改 | TUI 路由和取消回归 |

`App.tsx` 仅在状态 props 接线确实需要时修改。不要把 bridge 已有的提交控制搬到 App。

### P4 可选交付

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/core/src/result-persistence.ts` | 新增 | 安全落盘、截断预览、配额 |
| `packages/core/__tests__/result-persistence.test.ts` | 新增 | 持久化安全和回退测试 |

### P5 可选交付

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/security/src/hooks.ts` | 修改 | 异步错误隔离和观察回调 |
| `packages/security/__tests__/hooks.test.ts` | 修改 | hook rejection 回归 |

### P5.5 可选交付

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/core/src/interface.ts` | 修改 | `ToolProgressUpdate` 和可选 `reportProgress()` |
| `packages/core/src/progress-channel.ts` | 新增 | 单 run 有界异步进度通道 |
| `packages/core/src/streaming-executor.ts` | 修改 | handler 运行期间转发 progress 和 heartbeat |
| `packages/core/src/loop.ts` | 修改 | transient progress 不写 SessionWriter |
| `packages/tools/src/shell-exec.ts` | 修改 | stdout、stderr、timeout、abort 实时报告 |
| `packages/tui/src/bridge.tsx` | 修改 | live preview 与耗时状态 |
| `packages/tui/src/DeepiMessages.tsx` | 修改 | running 工具的尾部预览 |
| `packages/core/__tests__/progress-channel.test.ts` | 新增 | 有界队列、合并和清理 |
| `packages/core/__tests__/streaming-executor.test.ts` | 修改 | progress、shared 顺序和中断 |
| `packages/tools/__tests__/bash.test.ts` | 修改 | bash 进度报告 |
| `packages/tui/__tests__/bridge.test.ts` | 修改 | TUI live preview |

---

## 15. 最终验收

P0–P5 全部完成。验证命令：

```bash
bun run typecheck
bun test packages/core/__tests__/streaming-executor.test.ts packages/core/__tests__/engine-tools.test.ts packages/core/__tests__/session.test.ts
bun test packages/tui/__tests__/bridge.test.ts
bun test
git diff --check
```

人工检查场景：

1. 工具执行中输入新消息：提示进入待注入队列，工具结束后模型响应新指令。
2. 最终回答流式输出中输入新消息：当前 submit 自动继续，不出现孤儿消息。
3. 权限弹窗出现时 Ctrl+C：弹窗消失，generator 正常结束。
4. shared batch 部分成功、部分失败：下一轮 API 请求不出现 tool result 缺失或重复。
5. 中断后重新提交普通消息：新请求使用新的 controller，正常执行。
6. 工具返回大结果（>200K chars）：完整内容写入 `.deepicode/results/`，上下文保留预览。
7. Hook 异常：after/loop_event hook 失败不中断主流程，error observer 收到通知。

P0–P5 完成于 2026-06-01，共 7 个提交，625 测试通过（8 预存失败不变）。
