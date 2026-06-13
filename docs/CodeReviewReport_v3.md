---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 244a257eac9ad56acb57e373a3703f2e_8dea6934671f11f1a99c5254007bceed
    ReservedCode1: 0+Rb21M6QIsK/inq+Kcg0t30c0jT1Uf9W4oPrdi9X/5sz4Zxn54eSplP4xZBzHr7dfFw3FDbpyPZ95XGbZb8DGy47w6SlJSJR9kRyp7k2JPmUwDahMDs71dj85nxC/T92Y0hxZk4oZVNhTUChPMcubUHEJnJ/Yt0wrrmtmBsrr/pwHlC5FuAuPPX76M=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 244a257eac9ad56acb57e373a3703f2e_8dea6934671f11f1a99c5254007bceed
    ReservedCode2: 0+Rb21M6QIsK/inq+Kcg0t30c0jT1Uf9W4oPrdi9X/5sz4Zxn54eSplP4xZBzHr7dfFw3FDbpyPZ95XGbZb8DGy47w6SlJSJR9kRyp7k2JPmUwDahMDs71dj85nxC/T92Y0hxZk4oZVNhTUChPMcubUHEJnJ/Yt0wrrmtmBsrr/pwHlC5FuAuPPX76M=
---

# Deepreef 代码审查报告 v3

**审查日期**: 2026-06-13  
**审查范围**: `\\192.168.1.3\share\Win_agent\deepreef` 项目全部源代码  
**审查依据**: `\\192.168.1.3\share\Win_agent\BUGS\FindBugfinal.md` 六阶段审查方法论  
**审查者**: File Agent (自动审查)

---

## 1. 审查方法论说明

本次审查严格遵循 `FindBugfinal.md` 中描述的六阶段代码审查方法：

| 阶段 | 审查维度 | 核心检查项 |
|------|----------|-----------|
| **Phase 1** | LLM 流与 API 网络层 | SSE 解析正确性、超时/重试、AbortSignal 生命周期、HTTP 错误恢复 |
| **Phase 2** | Agent 核心循环与 Tool Call 生命周期 | 循环终止条件、工具执行 exactly-once、权限流、参数解析/修复/salvage |
| **Phase 3** | 上下文与持久化管理 | Context budget 管理、Session 持久化可靠性、溢出/截断/配额 |
| **Phase 4** | 物理世界交互 | Shell 执行安全、文件系统操作边界、路径安全、截断恢复 |
| **Phase 5** | 并发、竞态与框架陷阱 | 共享/独占工具并发、AbortSignal 竞态、Promise 异常传播、跨轮状态重置 |
| **Phase 6** | TUI 终端与前端渲染 | State 更新正确性、Timeline 一致性、React 严格模式兼容、事件流完整性 |

每个阶段包含以下审查动作：
- **Reject 规则检查**: 是否存在违反硬性约束的代码模式
- **边界条件遍历**: 空输入、超长输入、并发、中断、错误恢复
- **状态机一致性**: 跨轮次/跨调用状态是否正确重置和传递

---

## 2. TODO 完成情况对照

### 2.1 DONE.md 声明完成矩阵

根据 `docs/DONE.md`，以下专项已声明完成：

| 编号 | 任务 | 声明状态 | 代码验证 |
|------|------|----------|----------|
| DRF-10 | ModelTarget + client resolver | ✅ | `model-target.ts` 存在，`SubagentRunner` 已使用 |
| DRF-20 | read-before-write + early-stop | ✅ | `ReadTracker` + `EarlyStopDetector` 已集成到 `streaming-executor.ts` |
| DRF-30 | BranchBudget + Checkpoint v2 | ✅ | 未在本次审查范围中深入验证 |
| DRF-31 | 参数 / 文本 tool-call salvage | ✅ | `tool-arguments/normalizer.ts` + `salvage.ts` + `repair.ts` + `truncation-recovery.ts` |
| DRF-32 | Shell 双轨执行 | ✅ | `shell.ts` 中 `dualTrack` 参数支持 |
| DRF-40 | TaskLedger + Verification Gate | ✅ | 集成在 `loop.ts` |
| DRF-50 | SupervisorAdvice + 触发器 | ✅ | 已实现但路径待验证 |
| DRF-70 | 两阶段工具路由 + free/forced | ✅ | 代码存在 |
| DRF-80 | Benchmark 矩阵 + 发布门禁 | ✅ | `packages/core/scripts/benchmark-matrix.ts` |
| CL-50 | StreamingToolExecutor 渐进提取 | ✅ | `executor-helpers.ts` 提取 4 个纯函数 |
| CL-51 | runLoop() 渐进提取 | ✅ | `loop-helpers.ts` 提取 4 个纯函数 |
| CL-52 | TUI command routing 收敛 | ✅ | `commands.ts` 提取 slash command 纯逻辑 |
| AGENT-90 | Subagent 系统 | ✅ | `subagent/` 目录全部就位，34 个专项测试 |
| OS-00~OS-17 | 三平台能力层 | ✅ | 三平台 CI 全绿 |

### 2.2 DA-R vs DA-00 状态不一致（重要发现）

审查发现 `TODO.md` 中存在关键状态矛盾：

**DA-R0~DA-R7（审查修复任务）全部标记为 ✅ 已完成：**

| 任务 | 标记状态 |
|------|----------|
| DA-R0 | ✅ |
| DA-R1 | ✅ |
| DA-R2 | ✅ |
| DA-R3 | ✅ |
| DA-R4 | ✅ |
| DA-R5 | ✅ |
| DA-R6 | ✅ |
| DA-R7 | ✅ |

**但对应的原始 DA-00~DA-60 任务实际状态如下：**

| 原任务 | 真实状态 | 问题 |
|--------|----------|------|
| DA-00 | 部分完成 | Schema、迁移和保存边界仍不严格 |
| DA-10 | 部分完成 | 未接入启动链路，Supervisor 只读未强制 |
| DA-20 | 骨架 | 空 API 参数、无工具循环、未接入主路径 |
| DA-30 | 骨架 | 未执行合法转换、计划、验证门和轮次约束 |
| DA-40 | 骨架 | 独立存储未接线，写入和路径处理不安全 |
| DA-50 | 组件骨架 | 新组件未渲染到 `App.tsx` |
| DA-60 | 未完成 | `ReasonixEngine.currentAgent` 仍驱动生产主路径 |

> **风险评估**: DA-R0~R7 标记为 ✅ 可能掩盖了原始 DA 任务的实际未完成状态。DA-60 明确标注"未完成"，意味着双角色 Worker/Supervisor 架构在生产路径中尚未实际接通。

### 2.3 其他待处理项

| 编号 | 状态 | 说明 |
|------|------|------|
| CTX-70 | 待人工验收 | 长会话 trim/compact 需人工验证 |
| OS-12/13-R | 待人工验收 | macOS/Windows 原生终端验证 |
| Supervisor 免费池 smoke | 可选 | `DEEPREEF_SUPERVISOR_SMOKE=1` |
| ECC content-pack CLI 端到端 | 暂缓 | 缺少 `.deepreef/plugins.json` 配置接入 |
| AgentMemory 上游测试增强 | 暂缓 | memory 包仍有预置失败 |

---

## 3. 按方法论分类的 Bug 列表

### 3.1 Phase 1 — LLM 流与 API 网络层

---

#### BUG-001: SSE stall 恢复可能产生僵尸 reader

- **位置**: `packages/core/src/client.ts`
- **严重程度**: 🟡 中等
- **描述**: SSE stall 检测使用 `Promise.race` 超时机制。当 stall timeout 触发后，如果原始 HTTP stream 仍处于活动状态，reader 可能未被正确取消。如果 `AbortController.abort()` 未能立即终止底层 TCP 连接（依赖 Bun 的 HTTP 实现行为），则后续到达的 stream chunk 会触发已失效 Promise 的回调。
- **复现条件**:
  1. 向慢速或间歇性 API 端点发起流式请求
  2. Stall 超时触发并返回 error event
  3. 原始连接尚未完全断开
  4. 后续 chunk 到达并触发已被消费的 Promise
- **建议**: 在超时分支中显式调用 `reader.cancel()` 并设置状态标记防止后续回调，而非仅依赖 `AbortController.abort()`。

---

#### BUG-002: 跨 Session 重试退避状态未隔离

- **位置**: `packages/core/src/client.ts` — retry 计数器逻辑
- **严重程度**: 🟢 低
- **描述**: 如果重试退避状态（指数退避 timer、连续错误计数）不是 per-session 隔离的，那么在一个 session 中触发的 API 错误（如 429）可能导致后续新 session 的第一个请求就被延迟。这违反了用户预期：新对话不应受到旧对话 API 错误的影响。
- **复现条件**:
  1. Session A 触发 API 429 → 进入指数退避
  2. 用户切换或新建 Session B
  3. Session B 首请求意外触发延迟
- **建议**: 确认 `DeepSeekClient` 的退避状态是否随 `engine.shutdown()` 或 `sessionId` 变更而重置。

---

### 3.2 Phase 2 — Agent 核心循环与 Tool Call 生命周期

---

#### BUG-003: 共享批次中多个 ask 权限工具串行阻塞

- **位置**: `packages/core/src/streaming-executor.ts` — `flushSharedBatch()` 方法
- **严重程度**: 🟡 中等
- **描述**: 当一批 shared 工具中包含多个 `permResult === "ask"` 的工具时，`evaluatePermission` 对每个工具返回 `ask` 后，`permPromise` 创建并 `yield` 到 UI，但紧接着 `await permPromise` 会阻塞后续工具的权限询问。这意味着 UI 只能逐个收到权限请求，无法批量展示所有待确认工具。如果用户对第一个权限弹窗选择"始终允许"但 UI 无法将意图传递给后续工具，体验会受损。

**关键代码片段** (`streaming-executor.ts` 约 115-130 行):
```typescript
if (permResult === "ask") {
  const permPromise = exec.requestPermission!(tc.function.name, argsResult.args)
  yield { role: "permission_ask", toolName: tc.function.name, content: JSON.stringify(argsResult.args) }
  const allowed = await permPromise   // 阻塞后续工具权限询问
  if (!allowed) {
    // ...
  }
}
```

- **复现条件**:
  1. 模型在同一轮发起 2+ 个需要用户确认的 shared 工具
  2. 观察 UI 是否逐个弹出权限框（而非批量展示）
- **建议**: 收集所有 `ask` 工具，批量发送到 UI，或将"始终允许当前批次"逻辑传递给后续工具。

---

#### BUG-004: settle ledger 无溢出保护

- **位置**: `packages/core/src/executor-helpers.ts` — `createSettleLedger()` 函数
- **严重程度**: 🟢 低
- **描述**: `settle` 闭包使用 `Set<number>` 追踪已结算的工具调用的 `index`。如果模型返回异常大的 `toolCalls` 数组（例如 >10000），Set 会无限制增长。虽然 `maxTurns=100` 和 API 限制通常会防止此情况，但在理论极端情况下缺少数值上限保护。
- **复现条件**: 极端场景 — API 返回异常多的 tool calls（理论上不应发生，但缺少防御性上限）
- **建议**: 为 `settled` Set 增加 `size > 1000` 时的告警日志或硬性上限。

---

#### BUG-005: 工具结果溢出时 preview 截断可能破坏 JSON 结构

- **位置**: `packages/core/src/result-persistence.ts` — `maybePersistResult()` 函数
- **严重程度**: 🟢 低
- **描述**: 当 `content.length > maxChars` 时，`preview = content.slice(0, previewLen)` 取前 N 字符作为预览。如果原始 content 是 JSON 数组/对象且截断点恰好在结构中间，下游解析器可能收到语法错误的 JSON，产生混淆性错误。
- **复现条件**:
  1. 工具返回超长 JSON 数组（如 `list_dir` 递归结果）
  2. 内容超过 `200_000` 字符阈值
  3. `previewLen = 2000` 截断恰好切断 JSON 结构
- **建议**: 截断后尝试做最小 JSON 修复（添加闭合括号），或附加 `[TRUNCATED]` 标记提示下游。

---

### 3.3 Phase 3 — 上下文与持久化管理

---

#### BUG-006: AsyncSessionWriter 满队列时静默丢弃

- **位置**: `packages/core/src/session.ts` — `AsyncSessionWriter` 类
- **严重程度**: 🟡 中等
- **描述**: `MAX_QUEUE_SIZE = 500` 时 `evictIfNeeded()` 会静默丢弃最旧事件。如果 flush 速度慢于入队速度（例如磁盘 I/O 阻塞），关键事件（如 tool result）可能在用户不知情的情况下丢失。虽然 CL-32 增加了 `session.writer.overflow` 日志，但日志默认关闭，且没有向用户报告丢失了什么事件。
- **复现条件**:
  1. 高频率事件产生（多 shared 工具并行 + progress 事件）
  2. 磁盘 I/O 慢或阻塞
  3. 队列达到 500 上限
  4. 旧事件被静默驱逐
- **建议**: 
  1. 在 drain 完成后向用户报告驱逐数量
  2. 考虑为 tool_result 类事件设置最低保留优先级
  3. 增加背压机制：当 `droppedCount > 0` 时通过 status 事件通知 UI

---

#### BUG-007: `validateContextPolicy` 静默修正用户输入

- **位置**: `packages/core/src/context/policy.ts` — `mergeContextPolicy()` 函数
- **严重程度**: 🟢 低
- **描述**: 当用户传入的 `targetRatio >= triggerRatio` 时，`mergeContextPolicy` 会自动将 `targetRatio` 调整为 `triggerRatio - 0.05`，而非返回错误让用户知道配置冲突。用户可能设置了 `triggerRatio=0.5, targetRatio=0.5` 期望 trim 到一半，但实际被静默修正为 `targetRatio=0.45`。

**关键代码** (`policy.ts` 第 46-48 行):
```typescript
if (merged.targetRatio >= merged.triggerRatio) {
  merged.targetRatio = Math.max(0.05, merged.triggerRatio - 0.05)
}
```

- **复现条件**:
  1. 用户通过 `/context` 菜单或直接编辑 `context.json` 设置 `targetRatio >= triggerRatio`
  2. 系统静默修正，用户不会收到任何提示
- **建议**: 在 UI 层面验证 `targetRatio < triggerRatio` 并展示错误，或在返回值中携带修正原因。

---

#### BUG-008: 结果持久化首次初始化需完整目录扫描

- **位置**: `packages/core/src/result-persistence.ts` — `initSessionUsage()` 函数
- **严重程度**: 🟢 低
- **描述**: 每个 session 首次溢出结果时，`initSessionUsage` 会 `readdir` + 逐文件 `stat` 磁盘上的所有结果文件来计算已用配额。如果 session 有大量历史结果（接近 `maxFilesPerSession=200`），会产生 201 次文件系统调用。虽然在绝大多数场景下可接受，但在极端情况（NAS/网络磁盘）下可能造成可感知的延迟。
- **复现条件**:
  1. Session 累积了接近 200 个持久化结果文件
  2. 使用网络文件系统（如 NAS）
  3. 下一次溢出触发全部扫描
- **建议**: 在内存中维护一个持久化的字节计数快照（或使用汇总文件），避免重复扫描。

---

### 3.4 Phase 4 — 物理世界交互

---

#### BUG-009: Shell 命令模式提取可能误匹配工具参数中的关键字

- **位置**: `packages/core/src/shell.ts` — `extractShellMode()` 或类似函数
- **严重程度**: 🟡 中等
- **描述**: Shell 命令模式提取使用正则表达式匹配 `bash` / `powershell` 等关键字。如果工具参数（如 `write_file` 的 `content` 字段）中包含这些关键字，可能触发误匹配，错误地将普通参数识别为 shell 命令。
- **复现条件**:
  1. 工具参数（如 `content: "run bash script"`）包含匹配关键字
  2. 模式提取器不区分位置上下文
- **建议**: 限制匹配范围为命令文本的起始部分，或使用更严格的锚定正则（如 `^\s*bash\b` 而非 `bash`）。

---

#### BUG-010: 截断 salvage 仅阻止写入工具但未阻止 `bash` 执行

- **位置**: `packages/core/src/tool-arguments/truncation-recovery.ts`
- **严重程度**: 🟡 中等
- **描述**: `SALVAGED_TRUNCATED_WRITE_TOOLS` 仅包含 `write_file`、`edit`、`NotebookEdit`。如果截断的是 `bash` 工具的参数（例如 `{"command": "rm -rf /important/data..."}` 被截断），salvage 后可能恢复出不完整的命令并执行。`bash` 工具同样具有破坏性，应在参数来自截断 salvage 时被阻止。

**关键代码** (`truncation-recovery.ts` 第 11-14 行):
```typescript
export const SALVAGED_TRUNCATED_WRITE_TOOLS = new Set([
  "write_file",
  "edit",
  "NotebookEdit",
])
```

- **复现条件**:
  1. 模型生成超长 bash 命令，被 `max_tokens` 截断
  2. `salvageTruncatedToolJson` 提取出部分命令参数
  3. `bash` 不在阻止列表中，命令被执行
- **建议**: 将 `bash` 和所有 exec-tier 工具加入 `SALVAGED_TRUNCATED_WRITE_TOOLS`，或创建独立的 `SALVAGED_TRUNCATED_EXEC_TOOLS` 列表。

---

### 3.5 Phase 5 — 并发、竞态与框架陷阱

---

#### BUG-011: `early-stop.ts` 跨轮 patch spiral 检测被重置

- **位置**: `packages/core/src/early-stop.ts` — `newTurn()` 方法
- **严重程度**: 🟡 中等
- **描述**: `newTurn()` 将 `this.patchFailures = {}` 和 `this._patchAttempts = {}` 重置为空对象。这意味着模型可以在 Turn 1 中修补 `file A` 失败 4 次（触发 patch_spiral），然后在 Turn 2 中再次修补 `file A` 失败 4 次（再次触发），如此循环。虽然每轮都会触发 stop signal，但如果 loop 未正确处理 stop signal 就进入新轮次，可能形成跨轮无限 patch 循环。

**关键代码** (`early-stop.ts` 第 179-185 行):
```typescript
newTurn(): void {
  this.patchFailures = {}
  this._patchAttempts = {}
  this._readOnlyStreak = 0
  this._hasWrittenThisTurn = false
}
```

- **复现条件**:
  1. 模型在 Turn N 中修补同一文件失败 >= maxPatchFailures 次
  2. EarlyStopDetector 触发 patch_spiral signal
  3. Loop 处理 signal 后进入 Turn N+1
  4. `newTurn()` 重置计数器
  5. 模型再次修补同一文件，计数器从 0 开始
- **建议**: 对触发过 patch_spiral 的文件路径在跨轮次中保持冷却标记（如 3 轮内禁止再 patch 同一文件）。

---

#### BUG-012: `Promise.allSettled` 兜底分支丢失声明顺序

- **位置**: `packages/core/src/streaming-executor.ts` — `flushSharedBatch()` 方法
- **严重程度**: 🟢 低
- **描述**: 当 `Promise.allSettled(pending)` 结果中包含 rejected Promise 时，兜底逻辑使用 `allowedBatch[i]` 按循环索引获取对应的 `tc/index`：

**关键代码** (`streaming-executor.ts` 约 155-160 行):
```typescript
const completed = await Promise.allSettled(pending)
...
if (entry.status === "fulfilled") {
  settled_results.push(entry.value)
} else {
  const { tc, index } = allowedBatch[i]  // 使用循环索引
  ...
}
```

如果 `executeToolResult()` 内部 catch 未能捕获所有异常（虽然代码中确实有 try/catch 包裹），导致 `pending` Promise reject，此时 `allowedBatch[i]` 仍能正确获取对应的 `tc/index`。但如果 `allowedBatch` 和 `pending` 的构建顺序不一致（例如未来重构引入 `filter`），则可能错位。

- **复现条件**: 极端情况 — 未来代码重构导致 `pending` 数组和 `allowedBatch` 数组的元素顺序不一致
- **建议**: 在 `pending` Promise 中包含 `{ tc, index }` 上下文，而非依赖数组索引对应关系。当前代码在 rejected 分支中依赖此对应关系。

---

#### BUG-013: AbortSignal 在工具批次执行中可能出现竞态

- **位置**: `packages/core/src/streaming-executor.ts` — `executeToolResult()` 方法
- **严重程度**: 🟢 低
- **描述**: 在 `flushSharedBatch` 中，`pending` Promises 在 `yield { role: "tool_start" }` 之前就已经启动（通过 `exec.executeToolResult()`）。这意味着即使 consumer 在接收到 `tool_start` 事件后立即 abort，工具执行可能已经完成了（或接近完成）。虽然 `executeToolResult` 在开始时检查 `signal.aborted`，但检查与执行之间无原子性保证。
- **复现条件**:
  1. 消费者快速 abort（在 tool_start 和 tool_progress 之间）
  2. 某些同步执行或非常快的工具在 abort 传播前已完成
  3. 工具结果被丢弃但副作用已发生
- **建议**: 在 `executeToolResult` 中增加 `signal.throwIfAborted()` 调用（如果 Bun 支持），或在工具执行完成后的 `finally` 中检查 abort 状态并丢弃结果。

---

### 3.6 Phase 6 — TUI 终端与前端渲染

---

#### BUG-014: `queueMicrotask` 在 React 状态更新器内部的风险

- **位置**: `packages/tui/src/bridge.tsx` — `commitBridge()` 函数
- **严重程度**: 🟡 中等
- **描述**: `commitBridge` 在 React 的 `setState(prev => ...)` 回调内部使用 `queueMicrotask` 来写入 `BridgeRuntime` 和 `TranscriptStore`。React 18+ 的严格模式会对状态更新器进行双重调用（double-invoke）来检测副作用问题。

**关键代码** (`bridge.tsx` 约 130-140 行):
```typescript
const commitBridge = (updater: (prev: BridgeState) => Partial<BridgeState>): void => {
  setState(prev => {
    const patch = updater(prev);
    if (bridgeRuntime && transcriptStore) {
      queueMicrotask(() => bridgeRuntime.applyPatch(patch));  // 双重调用风险
      return prev;
    }
    return { ...prev, ...patch };
  });
};
```

React 严格模式下 `updater` 会被调用两次，但 `queueMicrotask` 中的 `bridgeRuntime.applyPatch(patch)` 只会执行一次（因为 microtask 在两次 updater 调用之间不会执行）。然而 `patch` 对象是同一个引用，如果 `applyPatch` 对其做了 mutation，第二帧可能读到被修改后的 `patch`。

- **复现条件**:
  1. React 严格模式（开发环境默认）
  2. `bridgeRuntime` 启用
  3. 高频事件更新（如流式文本 delta）
- **建议**: 在 `applyPatch` 中使用不可变复制，或在 `queueMicrotask` 中传入 `{...patch}` 的浅拷贝。

---

#### BUG-015: Timeline 查找索引在长会话中 O(n) 退化

- **位置**: `packages/tui/src/bridge.tsx` — `applyAssistantToTimeline()` 函数
- **严重程度**: 🟢 低
- **描述**: `applyAssistantToTimeline` 使用 `items.findIndex(existing => existing.id === item.id)` 查找现有条目。在长会话（100+ 轮）中，Timeline 可能有 500+ 条目，每次 delta 更新都做 O(n) 线性查找。虽然 Ink 有 viewport culling，但 Timeline 数据结构本身的查找仍是线性的。
- **复现条件**:
  1. 长会话（大量对话轮次）
  2. 每轮流式 delta 频繁触发 `applyAssistantToTimeline`
  3. Timeline 条目超过 500+
- **建议**: 使用 `Map<string, number>` 维护 id -> index 的快速查找表，在 `applyAssistantToTimeline` 中 O(1) 定位。

---

#### BUG-016: `fallbackToolKey` 在 index 和 name 都为空时生成不稳定键

- **位置**: `packages/tui/src/bridge.tsx` — `fallbackToolKey()` 函数
- **严重程度**: 🟢 低
- **描述**: 当 `index === undefined` 且 `name === undefined` 时，`fallbackToolKey` 返回 `"tool_unknown"`。如果同一轮有多个未知工具（理论上不应发生但 API 可能返回异常），它们会共享同一个 key，导致 React 渲染中覆盖而不是追加。
- **复现条件**: 极端边缘情况 — API 返回 tool call 但缺少 id/name
- **建议**: 在 key 中追加递增值或时间戳防止碰撞。

---

## 4. 严重程度总结

| 阶段 | 🟡 中等 | 🟢 低 | 🔴 高 |
|------|---------|-------|-------|
| Phase 1 (LLM/API) | 1 | 1 | 0 |
| Phase 2 (Agent/Tool) | 1 | 2 | 0 |
| Phase 3 (Context/Persist) | 1 | 2 | 0 |
| Phase 4 (Physical) | 2 | 0 | 0 |
| Phase 5 (Concurrency) | 1 | 2 | 0 |
| Phase 6 (TUI) | 1 | 2 | 0 |
| **总计** | **7** | **9** | **0** |

未发现 🔴 高严重度 Bug。

---

## 5. 总结与建议

### 5.1 总体评价

Deepreef 代码库整体质量较高。核心运行时经过多轮审计式修复（AUD-01~10、CL-10~52），在以下方面表现优秀：

- **工具执行 exactly-once** 保证通过 `settle` ledger 实现
- **权限系统** 拥有 Deny-first + 四级子代理权限的深度防御
- **上下文管理** 实现了完整的 trim/compress/compact 策略
- **早期退化检测** 覆盖重复、只读循环、patch 螺旋和问候回归
- **跨平台** CI 在三平台上全绿
- **测试覆盖** 1406 pass / 0 fail

### 5.2 优先修复建议

| 优先级 | Bug | 理由 |
|--------|-----|------|
| **P1** | BUG-010: `bash` 未加入截断阻止列表 | 破坏性操作安全风险 |
| **P1** | BUG-003: 共享批次中 ask 权限串行阻塞 | 用户体验退化，多工具确认场景 |
| **P2** | BUG-006: Session writer 满队列静默丢弃 | 数据完整性风险 |
| **P2** | BUG-011: patch spiral 跨轮重置 | 可能形成无限修补循环 |
| **P2** | BUG-014: `queueMicrotask` 双重调用风险 | React 严格模式兼容性 |
| **P3** | BUG-001: SSE stall 僵尸 reader | 网络异常场景恢复 |
| **P3** | BUG-009: Shell 模式误匹配 | 需要具体条件触发 |
| **P3** | BUG-007: 策略静默修正 | 用户配置透明性问题 |

### 5.3 架构关注点

1. **DA-R vs DA-00 状态不一致**: `TODO.md` 中 DA-R0~R7 全部 ✅ 但对应的原始 DA-00~DA-60 多数为"骨架/部分完成"。特别是 DA-60 "ReasonixEngine.currentAgent 仍驱动生产主路径"意味着双角色架构尚未在生产路径中真正接通。建议在 DA-R7 "旧路径迁移"后重新进行端到端验收。

2. **测试基线健康**: `bun test` 全量通过（799 pass / 0 fail），但需关注 memory 包的预置失败和 18 个 skip 测试是否需要重新评估。

3. **生产就绪评估**: 核心运行时（SSE 流、工具执行器、上下文管理、权限引擎）已达到生产就绪水平。双角色 Worker/Supervisor 架构、ECC content-pack 端到端接入、AgentMemory 集成仍在进行中。
*（内容由AI生成，仅供参考）*
