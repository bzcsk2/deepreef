# Deepreef 开发审核意见与下一步动作

> 审核依据：`CodeReviewReport_v2.md`、`CodeReviewReport_v3.md`、`CodeReviewReport_v4.md` 与当前代码。
>
> 双 Agent 架构、固定 Workflow、TUI 显示策略、Session 恢复和整体测试门禁统一以 `Deepreef后续开发计划.md` 为准，本文不重复。

## 一、Code Review 报告判断

### 判断正确

- 截断 salvage 参数只禁止写文件工具，仍可能执行截断后的命令类或其他有副作用工具。
- BranchBudget 工具拦截阈值使用 `>=`，恢复触发使用 `>`，存在先阻断、却无法触发恢复的断层。
- Context 构建缺少最终总预算断言；无 user 消息等异常上下文缺少明确处理规则。
- `bridge.tsx` 的 React state updater 内存在 `queueMicrotask` 副作用，严格模式或并发渲染下可能重复或乱序执行。
- Session、Hook、QueryEngine 的部分异常被静默吞掉，可能掩盖持久化和扩展故障。
- Permission request ID 使用 `Math.random()`，应改用标准 UUID。
- 大工具结果 preview 会直接截断文本，但没有明确截断标记。

### 部分正确

- QuestionService 没有超时是真实行为，但交互问题允许长期等待。应保证取消、退出清理和恢复，不应强制短超时。
- ContextPolicy 异步初始化期间，同步 `getContextPolicy()` 可能读到默认值。应明确可 await 的初始化契约，不需要重写整个系统。
- 无 user 消息时 Context reducer 可能清空消息。这是畸形上下文边界问题，应定义 fallback 并补测试。
- Permission `ask` 会串行阻塞同批工具。这是吞吐和交互问题，不是权限绕过。
- EarlyStop patch 计数每轮重置会削弱跨轮防重复能力。治理状态应按任务保存，并设置容量和结束清理。

### 判断错误或不采纳

- **不采纳“Supervisor 必须硬性只读”**：违反产品设计；仅在 Workflow 中使用提示词约束。
- **工具调用 ID 碰撞不成立**：`makeToolCallId()` 已包含 `randomUUID()`。
- **TaskLedger 跨 submit 泄漏不成立**：当前 `engine.ts` 已在无需 Ledger 时清空。
- **Supervisor pool 缺配置应自动提供默认网络模型不采纳**：空池是不发起意外网络请求的明确设计。
- **ContextPolicy 类型缺少 `compact` 不成立**：当前类型已包含。
- **DualSession `%2e%2e` 目录穿越不成立**：校验明确拒绝 `%`，文件系统不会进行 URL 解码。
- **非法正则回退精确匹配导致权限放宽不成立**：精确匹配更窄；可告警，但不是权限漏洞。
- **ModeDecision 清理 submitted signals 属于 bug 不成立**：这是当前消费语义。
- **SSE retry 状态跨请求污染不成立**：retry 计数是单次请求局部变量。
- **`Promise.allSettled` 结果错位不成立**：返回顺序与输入 Promise 顺序一致。
- **DeepSeek 默认模型“过时”未证实**：模型由配置和 provider profile 管理，不按报告猜测硬改。

## 二、确认需要修复的独立 Bug

### ADV-BUG-01：禁止执行截断后的有副作用工具

**位置**

- `packages/core/src/tool-arguments/truncation-recovery.ts`
- `packages/core/src/streaming-executor.ts`

**问题**

当前只阻止 `write_file`、`edit`、`NotebookEdit`。截断后的 `run_command`、shell、删除、移动、git mutation 和外部服务 mutation 仍可能执行。

**修改方法**

1. 为工具增加 `sideEffect: none | workspace | process | network | external` 元数据。
2. 默认拒绝所有带 salvage-truncated 标记的有副作用工具。
3. 只有 `sideEffect: none` 且参数 schema 验证通过的工具可以接受 salvage。
4. 被拒绝后要求模型重新生成完整参数，禁止自动重试截断命令。

**验收**

- 截断后的 mutation 工具均不执行。
- 完整参数不受影响。
- 只读工具 salvage 行为有独立测试。

### ADV-BUG-02：统一 BranchBudget 阈值

**位置**

- `packages/core/src/governance/branch-budget.ts`

**问题**

`checkToolBlock()` 使用 `count >= limit`，`findOverLimit()` 使用 `count > limit`。

**修改方法**

工具阻断和恢复触发必须复用同一个阈值判断函数。建议语义为：达到上限时阻止下一次执行，并立即生成 recovery decision。

**验收**

- 覆盖 `limit-1`、`limit`、`limit+1`。
- 不再出现工具已被阻断但恢复逻辑未触发的状态。

### ADV-BUG-03：建立 Context 最终预算不变量

**位置**

- `packages/core/src/context/manager.ts`

**修改方法**

1. `buildMessages()` 返回前验证最终总 token 不超过目标窗口，并计入 system prompt 与工具 schema。
2. reduction 后仍超预算时执行明确降级或返回可诊断错误，不能继续请求 provider。
3. 定义无 user 消息、仅 assistant、孤立 tool result、超大 system prompt 的处理规则。
4. 保证 assistant tool_calls 与对应 tool result 不被拆断。

### ADV-BUG-04：移除 React state updater 内副作用

**位置**

- `packages/tui/src/bridge.tsx`

**问题**

`commitBridge()` 和 `processQueue()` 在 `setState(prev => ...)` 内安排 `queueMicrotask`。React updater 应保持纯函数。

**修改方法**

将 BridgeRuntime 设为事实来源，先同步写 store，再通知 React 订阅；或者在 updater 外计算并提交命令。

**验收**

- React 严格模式下同一 patch、队列消息和工具事件只处理一次。
- 事件顺序稳定。

### ADV-BUG-05：停止静默吞掉关键异常

**位置**

- `packages/core/src/engine.ts`
- `packages/core/src/query-engine.ts`
- `packages/core/src/session.ts`

**修改方法**

1. `ENOENT` 可作为正常无数据处理；权限、磁盘、JSON、Hook 和 listener 异常必须写入 RuntimeLogger。
2. SessionWriter 连续失败或丢记录时，通过状态事件或 TUI warning 暴露。
3. Hook/listener 单个失败不得中断主循环，但必须记录来源与错误。
4. 日志不得包含 API key、完整敏感参数或隐私内容。

### ADV-BUG-06：替换 Permission request ID

**位置**

- `packages/core/src/permission/service.ts`

将 `Math.random()` ID 替换为 `crypto.randomUUID()`，并测试未知、重复和跨 session reply。

### ADV-BUG-07：标记大结果 preview 已截断

**位置**

- `packages/core/src/result-persistence.ts`

preview 末尾应包含稳定截断标记、原始字节数和持久化文件路径。不得把截断 JSON 修补成看似完整的对象。

### ADV-BUG-08：明确 ContextPolicy 初始化与自动修正

**位置**

- `packages/core/src/context/policy.ts`
- `packages/core/src/engine.ts`

1. 提供可 await 的初始化入口，首次 submit 前完成加载。
2. partial override 合并后若自动调整阈值，应记录 warning 并展示最终生效配置。
3. 非法完整配置继续拒绝。

## 三、实施后额外核查点

以下是当前代码中的具体陷阱。整体解决方式已写入 `Deepreef后续开发计划.md`，实施时必须逐项验证：

- WorkflowCoordinator 当前在各 phase 中消费并丢弃 Runtime 事件。
- `waiting_user` 会被 `canContinue()` 判定为不可继续，导致 `runWaitingUser()` 不可达并随后转成 `blocked`。
- Workflow interrupt 当前不会中断正在工作的 Worker/Supervisor Runtime。
- `AgentRuntime.interrupt()` 设置的 `cancelled` 可能在 submit 正常退出后被覆盖成 `completed`。
- `DualAgentRuntime` 构造参数中的 `workerClient/supervisorClient` 当前没有被 AgentRuntime 使用。
- 当前 Workflow Decision 仍通过字符串包含关系解析，容易误判。
- `subagent/run.ts` 通过 `parentEngine["client"]` 访问私有字段，应改为明确依赖注入。

## 四、审核验收要求

1. 修复必须包含能够在修复前失败、修复后通过的测试。
2. 不接受 `expect(true).toBe(true)`、硬编码通过状态或只验证类存在的测试。
3. `DONE.md` 只能记录生产入口真实使用并通过测试的功能。
4. 完成报告必须如实记录聚焦测试、typecheck、全量测试和 `git diff --check` 结果。
