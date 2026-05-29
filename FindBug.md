# FindBug.md: Agent 与 TypeScript 混合架构下的代码审查指南

本文档总结了在开发深度集成大语言模型（LLM）的 Agent 系统时，暴露出的典型代码审查盲区、特定于 Agent 的 Bug 模式、TypeScript 工程最佳实践，以及**针对本项目的具体已知问题清单**。

---

## 一、认知盲区与审查失误反思

在复杂 Agent 系统的代码审查中，审查者极易陷入以下认知陷阱：

### 1. 时序流盲区 (Temporal Flow Blindness)

- **案例**：SSE 流式解析中，`client.ts:233-234` 在收到 `finish_reason: "tool_calls"` 时发射第一次 `done` 事件，随后 `client.ts:164-166` 在收到 `[DONE]` 标记时发射第二次 `done`（`finishReason: null`）。在 `engine.ts:160-193` 的 `done` case 中，第一个 `done` 走工具执行分支（`break`），第二个 `done`（`finishReason: null` → `reason: "stop"` → `isToolUse: false`）进入 else 分支直接 `return`，导致 while 循环被意外终止——工具结果已写入上下文，但模型永远不会收到并处理它们。
- **反思**：在传统请求-响应模型中，状态转移是原子的。Agent 流式交互中数据到达是随时间分布的。审查流式代码（`AsyncGenerator`）不能仅看局部语法是否闭合，必须**完整模拟上游真实数据包的到达时序**——包括 `[DONE]` 标记触发的事件。测试 mock 如果只模拟了部分事件序列（当前 mock 只发射一个 `done`），就会漏掉这个 bug。
- **修复方向**：`client.ts` 在已发射过带 `finish_reason` 的 `done` 后，遇到 `[DONE]` 应直接 `return` 不再二次发射。

### 2. 安全隧道效应 (Security Cognitive Tunneling)

- **案例**：审查 `bash` 工具时，过度聚焦于防范 RCE（危险命令 denylist：`rm -rf /`、`sudo`、`mkfs` 等）和系统资源泄漏（僵尸进程通过 `detached` + `process.kill(-pid)` 处理），却忽略了 `shell-exec.ts:48` 的 `cwd` 参数未经过 `resolve(ctx.cwd, args.cwd)` 解析。而同项目的 `read_file`（`file-ops.ts:47`）和 `edit`（`edit.ts:52`）都正确使用了 `resolve(ctx.cwd, args.path)`。
- **反思**：面对包含高危操作的代码时，高级别的安全敏感度容易遮蔽常规的业务边界约束。必须建立分层审查清单：**先看基础数据流转（参数校验、路径解析），再看系统安全边界**。

### 3. "能力缺失"误判为"待办事项" (Feature Gap vs. Fatal Bug)

- **案例**：工具库中仅有 `read_file`、`edit`、`bash`，没有 `write_file`（创建新文件）、`list_dir`（目录列表）、`grep`（内容搜索）。`edit` 只能替换已有内容，无法从零创建文件。
- **反思**：在传统软件开发中，少写一个接口是"功能未完成"。但在 Agent 开发中，缺失关键行动原语（Action Primitive）意味着 Agent 的**感知-思考-执行闭环被硬生生切断**——没有 `write_file`，Agent 看到需求后无法产出新文件；没有 `grep`，Agent 无法高效搜索代码库只能盲猜文件位置。这在宏观上是**最高优先级的 Fatal Bug**。

### 4. 并发与随机性的侥幸心理

- **案例**：`hash-edit.ts:25` 使用 `` `${filePath}.deepicode_tmp_${Date.now()}` `` 作为临时文件后缀。Agent 系统通常支持并行工具调用（Parallel Tool Use），同毫秒内对同一文件的并发修改会导致临时文件相互覆盖碰撞。
- **反思**：Agent 系统中工具执行不是严格串行的（`shared` 类型工具并发执行）。应在文件命名、状态共享、ID 生成等场景中，无脑且坚决地使用 `crypto.randomUUID()` 替代任何时间戳或递增数字作为唯一标识。

### 5. 状态快照的沉默谎言

- **案例**：`engine.ts:62-70` 的 `getState()` 返回 `AgentState`，其中 `isStreaming: false` 和 `streamingMessage: ""` 是**硬编码字面量**，从不随实际 streaming 状态更新。任何依赖此快照的消费者（TUI 渲染、事件日志、插件系统）都会得到完全错误的流状态。
- **反思**：`getState()` 是 CoreEngine 接口的核心方法，设计文档将其定位为"状态快照，支持回溯"。如果快照数据与实际状态脱节，所有基于快照的设计假设都是空的。在实现状态管理之前，必须确保生产者（引擎）正确推送状态变更到快照。

---

## 二、Agent 开发专属的 Bug 模式与防范

Agent 软件本质上在处理极度不可靠、充满随机性的输入（LLM 文本流），这要求外围工程代码必须具备极高的容错与防御能力。

### 1. 结构化解析陷阱

- **模式**：LLM 在自由文本中输出的 JSON 经常带有 Markdown 代码块包裹（````json ... ````），或尾部缺少括号（假闭合），转义字符处理错误。
- **当前代码状态**：`streaming-executor.ts:137-142` 的 `parseToolArguments()` 直接使用 `JSON.parse(raw)`，无任何容错处理。当前「稳定优先」策略（等 tool call 完整结束后再解析）规避了流式假闭合问题——因为 DeepSeek API 通过 `tool_calls[].function.arguments` 字段传递的是格式完整的 JSON 字符串。但一旦切换到 eager dispatch（边流式接收边解析执行），这块必须重构。
- **防范**：永远不要信任直接的 `JSON.parse`。在流式工具执行场景中，应引入增量式 JSON 验证器（状态机驱动的部分解析，而非反复 try-parse）。在非流式场景中，外层包裹基于 Zod 或 Valibot 的严格运行时类型校验（Runtime Type Validation）。同时，`repair.ts` 的 Scavenge 阶段应能剥离 Markdown 包裹和不可见字符。

### 2. 文本模糊匹配与转义地狱 (Regex Escaping Hell)

- **模式**：LLM 使用 `edit` 工具替换大段代码时，模型通常难以精确掌握空格、缩进和换行符。`fuzzy-edit.ts:37-42` 试图通过正则做灵活空白匹配：先用 `escapeRegExp()` 转义 needle 中的正则特殊字符，再把转义后字符串中的空白替换为 `\s+`。这导致两个问题：
  1. 转义字符反斜杠和正则元字符产生非预期的交叉干扰（如 needle 含字面量 `\n` 时，escaping 后变 `\\n`，其中的空格替换行为不可预测）。
  2. 如果 needle 本身包含 `\s`、`\d` 等字符序列（在代码中很常见），escaping 后的结果完全错乱。
- **当前代码状态**：`fuzzy-edit.ts` 实现了 4 个 pass（exact、trimmed_full、trimmed_lines、flexible_whitespace），缺失 5 个 pass（blockAnchor、escapeNormalized、trimmedBoundary、contextAware、multiOccurrence）。当前 fuzzy 覆盖范围有限，复杂的代码匹配大概率失败。
- **防范**：避免使用正则做复杂的跨行模糊代码替换。在增量的 pass 中，应优先使用基于行的标准化比较（统一缩进、统一行尾空白），再到基于编辑距离的 Diff 算法（Myer's Diff / DiffMatchPatch）进行字符级匹配。正则仅用于最宽松的最后一层兜底。

### 3. 上下文状态污染 (Context Pollution)

- **模式**：工具报错时未将错误格式标准化，或将过长的堆栈无脑推入对话历史，导致模型在后续轮次中复读错误或耗尽 Token 窗口。
- **当前代码状态**：
  - `streaming-executor.ts:121-127` 的 `normalizeToolResult()` 对工具结果做了标准化。
  - `client.ts:77-79` 给 `is_error` 的工具结果添加 `[Error]` 前缀，让模型能感知失败。
  - `shell-exec.ts:134-137` 对 stdout/stderr 做了截断（`maxChars` 默认 200k，可配置）。
  - `context/` 目录下的 `AppendOnlyLog`、`ImmutablePrefix`、`VolatileScratch` 都通过 `cloneChatMessage` 做防御性拷贝，隔离内部状态。
- **防范**：工具结果必须经过 `normalizeToolResult()` 标准化。长输出必须截断。错误信息应以结构化格式（非原始堆栈）传递给模型。不可变数据结构（防御性深拷贝）用于隔离三个上下文区域（prefix / log / scratch），防止交叉污染。

### 4. 安全策略不一致 (Security Policy Fragmentation)

- **模式**：`file-ops.ts:6-15` 和 `edit.ts:8-16` 各自定义了一份 `SENSITIVE_FILE_PATTERNS` 数组。`file-ops.ts` 的保护列表比 `edit.ts` 多了 `known_hosts`（第 14 行）。这意味着用 `edit` 工具可以修改 SSH known_hosts 文件，但用 `read_file` 却不能读取它——安全策略在两个工具之间不一致。
- **防范**：安全规则必须集中定义，单一来源（Single Source of Truth）。所有文件操作工具（`read_file`、`edit`、`write_file`）应共享同一份敏感路径配置。新增工具时不能独立拷贝安全规则。

---

## 三、当前代码库已知问题清单

以下是针对 `/vol4/Agent/deepicode` 当前代码（commit `e78f26a` 附近）的系统性审查发现的全部问题。按严重程度排列。

### P0 — 阻断性 Bug

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| B1 | SSE `done` 事件重复发射导致工具调用轮提前终止 | `client.ts:165` + `engine.ts:189` | 多轮工具调用循环实际断掉 |
| B2 | 缺少 `write_file` 工具 | `tools/src/index.ts` | Agent 无法创建新文件 |

### P1 — 功能缺陷

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| B3 | `bash` 工具 `cwd` 未 `resolve()` | `shell-exec.ts:48` | 相对路径行为与其他工具不一致 |
| C1 | 缺少 `list_dir` / `grep` 工具 | — | Agent 无法高效导航代码库 |
| C2 | Session 不可恢复 | `session.ts` — 只有 `AsyncSessionWriter` | 崩溃/重启后上下文丢失 |
| C3 | Token 估算完全缺失 | 无 tokenizer pool / fold 决策 | 长会话超出上下文窗口导致截断 |

### P2 — 边界 Bug 与实现不完整

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| B4 | 临时文件 `Date.now()` 并发碰撞 | `hash-edit.ts:25` | 同毫秒同文件并发编辑冲突 |
| B5 | fuzzy regex `escapeRegExp` + `\s+` 替换交叉干扰 | `fuzzy-edit.ts:37-42` | 特定 needle 模式匹配意外 |
| C4 | 9-Pass Fuzzy Edit 只实现了 4 pass | `fuzzy-edit.ts` — 缺 5 个 pass | 模糊匹配覆盖率不足 |
| C5 | 事件体系未分层（无 `tool_progress`） | `engine.ts` — 所有事件混在 LoopEvent 中 | 协议/展示事件耦合 |

### P3 — 代码质量

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| D1 | `SENSITIVE_FILE_PATTERNS` 重复定义 | `file-ops.ts:6-15` + `edit.ts:8-16` | 维护分裂，edit 少保护 `known_hosts` |
| D2 | `getState()` 返回假状态 | `engine.ts:62-70` — `isStreaming: false` 硬编码 | 状态快照不可信 |
| D3 | `buildPiModel` + `vendor/pi.d.ts` 死代码 | `config.ts:56-69` + `vendor/pi.d.ts`（120行） | 无用代码占用维护心智 |
| C6 | SSE 分片边界无测试 | — | 无法保证任意 chunk 切分下的解析正确性 |
| C7 | E2E 测试全部 skip | `__tests__/integration.test.ts` | 无自动化回归保护 |

---

## 四、混合 TypeScript 架构审查 Checklist

在下一次代码审查或功能开发前，请严格对照以下清单。每一条都来自本项目实际出过的 Bug。

### 异步与时序

- [ ] **流式生成器收尾**：所有 `async *` 是否有明确的启动、中断（`AbortSignal`）和终结收尾逻辑？是否有未捕获的 `unhandledRejection`？
- [ ] **事件去重**：SSE / WebSocket 等流式事件源是否会因协议标记（如 `[DONE]`）和业务字段（如 `finish_reason`）产生重复的终结事件？
- [ ] **测试 mock 保真度**：流式处理的测试 mock 是否还原了真实上游的**完整事件序列**（包括协议标记帧）？Mock 只模拟部分事件是审查漏报的首要原因。

### 路径与安全

- [ ] **路径解析一致性**：所有接受大模型参数的文件系统工具，其路径参数是否都经过了 `resolve(ctx.cwd, args.xxx)` 处理？逐个检查，不要假设同类工具行为一致。
- [ ] **安全规则集中化**：敏感文件保护、危险命令拦截等安全规则是否定义为单一来源（一个模块），被所有工具引用？是否存在拷贝粘贴的独立副本？
- [ ] **参数前置校验**：每个工具的 `execute()` 入口，是否在业务逻辑之前校验了必填字段的类型和合法性（string 非空、number 合法范围）？

### Agent 闭环完整性

- [ ] **行动原语完整性**：Agent 是否能**感知**（read_file、list_dir、grep）→ **执行**（edit、write_file、bash）→ **验证**（bash 跑测试/构建）？缺了哪个环节就是断链。
- [ ] **错误反馈闭环**：工具执行失败后，错误信息是否以模型能理解的结构化格式写回上下文？`isError: true` 的结果是否加了 `[Error]` 前缀？
- [ ] **Stale-read 防护**：Agent 在连续多轮中读写同一文件时，是否有 mtime/size 追踪防止读到过期内容后基于旧内容编辑？

### 并发安全

- [ ] **唯一 ID 生成**：临时文件命名、任务追踪 ID、会话 ID 等，是否使用 `crypto.randomUUID()` 而非时间戳/递增数字？
- [ ] **工具 concurrency 分类**：读操作是否标记为 `shared`（可并行）？写操作是否标记为 `exclusive`（必须串行）？
- [ ] **共享状态不可变**：上下文管理器的各个区域在对外返回时是否做了防御性拷贝？外部获取引用后能否意外污染内部状态？

### 状态管理

- [ ] **状态快照可信**：`getState()` 返回的字段是否反映了运行时真实状态？有没有硬编码的默认值从不更新？
- [ ] **Session 可恢复**：会话持久化是否有完整的写+读路径？崩溃后能否恢复到断点继续？

### 上下文与 Token 预算

- [ ] **Token 计数**：是否有 token 估算或精确计数机制？长会话是否会静默超出模型上下文窗口？
- [ ] **Fold/Compact 保护**：上下文超出阈值时是否有压缩/截断策略？压缩后是否正确处理了 prefix-cache 失效？
- [ ] **前缀稳定性**：系统提示词和工具定义的变更是否会破坏 prefix-cache？是否通过 cacheKey 指纹检测？

### 测试覆盖

- [ ] **SSE 分片测试**：流式解析器是否通过了任意 chunk 切分的测试（1 字节/半个 UTF-8 字符/半个 JSON 字段）？
- [ ] **E2E 自动化**：是否有不依赖真实 API 的端到端测试覆盖核心工作流？
- [ ] **工具错误路径**：每个工具的错误分支（参数非法、文件不存在、命令被拦截）是否有测试？

---

## 五、代码审查的元原则

总结本项目的审查经验，形成可复用的方法论：

1. **不要信任测试通过** — 测试 mock 可能简化了真实数据流。B1 在 20 pass / 0 fail 的情况下仍然存在。
2. **逐文件对比工具实现** — 同类工具（`read_file` / `edit` / `bash`）默认行为应一致。不一致就是 bug。
3. **死代码不是无害的** — `vendor/pi.d.ts` 和 `buildPiModel` 代表过时的架构假设，可能会误导新贡献者。
4. **状态快照必须可验证** — `getState()` 返回硬编码值是审查中极易被跳过的"看似正常"代码。如果状态字段存在，必须在某处被更新。
5. **Agent 闭环 > 单个功能** — 审查时优先关注"Agent 能否完成完整任务"，而非"单个工具是否可用"。
