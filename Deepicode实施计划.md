# Deepicode 实施计划

> 面向 Coding Agent 的逐步构建指南。从核心到外壳，每一步都可独立验证，已吸收最佳工程性能实践与防坑设计。

---

## 全局约定

### 目录结构约定

```text
deepicode/
├── packages/
│   ├── core/                    # 核层：推理引擎
│   │   ├── src/
│   │   │   ├── interface.ts     # CoreEngine / LoopEvent / AgentState 类型定义
│   │   │   ├── engine.ts        # ReasonixEngine 包装实现
│   │   │   ├── loop.ts          # CacheFirstLoop
│   │   │   ├── client.ts        # DeepSeekClient
│   │   │   ├── context.ts       # ContextManager (含增量旁路优化)
│   │   │   ├── session.ts       # SegmentedLog / AsyncSessionWriter
│   │   │   ├── repair.ts        # Tool-call Repair Pipeline
│   │   │   ├── tokenizer-pool.ts    # Tokenizer Worker Pool (含 Map 性能优化)
│   │   │   ├── tokenizer-worker.ts  # Worker 线程入口
│   │   │   ├── token-estimator.ts   # Token 用量预估 (CNY Native 计价)
│   │   │   ├── streaming-executor.ts # StreamingToolExecutor (含 AST 防假闭合)
│   │   │   ├── strategy/            # 智能推理强度调节
│   │   │   │   ├── task-classifier.ts
│   │   │   │   ├── chain-estimator.ts
│   │   │   │   ├── strategy-selector.ts
│   │   │   │   └── tier-config.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   ├── shell/                   # 壳层：TUI + 状态 + 事件
│   │   ├── src/
│   │   │   ├── state.ts         # AgentState 集中管理
│   │   │   ├── events.ts        # EventStream / Event Bus
│   │   │   ├── agents/          # 多 Agent 系统
│   │   │   │   ├── agent-config.ts
│   │   │   │   ├── build-agent.ts
│   │   │   │   └── plan-agent.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── tui/                     # TUI 渲染层
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── ChatView.tsx
│   │   │   │   ├── ToolCallView.tsx
│   │   │   │   ├── StrategyNotify.tsx
│   │   │   │   ├── TokenEstimate.tsx
│   │   │   │   └── DiffPreview.tsx
│   │   │   └── index.tsx
│   │   └── package.json
│   ├── tools/                   # 工具层
│   │   ├── src/
│   │   │   ├── registry.ts      # ToolRegistry
│   │   │   ├── hash-edit.ts     # Hash-Anchored Edit (异步流式计算优化)
│   │   │   ├── fuzzy-edit.ts    # 9-Pass Fuzzy Edit
│   │   │   ├── file-ops.ts      # 文件读写工具
│   │   │   ├── shell-exec.ts    # Shell 执行工具
│   │   │   ├── search.ts        # Grep/Glob 搜索工具
│   │   │   ├── lsp-client.ts    # LSP 客户端
│   │   │   ├── mcp-client.ts    # MCP 客户端
│   │   │   ├── web-fetch.ts     # Web 请求工具
│   │   │   ├── python-kernel.ts # Python IPython Kernel
│   │   │   ├── stale-read.ts    # Stale-read Validation (含 System-level bypass)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── security/                # 安全层
│   │   ├── src/
│   │   │   ├── permission.ts    # Deny-first 权限引擎
│   │   │   ├── hooks.ts         # beforeToolCall / afterToolCall
│   │   │   ├── git-snapshot.ts  # Git Shadow 变更快照
│   │   │   └── index.ts
│   │   └── package.json
│   └── cli/                     # CLI 入口
│       ├── src/
│       │   └── main.ts
│       └── package.json
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

### 代码参考来源索引

| 缩写 | 来源 | 仓库地址 | 关键路径 |
|------|------|---------|---------|
| **RNX** | Reasonix | /vol4/Agent/DeepSeek-Reasonix | 核心引擎：loop / client / context / repair |
| **OMP** | oh-my-pi | /vol4/Agent/oh-my-pi | `packages/agent/src/agent-loop.ts`（核心 loop）、`packages/agent/src/agent.ts`（Agent 类）、`packages/tui/`（Ink TUI）、`packages/tool/`（工具注册表） |
| **CC** | Claude Code | /vol4/Agent/best-claude-code | StreamingToolExecutor 思想、Deny-first 权限规则引擎、BashTool/FileEditTool 实现 |
| **OC** | OpenCode | /vol4/Agent/opencode | 9-Pass Fuzzy Edit、Stale-read validation、LSP touch、多 Agent 系统（Build/Plan） |

### 测试约定
- 所有测试使用 **Vitest**
- 单元测试与源文件同目录，命名为 `*.test.ts`
- 集成测试放在 `__tests__/` 目录
- 每个 Phase 完成后必须通过该阶段全部测试才能进入下一阶段
- 测试覆盖率目标：核心层 > 80%，工具层 > 70%，壳层 > 60%

---

## Phase 0：脚手架搭建

**目标**：让 Reasonix 的 loop 在 oh-my-pi 壳中跑起来，验证核壳分离可行性。
**预计耗时**：3-4 天

### Step 0.1：项目初始化
1. Fork oh-my-pi 仓库到本地。
2. 创建 `reasonix-engine` feature 分支。
3. 阅读并理解 oh-my-pi 核心文件结构。
4. 在项目根目录创建 monorepo 结构（如上方目录结构约定）。

### Step 0.2：定义核心接口
1. 创建 `packages/core/src/interface.ts`
2. 定义 `CoreEngine` 接口，包含：`submit(userInput, agentConfig)`, `getState()`, `interrupt()`, `registerTool(tool)`, `switchAgent(agentName)`, `resolveTierDecision(tier)`。
3. 定义 `LoopEvent` 联合类型，包含以下 role 值：
   - `assistant_delta`, `tool_call_delta`, `tool_start`, `tool`, `warning`, `error`, `status`, `done`, `strategy_notify`, `strategy_estimate_refined`。
   - **(补丁修复)** 增加缺失的 `'token_estimate'` 类型。
4. 定义 `AgentState`、`AgentTool`、`ToolResult`、`PermissionDecision` 接口。

### Step 0.3：实现 ReasonixEngine 最小包装器
1. 创建 `packages/core/src/engine.ts`。
2. 实现 `ReasonixEngine` 类，实现 `CoreEngine` 接口。
3. 将 Reasonix 内部事件格式转换为 `LoopEvent` 格式。

### Step 0.4：最小可运行集成
1. 修改 oh-my-pi 的 TUI 入口，将原有 Agent 替换为 `ReasonixEngine`。
2. 确保基本对话流程与工具调用流程可跑通。

**Phase 0 验收检查清单**：
- [ ] 项目可正常启动
- [ ] 一轮简单对话可完成
- [ ] 一次工具调用可完成
- [ ] CoreEngine 接口定义完整
- [ ] LoopEvent 类型覆盖所有 role (含 token_estimate)
- [ ] TypeScript 编译零错误

---

## Phase 1：核心引擎改造

**目标**：将 Reasonix 引擎改造成生产级性能，消除长会话卡顿与上下文冲突。
**预计耗时**：3 周

### Step 1.1：DeepSeekClient 实现
1. 创建 `packages/core/src/client.ts`。
2. **SSE 解析**：解析 `contentDelta`、`toolCallDelta`、`reasoningDelta`。
3. **R1 thought harvesting**：提取 `reasoning_content`，仅传递给 TUI 渲染（可折叠显示），**严禁写入正式历史消息（防止污染前缀缓存）**。
4. **Usage 提取与重试**：实现指数退避重试（429/500/502/503重试，400/401不重试）。提取 cache hit/miss tokens 供统计。

### Step 1.2：SegmentedLog 与 Session 持久化
1. 创建 `packages/core/src/session.ts`。
2. **(架构修正)** 实现 `SegmentedLog` 类（弃用 AppendOnlyLog 名称以消除语义冲突）：
   - 内部维护 `FoldedArchive` (已压缩归档区) 和 `ActiveWindow` (活跃滑动窗口)。
   - `compactInPlace(newMessages)` 方法：fold 时合并至归档区。
3. 实现 `AsyncSessionWriter` 类，批量异步写入 JSONL 文件防 IO 阻塞。
4. 实现 `ImmutablePrefix` 与 `VolatileScratch`。

### Step 1.3：ContextManager (阈值旁路与阵痛处理)
1. 创建 `packages/core/src/context.ts`。
2. **(性能补丁) 增量计数旁路**：
   - 当单次 append 的文本 $< 2000$ 字符时，**直接在主线程 O(1) 同步累加**。
   - 仅当 $\ge 2000$ 字符时，才通过 postMessage 卸载给 Worker 线程计算。
3. **Fold 决策逻辑**：65% 提前启动预测性 Fold，75% 建议，80% 强制。
4. **(架构修正) Cache Miss 阵痛管理**：当检测到本轮执行了 `compactInPlace`，抛出特定的 `status` 事件，通知 TokenEstimator 与 TUI 下一轮必将发生 Cache Miss，平抑用户延迟焦虑（显示 `"Context optimized, cold starting API..."`）。

### Step 1.4：Tokenizer Worker Pool (Map调度优化)
1. 创建 `packages/core/src/tokenizer-pool.ts` 和 worker 线程入口。
2. **(性能补丁) O(1) 任务回收**：放弃原实现中 `find` 查找。使用自增 `this.taskId` 配合 `Map<number, { resolve, reject }>` 结构精确追踪与回收。
3. 实现主线程 fallback。

### Step 1.5：StreamingToolExecutor (防假闭合)
1. 创建 `packages/core/src/streaming-executor.ts`。
2. **(架构修正) Eager Dispatch 安全化**：废弃朴素的大括号计数判断 JSON 闭合策略。引入轻量 AST Parser（或对流中局部 buffer 进行安全的 try-parse）。只有当 buffer 能够被完整解析为合法的参数树时，才触发执行。
3. **并发安全检查**：读操作（`isConcurrencySafe`）并行，写操作独占串行。

### Step 1.6：Tool-call Repair 流水线
1. 创建 `packages/core/src/repair.ts`。
2. 实现三阶段修复：**Scavenge（拾荒）**、**Truncation（截断修复）**、**Storm（暴力重构）**。
3. 保证修复成功率 > 95%，失败则作为 feedback 退回模型（绝不隐式重试产生二次 API 扣费）。

### Step 1.7：CacheFirstLoop 完整实现
1. 创建 `packages/core/src/loop.ts`，实现 7 阶段流程。
2. 事件 yield 策略（实时推送增量、状态、工具回调等）。

**Phase 1 验收检查清单**：
- [ ] DeepSeekClient SSE 解析与 reasoning 分离正确
- [ ] SegmentedLog 与异步批量 JSONL 写入正常
- [ ] 阈值旁路机制下，短对话 TUI 零延迟
- [ ] Tokenizer Map 回收无泄漏
- [ ] AST Parser 完美防御代码引起的 JSON 假闭合
- [ ] Cache Miss 阵痛管理事件正确派发
- [ ] 核心层覆盖率 > 80%

---

## Phase 2：智能推理强度调节系统

**目标**：零额外成本智能调度，修复长链路任务估算短板。
**预计耗时**：1 周

### Step 2.1：Tier 配置定义 (CNY Native 计价)
1. 创建 `packages/core/src/strategy/tier-config.ts`。
2. **(补丁修复)** 废弃 `0.14` USD 汇率硬编码。直接使用 DeepSeek CNY 定价（Chat: 0.5/2/8，Reasoner: 1/4/16）并在界面中直接呈现人民币金额。
3. 定义四个档位 `chat-fast`、`chat-full`、`reasoner-budget`、`reasoner` 及其 max_tokens 与 thinking 梯级。

### Step 2.2：TaskClassifier 实现
1. 创建 `packages/core/src/strategy/task-classifier.ts`。
2. 加载用户规则（JSON），优先执行。
3. 内置纯规则打分（累加制），长度信号、文件引用信号（>3 提分）、复杂度关键词汇匹配，输出 0-10 分。

### Step 2.3：ChainEstimator (滑动窗口与 Agentic 补偿)
1. 创建 `packages/core/src/strategy/chain-estimator.ts`。
2. **(补丁修复) 滑动 TPS**：废弃死板公式，为 Chat 和 Reasoner 维护最近 10 次的动态真实 TPS 均值。
3. **(补丁修复) Agentic Chain 补偿**：对于 `outputTokens` 估算，如果识别为复杂度 score > 6，强制叠加 2~3 倍的“多轮工具调用链系数”，修复原版无法估算多步执行总消耗的致命短板。
4. 异步扫描（Phase 2）限定 50 文件 / 500ms 超时，防止 Monorepo 卡死。

### Step 2.4：StrategySelector 实现
1. 创建 `packages/core/src/strategy/strategy-selector.ts`，编排分类与预估。
2. 构建 `StrategyNotifyEvent`，抛出 3 秒倒计时。

### Step 2.5：TUI StrategyNotify 组件
1. 实现倒计时逻辑、键盘控制（左右切换，Enter 确认）。
2. 渲染 4 档对比 CNY 成本卡片。

**Phase 2 验收检查清单**：
- [ ] 复杂任务预估金额准确体现了 Agentic 多轮倍率。
- [ ] TPS 滑动预估随网络波动自动校准。
- [ ] TUI 显示 CNY 原生价格。

---

## Phase 3：壳层增强

**目标**：实现集中式状态管理、双模式事件系统、多 Agent 系统。
**预计耗时**：1.5 周

### Step 3.1：集中式状态管理
1. 创建 `packages/shell/src/state.ts`。
2. 声明式更新：`processEvents` 必须返回全新的 state 对象。

### Step 3.2：双模式事件系统
1. 创建 `packages/shell/src/events.ts`。
2. 实现推模式 `EventStream` 与 Pub/Sub 模式 `EventBus`，桥接拉模式 Generator。

### Step 3.3：多 Agent 系统
1. 创建 `packages/shell/src/agents/agent-config.ts`。
2. 实现从 JSON/Markdown 加载 Build Agent 和 Plan Agent。
3. 实现 Tab 键切换 Agent。Plan-to-Build 切换时将分析结论注入 `system-reminder`。

---

## Phase 4：工具层实现 (核心并发优化)

**目标**：彻底解决大文件编辑阻塞主线程问题，实现可靠回退机制。
**预计耗时**：2 周

### Step 4.1：ToolRegistry 实现
1. 创建 `packages/tools/src/registry.ts`，管理注册、Agent 过滤与 API Spec 生成。

### Step 4.2：流式 Hash-Anchored Edit
1. 创建 `packages/tools/src/hash-edit.ts`。
2. **(架构重构) 异步流式计算**：彻底废除 `fs.readFileSync`。使用 `fs.createReadStream` 结合 Node.js 的 `Transform Stream`，**异步逐块（Chunk）处理换行符分割和哈希计算**。
3. 执行时如果 any oldHash 匹配失败，直接抛错阻断（进入 Fallback）。
4. 统一使用 UTF-8，hash 前标准化处理首尾符。

### Step 4.3：9-Pass Fuzzy Edit (Fallback)
1. 创建 `packages/tools/src/fuzzy-edit.ts`，依次执行：
   - Pass 1: simpleMatch (精确)
   - Pass 2: lineTrimmedMatch (去尾白)
   - Pass 3: blockAnchorMatch (锚点模糊)
   - Pass 4: whitespaceNormalizedMatch (压缩连续空白)
   - Pass 5: indentationFlexibleMatch (忽略缩进)
   - Pass 6: escapeNormalizedMatch (统一转义)
   - Pass 7: trimmedBoundaryMatch (修剪边界)
   - Pass 8: contextAwareMatch (上下文定位)
   - Pass 9: multiOccurrenceMatch (多匹配选优)

### Step 4.4：Stale-read Validation (系统级免检提权)
1. 创建 `packages/tools/src/stale-read.ts`。
2. **(架构修正) 死锁提权**：当检测到 Stale-read 并触发自动重读补救动作时，为该 read_file 操作隐式注入 **System-level Bypass 标志**。确保安全层遇到此标志时静默放行，避免产生无意义的 `Ask` 弹窗导致操作链断裂。

### Step 4.5：基础工具集实现
1. 实现 `file-ops.ts` (read_file, write_file, ls)
2. 实现 `shell-exec.ts` (bash - 带 10000 字符截断与超时控制)
3. 实现 `search.ts` (grep, glob)
4. 实现 `web-fetch.ts`

**Phase 4 验收检查清单**：
- [ ] 面对 10 万行的日志或 JSON，Hash 计算时 TUI 刷新不卡顿（帧率 > 30fps）。
- [ ] 9-Pass 模糊降级组合成功率 > 99%。
- [ ] Stale-read 自动补偿重读不会被权限弹窗阻断。

---

## Phase 5：安全层实现

**目标**：实现 Deny-first 权限引擎、Hooks 系统、Git Snapshot。
**预计耗时**：1.5 周

### Step 5.1：Deny-first 权限引擎
1. 创建 `packages/security/src/permission.ts`。
2. 三级判定：Deny规则优先 → Allow规则 → 默认 Ask。
3. 多级权限模式：`default`, `acceptEdits`, `dontAsk`。

### Step 5.2：Hooks 系统
1. 创建 `packages/security/src/hooks.ts`，实现 `beforeToolCall` 和 `afterToolCall` 拦截。

### Step 5.3：Git Snapshot 与单文件 Diff 优化
1. 创建 `packages/security/src/git-snapshot.ts`。
2. **(性能补丁) 稀疏/单文件快照追踪**：废弃全仓库拷贝，仅在本地工作区生成一个隐蔽的 `.deepicode_patches` 目录，仅备份**当次被修改单文件**的旧版本。支持瞬时 revert()。
3. 实现 DiffPreview 终端差异展示组件。

---

## Phase 6：高级功能生态接入

**目标**：集成扩展工具流。
**预计耗时**：2 周

### Step 6.1：TTSR 规则系统
1. 实现流式幻觉纠偏，当正则命中流输出时，限制 Max Activations 后强行注入矫正 Prompt 阻断模型。

### Step 6.2：LSP 集成
1. 创建 `packages/tools/src/lsp-client.ts`。
2. 实现编辑后自动触达：修改保存后 3 秒内自动获取 `vscode-languageclient` 的 diagnostics，有类型错误当轮次直接反推给 LLM。

### Step 6.3 & 6.4：MCP 与 Python Kernel
1. 集成 Model Context Protocol，支持 `.config/deepicode/mcp.json` 的外挂服务。
2. 集成 IPython Kernel 维系会话变量。

### Step 6.5：Universal Config Discovery
1. 自动发现加载 `.cursor/rules`, `.claude/`, `.editorconfig`, `tsconfig.json` 并注入系统前缀。

---

## Phase 7：集成测试与调优

**预计耗时**：2 周

### Step 7.1：端到端测试
1. 编写 20 个典型 E2E 场景：
   - 长会话 (50+轮)
   - 大文件读写与替换并发
   - Git 撤销回滚
   - 权限高危拦截 (`rm -rf /`)
   - LSP 自动除错验证。

### Step 7.2：性能基准与计费校准测试
1. 执行基准测算：对比原 Reasonix 响应时间降低。
2. **计费对齐验证**：抽样 10 轮含有多路工具调用的对话，核对 DeepSeek 控制台账单与终端 CNY 预估开销，优化系数使总误差 < 20%。

### Step 7.3 & 7.4 & 7.5：稳定性修复与发版
1. 长期会话防泄漏压测。
2. 撰写 README、配置指南、发布包。

---

## 附录 A：模块依赖关系矩阵

| 模块 | 依赖模块 | 被依赖模块 |
|------|---------|-----------|
| interface.ts | 无 | engine, state, events, registry, permission |
| client.ts | 无 | loop |
| session.ts | 无 | loop, context |
| context.ts | session, tokenizer-pool | loop |
| tokenizer-pool.ts | 无 | context, token-estimator |
| tokenizer-worker.ts | 无 | tokenizer-pool |
| streaming-executor.ts | interface | loop |
| repair.ts | 无 | loop |
| loop.ts | client, session, context, streaming-executor, repair, strategy-selector | engine |
| token-estimator.ts | tokenizer-pool | loop |
| task-classifier.ts | tier-config | strategy-selector |
| chain-estimator.ts | tier-config | strategy-selector |
| strategy-selector.ts | task-classifier, chain-estimator | loop |
| engine.ts | loop, interface | cli |
| state.ts | interface | tui, events |
| events.ts | interface | tui, agents |
| agents/* | interface, events | shell |
| registry.ts | interface | streaming-executor, tools/* |
| hash-edit.ts | interface | registry |
| fuzzy-edit.ts | interface | registry |
| stale-read.ts | interface | hash-edit, fuzzy-edit |
| file-ops.ts | interface | registry |
| shell-exec.ts | interface | registry |
| search.ts | interface | registry |
| permission.ts | interface | hooks |
| hooks.ts | permission, git-snapshot | streaming-executor |
| git-snapshot.ts | 无 | hooks |
| lsp-client.ts | interface | registry |
| mcp-client.ts | interface | registry |
| python-kernel.ts | interface | registry |

---

## 附录 B：测试用例清单

### 核心层测试（Phase 1）

| 测试 ID | 测试描述 | 模块 |
|---------|---------|------|
| T-CLI-001 | SSE 解析：正常流 | client.ts |
| T-CLI-002 | SSE 解析：最后一个 chunk 不完整 | client.ts |
| T-CLI-003 | 重试逻辑：429 → 重试 | client.ts |
| T-CLI-004 | 重试逻辑：401 → 不重试 | client.ts |
| T-CLI-005 | Usage 统计累加 | client.ts |
| T-CLI-006 | reasoning_content 提取与拦截 | client.ts |
| T-SES-001 | append → toMessages 正确 | session.ts |
| T-SES-002 | compactInPlace 替换正确 | session.ts |
| T-SES-003 | AsyncSessionWriter 批量写入 | session.ts |
| T-SES-004 | JSONL 恢复 | session.ts |
| T-CTX-001 | buildMessages 组装正确 | context.ts |
| T-CTX-002 | 阈值旁路：<2000 字符 O(1) 同步累加 | context.ts |
| T-CTX-003 | 缓存阵痛管理事件抛出验证 | context.ts |
| T-CTX-004 | shouldFold 阈值判断 | context.ts |
| T-TOK-001 | Map 回收验证 (O(1)) | tokenizer-pool.ts |
| T-TOK-002 | Pool 轮询分配 | tokenizer-pool.ts |
| T-TOK-003 | 主线程 fallback | tokenizer-pool.ts |
| T-STE-001 | maybeDispatch 完整 AST 解析通过 | streaming-executor.ts |
| T-STE-002 | maybeDispatch 假闭合代码片段防御 | streaming-executor.ts |
| T-STE-003 | 并发安全：读并行 | streaming-executor.ts |
| T-STE-004 | 并发安全：写串行 | streaming-executor.ts |
| T-STE-005 | collectResults 合并 eager/非 eager | streaming-executor.ts |
| T-REP-001 | Scavenge 提取 tool_call | repair.ts |
| T-REP-002 | Truncation 修复截断 | repair.ts |
| T-REP-003 | Storm 修复 JSON 错误 | repair.ts |
| T-REP-004 | 三阶段失败 → feedback | repair.ts |
| T-LOOP-001 | 完整一轮对话 | loop.ts |
| T-LOOP-002 | 多轮对话（含 fold） | loop.ts |
| T-LOOP-003 | 中断处理 | loop.ts |
| T-LOOP-004 | 错误恢复 | loop.ts |

### 策略系统测试（Phase 2）

| 测试 ID | 测试描述 | 模块 |
|---------|---------|------|
| T-CLS-001 | "what is useState" → chat-fast | task-classifier.ts |
| T-CLS-002 | "fix the login bug" → chat-full | task-classifier.ts |
| T-CLS-003 | "refactor auth module" → reasoner-budget+ | task-classifier.ts |
| T-CLS-004 | "重构整个支付系统" → reasoner | task-classifier.ts |
| T-CLS-005 | "hi" → chat-fast | task-classifier.ts |
| T-CLS-006 | 3+ 文件引用 → score 提升 | task-classifier.ts |
| T-CLS-007 | 纯提问 → score 降低 | task-classifier.ts |
| T-CLS-008 | 用户规则优先 | task-classifier.ts |
| T-CLS-009 | 用户规则格式错误 → 静默降级 | task-classifier.ts |
| T-CEST-001 | Phase 1 四档 CNY 估算正确 | chain-estimator.ts |
| T-CEST-002 | Phase 2 扫描 < 1s | chain-estimator.ts |
| T-CEST-003 | Phase 2 超时 → null | chain-estimator.ts |
| T-CEST-004 | 复杂任务链路乘数补偿验证 | chain-estimator.ts |
| T-SEL-001 | 3s 超时自动执行 | strategy-selector.ts |
| T-SEL-002 | resolveTierDecision 提前 resolve | strategy-selector.ts |
| T-SEL-003 | 完整流程 E2E | strategy-selector.ts |

### 壳层测试（Phase 3）

| 测试 ID | 测试描述 | 模块 |
|---------|---------|------|
| T-STATE-001 | processEvents 各 role 处理 | state.ts |
| T-STATE-002 | 状态更新不可变 | state.ts |
| T-EVT-001 | EventStream push 到所有监听器 | events.ts |
| T-EVT-002 | EventBus emit 到正确频道 | events.ts |
| T-AGT-001 | Agent 配置 JSON 加载 | agent-config.ts |
| T-AGT-002 | Build Agent 完整工具 | build-agent.ts |
| T-AGT-003 | Plan Agent 只读工具 | plan-agent.ts |
| T-AGT-004 | switchAgent 不修改历史 | agents/ |
| T-AGT-005 | Plan-to-Build 上下文传递 | agents/ |

### 工具层测试（Phase 4）

| 测试 ID | 测试描述 | 模块 |
|---------|---------|------|
| T-REG-001 | register/unregister/get/list | registry.ts |
| T-REG-002 | filterByAgent | registry.ts |
| T-REG-003 | filterByDenyRules | registry.ts |
| T-HE-001 | hashLine 异步流式计算一致性 | hash-edit.ts |
| T-HE-002 | 单行编辑 | hash-edit.ts |
| T-HE-003 | 多行编辑 | hash-edit.ts |
| T-HE-004 | oldHash 不匹配 → 拒绝 | hash-edit.ts |
| T-FE-001 | Pass 1 精确匹配 | fuzzy-edit.ts |
| T-FE-002 | Pass 2 行尾空白 | fuzzy-edit.ts |
| T-FE-003 | Pass 5 缩进差异 | fuzzy-edit.ts |
| T-FE-004 | 所有 pass 失败 → 错误 | fuzzy-edit.ts |
| T-FE-005 | Hash + Fallback 组合 > 99% | fuzzy-edit.ts |
| T-SR-001 | ReadTracker 记录检测 | stale-read.ts |
| T-SR-002 | mtime 变化 → 警告并提权静默绕过 | stale-read.ts |

### 安全层测试（Phase 5）

| 测试 ID | 测试描述 | 模块 |
|---------|---------|------|
| T-PERM-001 | deny 优先于 allow | permission.ts |
| T-PERM-002 | rm -rf / → deny | permission.ts |
| T-PERM-003 | 读操作 → allow | permission.ts |
| T-PERM-004 | 写操作 → ask | permission.ts |
| T-PERM-005 | acceptEdits 模式 | permission.ts |
| T-HOOK-001 | beforeToolCall 阻止 | hooks.ts |
| T-HOOK-002 | afterToolCall 修改结果 | hooks.ts |
| T-GIT-001 | track 生成单文件/稀疏快照 | git-snapshot.ts |
| T-GIT-002 | patch 返回变更 | git-snapshot.ts |
| T-GIT-003 | diffFull 返回差异 | git-snapshot.ts |
| T-GIT-004 | revert 恢复文件 | git-snapshot.ts |

---

## 附录 C：关键决策记录

| 决策点 | 选择 | 理由 | 影响范围 |
|--------|------|------|---------|
| 语言 | TypeScript | 用户已决定，oh-my-pi 和 Reasonix 都是 TS | 全局 |
| 壳 | oh-my-pi fork | 低耦合、工具丰富、27K LOC 可控 | shell/tui/tools |
| 核 | Reasonix 保留 | Cache-first、repair、cost control 是核心竞争力 | core/* |
| 首要增强 | Streaming Tool Executor | 真正的速度提升，Claude Code 核心优点 | streaming-executor.ts |
| 计价体系 | CNY Native | DeepSeek 结算以 CNY 计价，减少换算认知负担 | tier-config, token-estimator |
| 编辑工具 | Hash 流式异步化 | 解决单线程下读取与切分 5MB 文件导致 TUI 卡死问题 | hash-edit.ts |
| 权限绕过 | 系统级提权标志 | 解决 Stale-read 重试导致的 Ask 死锁 | hooks.ts, stale-read.ts |
| 状态 | 集中式 AgentState | Pi 的设计，适合未来多前端 | state.ts |
| 分类器 | 纯规则（无 ML） | 零额外成本，行为可预期 | task-classifier.ts |
| Token 计数 | 增量旁路 + Map池 | <2k 同步 O(1)，防 IPC 拖慢，杜绝 O(n) Array 搜索 | context.ts, tokenizer-pool.ts |
| Session 持久化 | JSONL + 异步批量 | 崩溃可恢复，IO 不阻塞 | session.ts |
| 不引入 Vercel SDK | 是 | 与 DeepSeek cache 优化冲突 | 全局 |

---

## 附录 D：风险与应对速查表

| 风险 | 触发条件 | 应对策略 | 负责模块 |
|------|---------|---------|---------|
| DeepSeek API 字段变化 | API 升级 | 封装在 DeepSeekClient 内部，单点修改 | client.ts |
| oh-my-pi 代码耦合度高 | 集成困难 | 保留 CoreEngine 接口层，逐步替换 | engine.ts |
| Worker 线程兼容性 | 运行时不支持 | 主线程 fallback，自动降级 | tokenizer-pool.ts |
| AST 假闭合防御失灵 | 畸形代码输出 | 结合正则底线判定，失败退回 Scavenge | streaming-executor.ts |
| Hash-anchored 编辑失败率高 | 哈希不匹配 | 9-pass fallback 兜底 | hash-edit.ts → fuzzy-edit.ts |
| TTSR 规则误触发 | 规则过于宽泛 | 规则可配置，默认休眠，maxActivations 限制 | TTSR |
| 多 Agent 切换上下文丢失 | 切换逻辑错误 | 切换只修改配置不修改消息历史 | agents/ |
| glob 扫描超时 | 大型 monorepo | 限 50 文件 + 500ms 超时 | chain-estimator.ts |
| 规则打分边界不稳定 | score=5 附近 | reasoner-budget 兜底 | task-classifier.ts |
| TPS 基准波动 | API 负载变化 | 引入**动态滑动时间窗口**计算替代死板常量 | chain-estimator.ts |
| 用户频繁手动覆盖 | 分类器不准 | 记录覆盖频率，迭代规则权重 | task-classifier.ts |
| JSONL 写入崩溃 | 进程中断 | 原子写入（临时文件 + rename） | session.ts |
| Fold 期间新消息 | 并发冲突 | 队列确保 fold 完成后处理新消息 | context.ts |
| SSE 最后 chunk 不完整 | 网络中断 | 缓冲区机制，等待完整 chunk | client.ts |
```