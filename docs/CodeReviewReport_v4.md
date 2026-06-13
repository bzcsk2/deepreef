# Deepreef 代码审查报告 v4

**审查日期**: 2026-06-13  
**审查范围**: `\\192.168.1.3\share\Win_agent\deepreef` 全部源代码  
**审查方法**: 依据 `cleanup.md` 方法论执行  
**审查人**: File Agent (系统化静态审查)  

---

## 一、审查方法论说明

本次审查严格遵循 `cleanup.md` 中定义的系统性代码审查方法论，包含以下步骤：

### 1.1 项目地图构建
- 通读 TODO.md 了解开发状态与未完成事项
- 遍历 package.json / tsconfig.json / vitest.config.ts 了解技术栈
- 扫描 packages/、e2e/、examples/、types/ 等目录，建立完整文件清单
- 逐模块读取核心入口文件（index.ts）理解导出结构

### 1.2 不变量建立
- 识别代码中的核心契约：Worker/Supervisor 双角色分离、Core/TUI 边界、只读/可写权限、分支预算约束
- 对照 TODO.md 中列出的 10 条不可破坏边界逐条验证
- 标注测试文件中的预期失败断言作为已知缺陷参考

### 1.3 坏味道审查（A-G 分类）
| 类别 | 含义 | 关注点 |
|------|------|--------|
| A | 架构与设计 | 模块耦合、dead code、重复实现、接口缺失 |
| B | 并发与状态 | 竞态条件、全局可变状态、状态泄漏、异步初始化顺序 |
| C | 逻辑错误 | 边界条件、符号误用、控制流缺陷、一致性破缺 |
| D | 类型与契约 | 类型不匹配、接口漂移、访问修饰符绕过、Schema 不一致 |
| E | 可观测性 | 错误吞没、日志缺失、Promise 泄漏、异常处理空洞 |
| F | 安全性 | 非安全随机、路径穿越、权限绕过、注入风险 |
| G | 工程健康 | 废弃字段存活、TODO 标记过期、测试覆盖空洞、命名不一致 |

### 1.4 评价标准
| 优先级 | 含义 |
|--------|------|
| P0 | 阻断级：导致系统崩溃/数据丢失/安全漏洞 |
| P1 | 严重：核心功能不正确或严重设计缺陷 |
| P2 | 中等：边界条件错误、状态泄漏、类型安全破坏 |
| P3 | 轻微：代码异味、可读性、维护性问题 |

---

## 二、TODO 完成情况对照

### 2.1 DA-R0 至 DA-R7 阶段状态

| 阶段 | 名称 | TODO 标记状态 | 实际审查状态 | 差距 |
|------|------|-------------|-------------|------|
| DA-R0 | 基线分析与修复 | ✅ 已完成 | ⚠️ 部分完成 | 测试中多项断言仍为预期失败状态 |
| DA-R1 | 阶段性继续 | ✅ 已完成 | ⚠️ 部分完成 | DualAgentRuntime 仍为半成品 |
| DA-R2 | 调度系统 | ✅ 已完成 | ⚠️ 部分完成 | WorkflowCoordinator 完全未被引用 |
| DA-R3 | 路径穿越修复 | ✅ 已完成 | ⚠️ 部分完成 | DualSession 存在路径穿越绕过 |
| DA-R4 | 安全加固 | ✅ 已完成 | ⚠️ 部分完成 | Math.random() 仍用于 ID 生成 |
| DA-R5 | 类型系统完善 | ✅ 已完成 | ⚠️ 部分完成 | 多处类型不一致 |
| DA-R6 | 资源清理 | ✅ 已完成 | ⚠️ 部分完成 | QuestionService 无超时机制 |
| DA-R7 | 性能与稳定性 | ✅ 已完成 | ⚠️ 部分完成 | 存在竞态和异步初始化问题 |

### 2.2 不可破坏边界对照

| 边界 | 描述 | 状态 |
|------|------|------|
| Core/TUI 分离 | TUI 不直接访问 Core 内部状态 | ✅ 通过 |
| Worker/Supervisor 双角色独立上下文 | 两角色不共享消息/工具集 | ⚠️ 通过但有泄漏风险 |
| Supervisor 只读 | Supervisor 不能调用写工具 | ⚠️ 测试断言此场景仍为预期失败 |
| 分支预算不绕过 | 无绕过预算检查的路径 | ⚠️ 存在边缘 case |
| 权限三级判定 | Allow/Deny/Ask 不可跳过 | ✅ 通过 |

---

## 三、Bug 列表

### 3.1 类别 A：架构与设计

#### A1 [P1] DualAgentRuntime 为半成品，无实际工具执行能力

**位置**: `packages/core/src/dual-agent-runtime/runtime.ts:101-166`

**描述**: `AgentRuntime.submit()` 方法仅将用户输入发送给 LLM 并流式输出文本 delta，完全缺少工具调用执行循环。类中未注册 `toolExecutor`、未维护 `toolSpecs`、未处理 `tool_call_delta` 事件。调用方（`DualAgentRuntime`）包装了两个 `AgentRuntime` 实例却无法让它们执行任何实际工作。

**复现条件**: 创建 `DualAgentRuntime` 实例，提交包含工具调用需求的任务（如"创建一个新文件"），Agent 只会输出文本回复而不会实际执行工具。

**严重程度**: P1 — Worker/Supervisor 双角色架构核心功能缺失。

---

#### A2 [P1] WorkflowCoordinator 为完全 dead code

**位置**: `packages/core/src/workflow-coordinator/coordinator.ts`（253 行）、`packages/core/src/workflow-coordinator/types.ts`（115 行）

**描述**: `WorkflowCoordinator` 类实现了完整的工作流状态机（`observe → orient → decide → act`），但 `engine.ts` 中完全未引用该模块。同时 `dual-agent-runtime/types.ts` 中定义的 `WorkflowPhase` 类型（含 `"worker_do"`）与 `workflow-coordinator/types.ts` 中的 `WorkflowPhase` 类型（不含 `"worker_do"`）不一致，两者同名异义。

**复现条件**: 在代码库中搜索 `WorkflowCoordinator` 的引用，发现仅在 index.ts 导出中引用，无任何运行时调用。

**严重程度**: P1 — 368 行代码完全闲置，且造成类型系统歧义。

---

#### A3 [P2] engine.ts 中 @deprecated 字段仍在活跃使用

**位置**: `packages/core/src/engine.ts:117-119, 374-397, 623`

**描述**: 以下字段明确标记为 `@deprecated`，但在 `submit()` 主循环中仍作为活跃代码路径被读取和使用：

- `activeSkills`（行 117）：在 `buildActiveSkillsPrompt()` 中构建 system prompt（行 397）
- `thinkingMode`（行 378）：通过 `loopOpts.thinkingMode` 传入 `runLoop`（行 623）
- `sessionStrictness`（行 139）：在 `getHarnessStrictness()` 中作为 fallback（行 388）
- `harnessProfile`（行 645）：在 `requireVerificationBeforeFinal` 计算中作为 fallback

废弃字段与新版 `AgentProfile`/`EffectiveHarnessPolicy` 双轨并行，形成双数据源混乱。

**严重程度**: P2 — 增加维护负担，容易因双轨不一致引发隐藏 bug。

---

#### A4 [P3] ReasonixEngine 与 AgentRuntime 存在大量重复实现

**位置**: `packages/core/src/engine.ts` vs `packages/core/src/dual-agent-runtime/runtime.ts`

**描述**: `AgentRuntime` 独立于 `ReasonixEngine` 重新实现了消息管理（`ctx.log.append`）、状态跟踪（`status/running/completed/failed`）、中断处理（`abortController.abort()`）等逻辑，但未共享任何接口或基类。两套运行时无统一的 `AgentRuntimeInterface` 抽象层。

**严重程度**: P3 — 代码重复、接口分裂。

---

### 3.2 类别 B：并发与状态

#### B1 [P1] 全局可变状态 toolCallSeq 导致多会话 ID 冲突

**位置**: `packages/core/src/loop-helpers.ts:13-17`

**描述**: `toolCallSeq` 是模块级全局变量，由 `normalizeToolCallId()` 自增、`resetToolCallSeq()` 归零。当同一进程内存在多个 `ReasonixEngine` 实例（或多个 subagent Worker）时，并行执行的 `runLoop` 会竞争修改此计数器，导致生成的 tool call ID 发生碰撞。

```typescript
let toolCallSeq = 0  // 模块级可变状态

export function normalizeToolCallId(rawId: string | undefined, toolName: string): string {
  if (rawId && rawId.trim()) return rawId.trim()
  return `${toolName}-${++toolCallSeq}-${randomUUID()}`
}
```

**复现条件**: 同时运行 2 个 subagent Worker，观察 tool call ID 冲突。

**严重程度**: P1 — 并发环境下 ID 碰撞可导致工具调用结果关联错误。

---

#### B2 [P2] taskLedger 跨 submit 调用未清理

**位置**: `packages/core/src/engine.ts:649-652`

**描述**: 在 `submit()` 开始时，仅当 `shouldCreateLedger(userInput)` 返回 `true` 时才设置 `this.taskLedger = new TaskLedgerTracker(...)`；返回 `false` 时设为 `undefined`。但如果上一次 submit 创建了 taskLedger，当前 submit 之前没有显式置空——上一个 taskLedger 的残留状态（plan 进度、changedFiles 列表）会污染新 submit 的早期阶段。

**复现条件**: 先提交一个需要 TaskLedger 的任务，再立即提交一个纯问题（不触发 Ledger 创建），在第二次 submit 的早期轮次中读取 `this.taskLedger`。

**严重程度**: P2 — 状态泄漏导致跨任务数据污染。

---

#### B3 [P2] contextPolicyLoadPromise 异步初始化竞态

**位置**: `packages/core/src/engine.ts:277-284`

**描述**: 构造函数中 `contextPolicyLoadPromise` 以 fire-and-forget 方式异步加载策略文件：

```typescript
this.contextPolicyLoadPromise = this.policyStore.load().then(savedPolicy => {
  this.contextPolicy = savedPolicy
}).catch(() => {})
```

如果在 Promise resolve 之前调用 `getContextPolicyAsync()` 或 `setContextPolicy()`，它们会 `await this.contextPolicyLoadPromise` 等待加载完成——这是正确的。但如果外部代码直接同步调用 `getContextPolicy()`（不 await），则可能读到尚未被 `.then()` 更新的默认策略 `DEFAULT_CONTEXT_POLICY`。

**复现条件**: 在 Engine 构造后立即同步调用 `getContextPolicy()`。

**严重程度**: P2 — 短时间内读到过期策略。

---

#### B4 [P3] QuestionService 无超时机制，Promise 可能永久泄漏

**位置**: `packages/core/src/question/service.ts:55-62`

**描述**: `ask()` 方法创建一个存储在 `this.pending` Map 中的 Promise，但没有设置超时。如果 TUI 层从未调用 `reply()` 或 `reject()`（例如用户关闭终端），该 Promise 及其关联闭包将永远无法被 GC 回收。

```typescript
return new Promise<QuestionAnswer[]>((resolve, reject) => {
  this.pending.set(id, { info: request, resolve, reject })
})
```

`shutdown()` 方法会清理 pending 条目，但正常的任务完成路径并不总是调用 `shutdown()`。

**严重程度**: P3 — 长期运行可能导致内存泄漏。

---

### 3.3 类别 C：逻辑错误

#### C1 [P1] branch-budget.ts: findOverLimit 与 checkToolBlock 判断阈值不一致

**位置**: 
- `packages/core/src/governance/branch-budget.ts:375-383`（`findOverLimit` 使用 `count > limit`）
- `packages/core/src/governance/branch-budget.ts:175`（`checkToolBlock` 使用 `count >= limit`）

**描述**: `findOverLimit` 判断超限时使用严格大于（`>`），而 `checkToolBlock` 使用大于等于（`>=`）。这意味着当计数恰好等于上限时：
- `checkToolBlock` 会拦截工具（`blocked: true`）
- `shouldBranchRecover`（调用 `findOverLimit`）不会触发恢复信号（`triggered: false`）

两个方法对"超限"的定义不一致，导致工具被拦截但 Supervisor 不感知。

**复现条件**: 对同一文件连续编辑恰好 `fileEditMax`（默认 3）次，第 4 次编辑时 `checkToolBlock` 返回 `blocked: true`，但 `shouldBranchRecover` 返回 `triggered: false`。

**严重程度**: P1 — Supervisor 对已触发拦截的分支无感知，无法执行干预。

---

#### C2 [P1] supervisor/pool.ts: loadSupervisorPool 文件不存在时丢弃默认池

**位置**: `packages/core/src/supervisor/pool.ts:157-160`

**描述**: 当 `SUPERVISOR_POOL_FILE` 不存在时，`loadSupervisorPool` 直接返回 `{ candidates: [] }`，完全丢弃 `DEFAULT_SUPERVISOR_POOL`。而 `DEFAULT_SUPERVISOR_POOL` 中所有条目的 `enabled` 已设为 `false`——设计意图是"用户显式配置才启用"，但若用户创建了配置文件并启用了某个候选（如 `zen-deepseek`），配置中未提及的默认候选应保留但保持禁用状态。

**当前行为**: `{candidates: []}` — 无配置文件时返回完全空池，即使默认候选存在也不保留。

**预期行为**: 当文件存在时，通过 `mergeSupervisorPool(DEFAULT_SUPERVISOR_POOL, parsed.config)` 正确合并。但文件不存在路径未合并。

**复现条件**: 不创建 `.deepreef/supervisor-pool.json`，调用 `loadSupervisorPool()`。

**严重程度**: P1 — 条件分支导致行为不对称。

---

#### C3 [P2] engine.ts: harnessProfile fallback 被 ?? 运算符无效化

**位置**: `packages/core/src/engine.ts:641-644`

**描述**:
```typescript
requireVerificationBeforeFinal: (this.effectivePolicy?.verification === "block"
  || this.effectivePolicy?.verification === "require-or-waive")
  ?? harnessProfile.requireVerificationBeforeFinal,
```

`??`（nullish coalescing）运算符只在左侧为 `null` 或 `undefined` 时取右侧。但 `===` 比较的结果永远是 `true` 或 `false`（布尔值），不是 null/undefined。因此 `harnessProfile.requireVerificationBeforeFinal` 作为 fallback 永远不会被使用——当 `effectivePolicy` 为 `null` 时 `effectivePolicy?.verification` 返回 `undefined`，但 `undefined === "block"` 返回 `false`，而非 `undefined`。

**正确写法**: 应先判断 `effectivePolicy` 是否为 null：
```typescript
this.effectivePolicy 
  ? (this.effectivePolicy.verification === "block" || this.effectivePolicy.verification === "require-or-waive")
  : harnessProfile.requireVerificationBeforeFinal
```

**复现条件**: `effectivePolicy` 为 `null`（Harness 策略未解析时）。

**严重程度**: P2 — deprecated fallback 路径死代码。

---

#### C4 [P2] context/manager.ts: truncateToBudget 降级逻辑可能丢失所有消息

**位置**: `packages/core/src/context/manager.ts:218-236`

**描述**: 当 log 中无 `"user"` 角色的消息时（全部为 tool/assistant 消息），`firstRoundEnd` 返回 `messages.length`，导致 `current.slice(messages.length)` 为空数组。但 `truncateToBudget` 的 while 循环有备选逻辑（查找 `tool` 角色），不过该逻辑在 `current.findIndex(m => m.role === "tool")` 返回 `-1` 时直接 `break`，导致降级截断失败，函数返回空数组。

**严重程度**: P2 — 极端情况下丢失全部对话上下文。

---

#### C5 [P2] context/manager.ts: buildMessages 不检查 total tokens 超限

**位置**: `packages/core/src/context/manager.ts:106-121`

**描述**: `buildMessages` 检查了 `prefix` 和 `scratch` 单独是否超限（会抛出 Error），但只对最终总 token 数写了一条注释"fold decision in loop.ts will force a fold"，并未实际抛出错误。如果 `prepareLog` 返回的 log + prefix + summary + scratch 总和超过窗口，消息会被原样发送给 LLM，可能导致 API 错误或静默截断。

**严重程度**: P2 — 超限消息静默传递，可能导致 LLM 返回截断或异常结果。

---

#### C6 [P2] governance/mode-decision.ts: evaluate() finally 块无条件清空信号

**位置**: `packages/core/src/governance/mode-decision.ts:310-320`

**描述**: `evaluate()` 方法的 try-catch-finally 中，`finally` 块无条件清空 `submittedSignals`。即使 `evaluate()` 抛出异常（被 catch 捕获并以 `engine_fail_safe` 进入 forced），外部调用者事后无法追溯原始提交的信号列表。

**严重程度**: P2 — 异常路径丢失审计信息。

---

#### C7 [P3] context/manager.ts: reduceToTarget 中 lastRoundStart 返回 -1 的保护逻辑不完整

**位置**: `packages/core/src/context/manager.ts:130-146`

**描述**: 当 `lastRoundStart` 返回 `-1`（无 user 消息），`protectedStart` 为 `-1`，`protectedTail` 被设为空数组。同时 `current` 被设为 `[...originalLog]` 的完整副本。在 while 循环中 `firstRoundEnd` 对全部消息查找 `"user"`，找不到则返回 `messages.length`，导致一轮删除全部消息——与 C4 同类问题。

**严重程度**: P3 — 与 C4 同类问题，但触发条件更苛刻。

---

### 3.4 类别 D：类型安全与契约

#### D1 [P2] context/policy.ts: ContextPolicy 的 mode 验证值与类型定义不匹配

**位置**: `packages/core/src/context/policy.ts:22` vs `packages/core/src/context/policy.ts:3`

**描述**: `validateContextPolicy` 中 mode 的有效值包含 `"compact"`，但 `ContextPolicyMode` 联合类型定义中只有 `"trim" | "compress"`，不含 `"compact"`。在 `engine.ts` 的 `runContextReduction` 方法中，`"compact"` 被映射为 `"compress"` 后再传入 `reduceToTarget`，说明 `"compact"` 是一个配置层面的别名而非引擎接受的模式值。

**严重程度**: P2 — 类型定义与实际验证逻辑不一致。

---

#### D2 [P2] subagent/run.ts: 通过 `parentEngine["client"]` 绕过 private 修饰符

**位置**: `packages/core/src/subagent/run.ts:35`

**描述**: `SubagentRunner.spawnAndRun` 中通过 `parentEngine["client"]` 访问 `ReasonixEngine` 的私有字段。TypeScript 编译时此项通过（索引访问不触发 access modifier 检查），但这是明显的类型安全绕过。如果 `client` 字段被重构或重命名，此处会静默失败。

**严重程度**: P2 — 类型系统绕过。

---

#### D3 [P2] PermissionService.matchWildcard 异常时 fallback 到精确匹配

**位置**: `packages/core/src/permission/service.ts:140-155`

**描述**: 在 `matchWildcard` 方法的 catch 块中，当正则表达式构造失败时，代码 fallback 到精确字符串匹配（`pattern === path`）。这意味着一个本应拦截的恶意通配符模式可能在异常时静默放行。

**严重程度**: P2 — 安全相关的静默降级可能导致权限误判。

---

#### D4 [P3] main-mode.ts: 硬编码工具列表可能遗漏动态注册的工具

**位置**: `packages/core/src/main-mode.ts:20-23`

**描述**: `MAIN_MODES.build.toolNames` 是硬编码的字符串数组（27 个工具名），当通过 `engine.registerTool()` 动态注册新工具时，该列表不会更新。

**严重程度**: P3 — 工具注册机制与工具过滤列表脱节。

---

### 3.5 类别 E：可观测性

#### E1 [P3] engine.ts: hook 执行使用 `void` 吞没 Promise 拒绝

**位置**: `packages/core/src/engine.ts:724`

**描述**: `void this.hookManager.runOnLoopEvent(...).catch(() => {})` — 如果 `runOnLoopEvent` 抛出异常，`.catch(() => {})` 静默吞没错误。开发者无法从日志获知 hook 执行失败。

**严重程度**: P3 — 降低调试效率。

---

#### E2 [P3] early-stop.ts: listeners 的 try/catch 吞没所有异常

**位置**: `packages/core/src/query-engine.ts:25`

**描述**: `try { cb(event) } catch {}` — 完全吞没 listener 回调中的异常，无任何日志输出。

**严重程度**: P3 — 调试困难。

---

### 3.6 类别 F：安全性

#### F1 [P1] permission/service.ts: Math.random() 用于安全相关 ID 生成

**位置**: `packages/core/src/permission/service.ts:34`

**描述**: 权限规则的 ID 使用 `Math.random()` 生成，非密码学安全的随机数。攻击者可预测 ID 序列并尝试绕过权限检查。应使用 `node:crypto` 的 `randomUUID()` 或其他 CSPRNG。

**严重程度**: P1 — 安全边界缺陷。

---

#### F2 [P2] DualSessionStore.validateSessionId 路径穿越防护存在绕过风险

**位置**: `packages/core/src/dual-session/store.ts:21-40`

**描述**: `validateSessionId` 检查了 `".."`, `"/"`, `"\\"`, `"\0"`, `"%"`, `"&"`, `"?"` 等字符，但未检查 URL 编码的路径穿越变体（如 `%2e%2e%2f` 在解码前通过了 `%` 检查回退后可能被底层文件系统解析）。此外，未检查 `:` 在 Windows 上的盘符语义。

**严重程度**: P2 — 路径穿越防护不完整。

---

#### F3 [P3] engine.ts: private client 字段通过子代理泄漏

**位置**: `packages/core/src/engine.ts:869`

**描述**: `spawnSubagent` 中创建子 Engine 时共享父 Engine 的 `this.client`。如果子代理的 prompt 被构造为执行恶意操作，它使用的是与父级相同的认证凭据。Subagent 的 permission engine 提供了一定程度的 tool-level 隔离，但 client 共享本身仍是需要注意的设计点。

**严重程度**: P3 — 子代理权限隔离不完整。

---

### 3.7 类别 G：工程健康

#### G1 [P2] engine.ts: DEEPSEEK_MODEL 仍使用旧模型名

**位置**: `packages/core/src/types.ts:12`

**描述**: `DEEPSEEK_MODEL` 常量值为 `"deepseek-v4-flash"`，但 TODO.md 中已多次提及模型迁移需求。旧的模型名可能导致 API 调用返回 404 或意外降级。

**严重程度**: P2 — 配置错误导致 API 调用失败。

---

#### G2 [P3] TODO.md 中 DA-R0~DA-R7 全部标记为 ✅ 但存在大量未完成项

**位置**: `TODO.md:128-232`

**描述**: DA-R0 至 DA-R7 八个阶段在"任务分解"表格中全部标记为 `✅`（已完成），但实际审查发现 DualAgentRuntime 仍为半成品、WorkflowCoordinator 未被引用、多处已知缺陷未修复。这种不一致会误导新开发者。

**严重程度**: P3 — 项目状态可见性失真。

---

## 四、总结与建议

### 4.1 整体评估

Deepreef 项目处于从单 Agent 引擎向 Worker/Supervisor 双角色架构迁移的中期阶段。核心引擎 `ReasonixEngine`（1040 行）功能完备且包含大量 Harness 治理机制，但双角色模块（`dual-agent-runtime/`、`workflow-coordinator/`、`dual-session/`）仍处于半成品状态——代码存在但未与主引擎集成或功能不完整。

### 4.2 优先级汇总

| 优先级 | 数量 | 关键问题 |
|--------|------|---------|
| P0 | 0 | — |
| P1 | 5 | DualAgentRuntime 半成品、WorkflowCoordinator dead code、全局状态线程安全、branch budget 阈值不一致、Supervisor 池默认空 |
| P2 | 11 | taskLedger 泄漏、异步初始化竞态、类型不匹配、fallback 死代码、路径穿越防护、上下文截断逻辑 |
| P3 | 9 | 代码重复、Promise 泄漏、错误吞没、测试框架混合、废弃字段残留 |

### 4.3 建议优先修复项

1. **完成 DualAgentRuntime 工具执行循环** — 在 `AgentRuntime.submit()` 中实现完整的 tool call → execute → result 循环，注册 toolExecutor 和 toolSpecs
2. **清理或集成 WorkflowCoordinator** — 要么接入 engine.ts，要么删除以避免维护负担
3. **移除 toolCallSeq 全局变量** — 改为每个 runLoop 实例独立的计数器或使用 `randomUUID()` 作为唯一 ID
4. **统一 branch-budget 阈值判断** — `findOverLimit` 和 `checkToolBlock` 使用相同的不等式
5. **修复 contextPolicyLoadPromise 初始化** — 使用 `private readonly contextPolicyLoadPromise` 并在构造函数中同步初始化完成标记
6. **替换 Math.random() 为 crypto.randomUUID()** — 权限相关 ID 生成必须使用密码学安全随机数
7. **修复 engine.ts:644 的 ?? fallback bug** — `harnessProfile.requireVerificationBeforeFinal` 的 fallback 路径因运算符优先级问题从未生效

### 4.4 测试建议

- 为 `DualAgentRuntime` 添加集成测试，验证完整的 Worker/Supervisor 双角色端到端流程
- 为 `BranchBudgetTracker` 添加边界测试（计数恰好等于上限时的行为）
- 为 `DualSessionStore` 添加路径穿越 fuzzing 测试
- 统一测试框架为 vitest，移除 bun:test 依赖

---

*报告由 File Agent 基于 cleanup.md 方法论自动生成。所有发现均通过对源代码的逐行静态审查得出，未执行运行时测试。*
