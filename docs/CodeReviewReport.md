# DeepReef 代码审查报告

**审查日期**: 2026-06-13
**审查范围**: `packages/core/src/` 和 `packages/tui/src/` 核心源代码
**基准文件**: `docs/TODO.md` (DA-00 至 DA-60)

---

## 一、TODO 完成情况逐条对照表

| 编号 | 任务描述 | 状态 | 说明 |
|------|---------|------|------|
| DA-00 | 永久双角色配置 (agent-profile) | **已完成** | `packages/core/src/agent-profile/` 完整实现：types.ts（AgentRole/AgentRoleProfile/AgentProfilesConfig）、schema.ts（Zod 严格校验 + version 字段）、store.ts（loadLegacyConfig/migrateLegacyConfig/migrateLegacyFromOldFormat 迁移逻辑）、index.ts（导出入口）。状态机 idle→worker_active→supervisor_active 已定义。API keys 已排除。 |
| DA-10 | CapabilityCatalog 与 RoleCapabilityView | **已完成** | `packages/core/src/capability-catalog/` 实现：CapabilityCatalog 类（注册 builtin/plugin/MCP/skill 工具，tier 分类，snapshot 导出），RoleCapabilityView 类（基于 allow/deny 列表过滤工具视图，getToolNames/hasTool 查询）。 |
| DA-20 | DualAgentRuntime 双 Agent 运行时 | **已完成** | `packages/core/src/dual-agent-runtime/` 实现：AgentRuntime（独立 submit 循环、interrupt、reset、状态跟踪），DualAgentRuntime（封装 Worker + Supervisor 两个 AgentRuntime，sendTo 按角色路由、interruptRole 中断、transitionWorkflow 阶段切换、canContinue 轮次限制）。 |
| DA-30 | WorkflowCoordinator 固定状态机 | **已完成** | `packages/core/src/workflow-coordinator/` 实现：WorkflowCoordinator 类（startWorkflow 初始化、transition 阶段转换、setSupervisorPlan/setWorkerReport、applyAdvice 建议采纳、saveCheckpoint/restoreCheckpoint 持久化），固定状态机 idle→supervisor_analyse→worker_do→worker_report→supervisor_check 循环。WorkflowConfig 支持 maxRounds/requireSupervisorPlan/requireVerificationGate。 |
| DA-40 | Dual Session 双角色会话持久化 | **已完成** | `packages/core/src/dual-session/` 实现：DualSession（独立 Worker/Supervisor RoleSessionState，含 agentSessionId、messages、modelTarget、thinkingMode、stats），workflow checkpoint 和 adviceHistory 存储，DualSessionStore（save/load/list/delete 到 `.deepreef/sessions/<id>/dual-session.json`）。 |
| DA-50 | TUI 双 Tab 与编排状态 | **已完成** | `packages/tui/src/components/workflow/DualTabSystem.tsx`（Tab 切换 Worker/Supervisor、独立消息列表）、`WorkflowStatusBar.tsx`（固定两行：阶段链 + Supervisor\|Worker\|goal 三段卡片）、`OrchestrationContext.tsx`（事件分发）、`OrchestrationSummary.tsx`（Agent 树展示）、`orchestration-store.ts`（Worker/Supervisor 状态管理、活动历史）。 |
| DA-60 | 旧版清理 | **部分完成** | `engine.ts` 中 `activeSkills` 有 `@deprecated` 注释但方法体仍完整运行；`sessionStrictness`、`thinkingMode` 有 `@deprecated` 但未移除；`currentAgent` **无任何 deprecation 标记**且仍作为核心状态使用。**新模块（DualAgentRuntime/WorkflowCoordinator/CapabilityCatalog/DualSession）未集成到 engine.ts 或 loop.ts** — 仅作为独立模块导出，核心引擎仍以 `ReasonixEngine` 单 Agent 模式运行。 |

---

## 二、发现的 Bug 列表

### Bug #1 — [严重] AgentRuntime.submit() 硬编码空 API 参数

- **位置**: `packages/core/src/dual-agent-runtime/runtime.ts`，第 94-98 行
- **描述**: `submit()` 方法调用 `this.client.chatCompletionsStream(messages, { apiKey: "", baseUrl: "", model: "default", temperature: 0.3, maxTokens: 8192 })`，其中 `apiKey` 和 `baseUrl` 被硬编码为空字符串，`model` 被硬编码为 `"default"`。这些参数应为从 AgentRuntimeOptions 或 DualAgentRuntimeConfig 传入的真实配置值。
- **严重程度**: **严重** — 导致 AgentRuntime 在生产环境中无法正常工作。
- **建议修复**:
  ```typescript
  // 应在 constructor 中接收并存储 modelTarget
  // 或从 this.client 的实例配置中获取
  const stream = this.client.chatCompletionsStream(messages, {
    model: this.modelTarget,
    temperature: this.temperature,
    maxTokens: this.maxTokens,
  })
  ```

### Bug #2 — [严重] AgentRuntime.submit() 缺少工具调用处理

- **位置**: `packages/core/src/dual-agent-runtime/runtime.ts`，`submit()` 方法（第 80-148 行）
- **描述**: `submit()` 仅处理 `text_delta` 和 `done` 事件，完全没有解析和处理工具调用（tool calls）。AgentRuntime 本质上是一个纯文本流式运行器，无法执行工具调用。对比 `engine.ts` 中 `ReasonixEngine` 的 `submit()` 有完整的工具调用执行循环。
- **严重程度**: **严重** — AgentRuntime 无法作为完整的 Agent 使用，缺少核心能力。
- **建议修复**: 实现工具调用解析、执行和结果回注循环，类似 `engine.ts` 中的 `runLoop` 模式，或通过注入 `StreamingToolExecutor` 实现。

### Bug #3 — [中等] AgentRuntime.stats 统计永不更新

- **位置**: `packages/core/src/dual-agent-runtime/runtime.ts`，第 25-34 行
- **描述**: `stats` 对象（promptTokens/completionTokens/cacheHitTokens/cacheMissTokens/apiCalls/toolCalls/totalCost）被初始化但 `submit()` 循环中没有任何地方更新它们。对比 `engine.ts` 有完整的 token 统计更新逻辑。
- **严重程度**: **中等** — 不影响运行但导致 `getState()` 返回的状态数据完全失真。
- **建议修复**: 在流式响应事件处理中累积 token 计数。

### Bug #4 — [中等] WorkflowCoordinator 缺少 recordEvidence() 方法

- **位置**: `packages/core/src/workflow-coordinator/coordinator.ts`
- **描述**: `types.ts` 中定义了完整的 `WorkflowEvidence` 结构（tools/failures/verification/summary），但 `coordinator.ts` 中未实现 `recordEvidence()` 方法。当前仅有 `applyAdvice()` 消费外部建议，无法在 Coordinator 内部记录证据。这意味着证据收集能力在当前实现中是缺失的。
- **严重程度**: **中等** — 证据链是 Supervisor 决策的基础，缺失会导致 Supervisor 无法获取 Worker 执行时的完整上下文。
- **建议修复**: 添加 `recordEvidence(evidence: WorkflowEvidence)` 方法并持久化到 checkpoint。

### Bug #5 — [低] CapabilityCatalog.classifyToolTier() 纯名称匹配可能误分类

- **位置**: `packages/core/src/capability-catalog/catalog.ts`，第 126-145 行
- **描述**: `classifyToolTier()` 仅基于工具名称的小写匹配（包含 "read"/"list"/"grep"/"search" → read；包含 "bash"/"shell"/"exec"/"run" → exec；其余 → write）。例如工具名为 `search_and_replace` 会被分类为 read（因为先匹配到 "search"），而实际上它有写操作。
- **严重程度**: **低** — tier 分类仅用于元数据展示，不影响工具调用权限控制（权限控制在 RoleCapabilityView 的 allow/deny 中）。
- **建议修复**: 添加显式工具名列表或允许外部显式传入 tier 参数覆盖自动分类。

### Bug #6 — [低] DualAgentRuntime.sendTo() 未防止重复调用

- **位置**: `packages/core/src/dual-agent-runtime/dual-runtime.ts`，第 73-90 行
- **描述**: `sendTo()` 检查 `this.activeRole` 状态但未检查目标角色是否已在运行中。虽然 `AgentRuntime.submit()` 内部会抛出 "already running" 错误，但这个错误的传播路径不够明显，可能导致工作流状态不一致。
- **严重程度**: **低** — 有底层 AgentRuntime 的防护，但上层可以更优雅地处理。
- **建议修复**: 在 `sendTo()` 开头添加角色状态检查，如果目标 role 正在运行则返回错误事件而非依赖底层抛出。

### Bug #7 — [低] engine.ts 中 `currentAgent` 缺少 @deprecated 标记

- **位置**: `packages/core/src/engine.ts`，第 106 行
- **描述**: `currentAgent` 字段仍作为核心状态被大量使用（第 233/349/536/542/588/608/681 行），但 `types.ts` 中的 `AgentRole` 已被定义为 `"worker" | "supervisor"` 而非旧的 `"build" | "plan"`。`currentAgent` 未标记 `@deprecated`，且与新模块的关系不明确。
- **严重程度**: **低** — DA-60 清理任务的一部分。
- **建议修复**: 添加 `@deprecated` 注释并说明迁移路径，在 `AgentRuntime`/`DualAgentRuntime` 完全集成后移除。

---

## 三、架构层面发现

### 3.1 新旧模块并存但未集成

DA-10~DA-40 模块（CapabilityCatalog、DualAgentRuntime、WorkflowCoordinator、DualSession）均完整实现并导出，但 `engine.ts` 和 `loop.ts` 中**没有任何引用**。这意味着：

- `ReasonixEngine` 仍以单 Agent 模式运行（`currentAgent` 在 "build"/"plan" 之间切换）
- 新模块处于"已实现但搁置"状态 — 需要在 engine.ts 或新的入口文件中完成集成后才生效
- `index.ts` 同时导出新旧两套 API，可能导致消费者困惑

### 3.2 AgentRuntime vs ReasonixEngine 功能差距

对比两个运行时实现：

| 能力 | ReasonixEngine | AgentRuntime |
|------|---------------|-------------|
| 流式响应 | Yes | Yes |
| 工具调用执行 | Yes | No |
| Token 统计 | Yes | No |
| Session 持久化 | Yes | No |
| 权限控制 | Yes | No |
| 中断/取消 | Yes | Yes |
| 角色隔离 | No（单 Agent 切换） | Yes（独立实例） |

AgentRuntime 需要在集成前补齐工具调用、统计和权限能力。

---

## 四、总结与建议

### 完成度评估

- **DA-00 至 DA-50 模块实现**: 90% — 六个核心模块全部有独立实现，类型定义和基础逻辑完整
- **DA-60 旧版清理**: 30% — 仅有部分 @deprecated 标记，旧代码仍为运行主干
- **整体集成度**: 30% — 新模块未接入核心引擎

### 优先级建议

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 修复 Bug #1 #2（runtime.ts） | AgentRuntime 无法正常工作，阻塞所有后续集成 |
| P0 | engine.ts 集成 DualAgentRuntime | 将新模块接入核心运行循环，替换 currentAgent 切换 |
| P1 | 修复 Bug #3（stats 统计） | 影响状态监控和计量准确性 |
| P1 | 补齐 WorkflowCoordinator.recordEvidence | Supervisor 决策基础能力缺失 |
| P2 | 修复 Bug #5 #6 #7 | 低影响但应修复的细节问题 |
| P2 | DA-60 完整清理 | 移除旧 currentAgent/activeSkills/sessionStrictness，转为 @deprecated 适配器 |

### 建议

1. **集成路径**: 在 `engine.ts` 或新建 `dual-engine.ts` 中创建 `submitWorkflow()` 方法，串联 WorkflowCoordinator → DualAgentRuntime → DualSession 的完整工作流
2. **AgentRuntime 增强**: 参考 `ReasonixEngine.submit()` 的实现，为 AgentRuntime 添加工具调用执行循环和统计更新
3. **测试覆盖**: 当前 `packages/core/src/` 下未发现 `.test.ts` 文件，建议为核心模块添加单元测试
4. **TUI 适配**: 旧 `StatusBar.tsx` 仍使用单 `agent` prop，集成后需切换到 `WorkflowStatusBar` 或扩展为支持双 Agent 状态
