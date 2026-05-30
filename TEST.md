# Deepicode 测试用例

本文覆盖全项目 7 个包、42+ 模块。按包分组，每个子节包含单元测试和集成测试用例。

## 约定

- 运行时：Bun + Vitest
- 临时目录：`mkdtempSync(join(tmpdir(), 'deepicode-xxx-'))` + afterEach cleanup
- 命名：`describe('ModuleName')` → `it('should ...')` 行为驱动
- Mock 外部依赖（fetch、子进程、文件系统）用 `vi.mock` / `vi.spyOn`
- 测试文件位置：每个包的 `__tests__/` 目录，如 `packages/core/__tests__/xxx.test.ts`

---

## 1. Core 包 (`packages/core/`)

### 1.1 Context Manager（已有测试，需补充）

已有：`context.test.ts` — ImmutablePrefix、AppendOnlyLog、VolatileScratch、三区域集成、截断逻辑

**补充：**

```
[ ] AppendOnlyLog.appendMany 空数组应不做修改
[ ] AppendOnlyLog 防御性拷贝 — 外部修改返回数组不应影响内部状态
[ ] VolatileScratch 防御性拷贝 — setMessages 后外部修改不应影响内部状态
[ ] ContextManager.buildMessages 返回防御性拷贝
[ ] ContextManager.startTurn 在空 scratch 时也应无副作用
[ ] ContextManager 构造时 maxRounds 接受负值应当作 0
[ ] ImmutablePrefix 空 system prompt 和空 toolSpecs 应正常工作
```

### 1.2 Token Estimator

```
[ ] estimateTokens 空数组返回 0
[ ] estimateTokens 纯 ASCII 文本 — 约 4 chars/token
[ ] estimateTokens 纯 CJK 文本 — 约 1.5 chars/token
[ ] estimateTokens 混合内容
[ ] estimateTokens 包含 reasoning 内容应额外估算
[ ] getFoldDecision < 65% 返回 none
[ ] getFoldDecision 65-75% 返回 suggest
[ ] getFoldDecision 75-80% 返回 suggest (warn)
[ ] getFoldDecision > 80% 返回 force
[ ] getFoldDecision total=0 不抛异常
```

### 1.3 Tokenizer Pool

```
[ ] pool 启动 Worker 并返回 token 估算
[ ] pool 超时降级回主线程估算
[ ] pool 连续超时 3 次才标记 unhealthy
[ ] pool 正常响应后重置连续超时计数
[ ] pool terminate 清理所有 Worker
```

### 1.4 Streaming Executor

```
[ ] shared 工具并行执行并正确排序
[ ] exclusive 工具串行执行
[ ] 未知工具名返回 error 事件
[ ] 参数解析失败走 repair pipeline
[ ] repair pipeline 全部失败返回 error
[ ] permission deny 拦截工具执行
[ ] permission ask + hook deny 拦截
[ ] permission ask + hook 通过 放行
[ ] 工具执行抛异常返回 error 事件
[ ] tool_start / tool_progress / tool / tool_progress(done) 事件顺序
```

### 1.5 Query Engine

```
[ ] stream() 产出 engine.submit 的所有事件
[ ] stream() 注册的 onEvent 回调接收到事件
[ ] onEvent 返回 unsubscribe 函数可移除监听
[ ] onEvent 回调抛异常不应影响事件流
[ ] query() 收集所有 assistant_delta 并拼接
[ ] query() 空响应返回空字符串
[ ] interrupt() 委托给 engine.interrupt
```

### 1.6 Session

```
[ ] AsyncSessionWriter 写入 JSONL 文件
[ ] AsyncSessionWriter 连续写入追加在同一文件
[ ] AsyncSessionWriter 不可序列化 payload 不中断流
[ ] SessionLoader.list 扫描目录返回元数据（ID、时间、消息数、token）
[ ] SessionLoader.list 空目录返回空数组
[ ] SessionLoader.list 限 20 条
[ ] SessionLoader.read 从 JSONL 恢复 ChatMessage[]
[ ] SessionLoader.read 空文件返回空数组
[ ] SessionLoader.read 损坏 JSONL 行跳过
[ ] SessionLoader.read 从后向前找最近合法 messages
[ ] ReasonixEngine.recover 加载 session 并可用
[ ] engine.loadSession 清空当前上下文加载指定 session
[ ] engine.loadSession 后支持新对话
```

### 1.7 Repair Pipeline

```
[ ] Scavenge 提取花括号块成功
[ ] Scavenge 单引号→双引号
[ ] Scavenge 尾逗号清除
[ ] Scavenge 包裹花括号
[ ] Scavenge 闭合花括号
[ ] Scavenge 闭合引号
[ ] Truncation 逐步截尾重试成功
[ ] Truncation 完全不可修复返回失败
[ ] Storm key-value 提取兜底
[ ] 所有策略失败返回 {success: false}
```

### 1.8 Agent

```
[ ] getAgent('build') 返回 Build Agent 定义
[ ] getAgent('plan') 返回 Plan Agent 定义
[ ] getAgent('unknown') 回退到 build
[ ] agentConfigFor 使用默认值
[ ] agentConfigFor 接受覆盖参数
[ ] Build Agent toolNames 包含所有工具（30+）
[ ] Plan Agent toolNames 只读（4 个）
```

### 1.9 Engine + Loop（已有测试，需补充）

已有：`engine-tools.test.ts` — toolCallIndex 映射、double done、工具错误

补充：

```
[ ] 空 toolCalls 死循环保护 — yield warning + break
[ ] 连续 3 次 stream 失败终止 loop
[ ] stream 失败 1-2 次自动重试
[ ] fold 决策 force 时 yield status 警告
[ ] submit 后 switchAgent 改变工具列表
[ ] engine.interrupt 终止当前 submit
[ ] engine.getState 返回当前 agent 名
[ ] engine.updateConfig 实时更新配置
```

### 1.10 Config

```
[ ] loadConfig 返回默认值（无 env 无文件）
[ ] loadConfig 环境变量覆盖
[ ] PROVIDERS.zen 包含 defaultKey
[ ] PROVIDERS.deepseek 不包含 defaultKey
[ ] getApiKeyEnvVar 返回正确 env 名
[ ] saveLastConfig / loadLastConfig 持久化 provider/model/baseUrl
[ ] buildPiModel 构建正确对象结构
```

### 1.11 Client

```
[ ] SSE 解析 text_delta 事件
[ ] SSE 解析 reasoning_delta 事件
[ ] SSE 解析 tool_call_end 事件
[ ] SSE 解析 usage 事件
[ ] SSE 处理 [DONE] 标记
[ ] SSE 解析 429 响应触发重试
[ ] SSE 解析 HTTP 错误
[ ] chatCompletionsStream 构建正确请求体
[ ] 重试指数退避 1s/2s/4s + jitter
[ ] maxRetries=0 不重试
```

---

## 2. Tools 包 (`packages/tools/`)

### 2.1 write_file（已有测试）

```
✓ 创建新文件
✓ 覆盖已有文件
✓ 拒绝对敏感路径写入
✓ 拒绝空 path/content 参数
```

### 2.2 read_file（新建）

```
[ ] 读取已存在的文本文件
[ ] 文件不存在返回结构化错误
[ ] 拒绝敏感路径
[ ] 超过 10MB 返回错误
[ ] 相对路径基于 ctx.cwd 解析
[ ] 截断时追加 truncation notice
```

### 2.3 edit（新建）

```
[ ] 编辑已有文件
[ ] 编辑不存在的文件返回错误
[ ] 拒绝敏感路径
[ ] 相对路径基于 ctx.cwd 解析
[ ] 敏感文件保护（known_hosts 等）
```

### 2.4 bash（已有安全测试，补充功能）

已有：deny rm -rf /、sudo、mkfs、chmod -R 777 /

补充：

```
[ ] 合法命令正常执行并返回 stdout
[ ] 命令返回非零 exitCode 不抛出
[ ] cwd 相对路径基于 ctx.cwd 解析
[ ] 命令超时处理
[ ] 输出包含编码警告时追加 notice
[ ] 空命令返回错误
```

### 2.5 list_dir（已有）

```
✓ 列出目录内容（文件/目录/大小）
✓ 不存在的目录返回错误
✓ 空 path 返回错误
[ ] stat 失败返回 type: "unknown"
```

### 2.6 grep（已有）

```
✓ 匹配模式
✓ 无匹配返回空
✓ include 过滤
✓ 拒绝空 pattern
```

### 2.7 todowrite（已有）

```
✓ 创建 4 种状态 todo
✓ 拒绝空数组
✓ 拒绝非数组
[ ] todo 运行时结构校验
```

### 2.8 Glob（新建）

```
[ ] 匹配当前目录文件
[ ] 匹配子目录文件（**/*.ts）
[ ] 无匹配返回空数组
[ ] 只匹配目录
[ ] 拒绝空 pattern
[ ] 路径穿越保护
```

### 2.9 hash-edit（已有）

```
✓ 精确替换
✓ 多行替换
✓ oldString 未找到返回 null
✓ oldHash 不匹配返回 null
✓ oldHash 匹配成功
✓ 空 oldString 返回 null
```

### 2.10 fuzzy-edit（已有）

```
✓ exact pass
✓ trimmed_full pass
✓ trimmed_lines pass
✓ flexible_whitespace pass
✓ blockAnchor pass
✓ escapeNormalized pass
✓ trimmedBoundary pass
✓ contextAware pass
✓ 多 occurrence 返回 null
✓ 唯一匹配成功
```

### 2.11 Task Manager（新建）

```
[ ] TaskManager.create 创建任务并持久化
[ ] TaskManager.create 自动生成 id/createdAt/updatedAt
[ ] TaskManager.list 返回所有任务
[ ] TaskManager.list 返回副本（外部修改不影响内部）
[ ] TaskManager.get 根据 id 查找
[ ] TaskManager.get 不存在的 id 返回 undefined
[ ] TaskManager.update 更新字段并设置 updatedAt
[ ] TaskManager.update 不存在的 id 返回 false
[ ] TaskManager.stop 设置 status = "cancelled"
[ ] TaskManager 文件不存在时自动创建空列表
[ ] TaskManager 损坏 JSON 文件不崩溃
[ ] TaskManager 持久化到正确路径 `.deepicode/tasks.json`
```

### 2.12 TaskCreate（新建）

```
[ ] 创建任务返回结构化结果
[ ] 拒绝空 content
[ ] 默认 priority = medium
[ ] 可选 tags 过滤非字符串
```

### 2.13 TaskUpdate（新建）

```
[ ] 更新任务字段
[ ] 不存在的 id 返回错误
[ ] 拒绝空 id
```

### 2.14 TaskList（新建）

```
[ ] 列出所有任务
[ ] 按 status 过滤
[ ] 按 priority 过滤
[ ] 空列表返回空数组
```

### 2.15 TaskGet（新建）

```
[ ] 按 id 获取任务
[ ] 不存在的 id 返回错误
```

### 2.16 TaskStop（新建）

```
[ ] 停止任务（status → cancelled）
[ ] 不存在的 id 返回错误
```

### 2.17 AskUserQuestion（新建）

```
[ ] 返回结构化 question 对象
[ ] 包含可选 options
[ ] 拒绝空 question
[ ] options 过滤非字符串
```

### 2.18 PlanMode（新建）

```
[ ] enter 返回 planning 信号
[ ] exit 返回 completion 信号
[ ] 拒绝无效 action
```

### 2.19 NotebookEdit（新建）

```
[ ] create_cell 追加 code cell
[ ] create_cell 在指定 index 插入
[ ] create_cell 默认 index=-1 追加到末尾
[ ] update_cell 更新指定 cell 内容
[ ] update_cell 默认 index=-1 更新最后一个
[ ] delete_cell 删除指定 index
[ ] delete_cell 默认 index=-1 删除最后一个
[ ] 文件不存在返回错误
[ ] 无效 JSON 返回错误
[ ] no cells 数组返回错误
[ ] cell_type 缺少或无效返回错误
[ ] index 越界返回错误
[ ] update_cell 缺少 source 返回错误
```

### 2.20 Sleep（新建）

```
[ ] sleep 指定的毫秒数后完成
[ ] sleep 0ms 立即完成
[ ] sleep 超过 300s 被限制
[ ] sleep 请求中止时提前结束
[ ] 拒绝无效 duration
```

### 2.21 PushNotification（新建）

```
[ ] 返回通知已发送的结构化结果
[ ] 包含 title 和 message
[ ] 拒绝空消息
```

### 2.22 Monitor（新建）

```
[ ] process 目标返回进程列表结构
[ ] disk 目标返回磁盘使用信息
[ ] memory 目标返回内存信息
[ ] file 目标返回文件 stat（存在）
[ ] file 目标返回 {exists:false}（不存在）
[ ] file 目标缺少 path 返回错误
[ ] 无效 target 返回错误
[ ] 自定义 interval_ms 和 timeout_ms
[ ] signal.aborted 提前停止采样
```

### 2.23 WebBrowser（新建）

```
[ ] navigate action 获取页面内容
[ ] screenshot action 返回 Playwright 未安装提示
[ ] click/fill/extract 返回 Playwright 未安装提示
[ ] 缺少 action 返回错误
[ ] 无效 action 返回错误
[ ] navigate 缺少 url 返回错误
[ ] navigate HTTP 错误返回结构化错误
[ ] HTML 内容转为纯文本
```

### 2.24 Worktree（新建）

```
[ ] 非 git 仓库返回错误
[ ] enter 缺少 branch 返回错误
[ ] exit 缺少 path 返回错误
[ ] 无效 action 返回错误
[ ] git 命令失败返回结构化错误
```

### 2.25 Cron（新建）

```
[ ] create 创建 crontab 条目
[ ] delete 删除指定条目
[ ] list 列出所有 deepicode 任务
[ ] 无效 action 返回错误
[ ] create 缺少 schedule 或 command 返回错误
[ ] delete 缺少 name 返回错误
```

### 2.26 Workflow（新建）

```
[ ] 执行多步骤工作流
[ ] 步骤缺少 tool 返回错误结果
[ ] 空 steps 返回错误
[ ] 非数组 steps 返回错误
```

### 2.27 AgentTool（新建）

```
[ ] 委托任务返回结构化结果
[ ] 默认 agent_type = build
[ ] plan agent_type 被接受
[ ] 拒绝空 task
[ ] 可选 files 参数
```

### 2.28 SendMessage（新建）

```
[ ] 发送消息返回结构化结果
[ ] 包含 recipient/message/type/timestamp
[ ] 默认 type = info
[ ] 拒绝空 recipient 或 message
```

### 2.29 LSP（新建）

```
[ ] 文件不存在返回错误
[ ] 返回 status: "unavailable"（需要额外安装）
[ ] 接受所有 action 枚举值
[ ] 拒绝空 action 或 file_path
```

### 2.30 WebFetch（新建）

```
[ ] 拒绝空 URL
[ ] 无效 URL 返回错误
[ ] HTTP URL 自动升级 HTTPS
[ ] URL 包含凭据拒绝
[ ] 内网 IP 拒绝（SSRF 保护）
[ ] 内网 hostname 拒绝
[ ] HTTP 错误返回结构化错误
[ ] 超时返回错误
[ ] 内容超过限制返回错误
[ ] HTML 内容转为纯文本
```

### 2.31 WebSearch（新建）

```
[ ] 拒绝空 query
[ ] num_results 默认 5，最多 10
[ ] HTML 解析提取搜索结果
[ ] 搜索 HTTP 错误返回结构化错误
[ ] 超时返回错误
[ ] parseGoogleResults 解析标准 Google HTML
[ ] parseGoogleResults 空 HTML 返回空数组
```

### 2.32 Stale-read（新建）

```
[ ] recordRead 记录文件状态
[ ] checkStale 文件未修改返回 undefined
[ ] checkStale 文件 mtime 变化返回 stale
[ ] checkStale 文件 size 变化返回 stale
[ ] checkStale 未 read 过的文件返回 undefined
[ ] clearReadTracker 清空所有跟踪
```

### 2.33 Safe Stringify（新建）

```
[ ] safeStringify 普通对象
[ ] safeStringify 包含循环引用不抛异常
[ ] safeStringify 超过 maxLen 截断
[ ] safeStringify null/undefined
[ ] hasBinaryEncoding 检测 � 占比 > 5%
[ ] hasBinaryEncoding 正常文本返回 false
```

### 2.34 Sensitive（新建）

```
[ ] isSensitive('api-key') = true
[ ] isSensitive('.env') = true
[ ] isSensitive('.git/config') = true
[ ] isSensitive('known_hosts') = true
[ ] isSensitive('src/index.ts') = false
[ ] SENSITIVE_FILE_PATTERNS 包含所有模式
```

### 2.35 Skills（新建）

```
[ ] skill search 按名称匹配
[ ] skill search 按描述匹配
[ ] skill search 无匹配返回空
[ ] skill list 列出所有技能
[ ] skill load 返回指定技能内容
[ ] skill load 不存在的名称返回错误
```

### 2.36 Shell Exec（新建）

```
[ ] bash 命令经过 sanitize 拦截
[ ] sanitize 提取文件路径做 sensitive 检查
[ ] 敏感路径命中 denied
```

---

## 3. MCP 包 (`packages/mcp/`)

### 3.1 McpClient

```
[ ] 启动 stdio 子进程并初始化
[ ] listTools 返回工具列表
[ ] callTool 调用指定工具
[ ] listResources 返回资源列表
[ ] README 通知无 ID（协议合规）
[ ] 请求超时 30s
[ ] pending 泄漏清理
[ ] 子进程退出时清理
```

### 3.2 McpHost

```
[ ] loadConfig 从 .deepicode/mcp.json 加载
[ ] 配置不存在不报错
[ ] 多客户端管理
[ ] 自动注册 MCP 工具到 Registry
```

### 3.3 工具

```
[ ] ListMcpResources 返回资源列表
[ ] ReadMcpResource 读取指定资源
[ ] McpAuth set 保存凭据
[ ] McpAuth list 列出所有凭据
[ ] McpAuth 空列表无凭据
```

---

## 4. Security 包 (`packages/security/`)

### 4.1 PermissionEngine

```
[ ] 默认规则 — exec tier 返回 ask
[ ] 默认规则 — read/write tier 返回 allow
[ ] deny 规则优先于 allow
[ ] deny 规则按 tool name 精确匹配
[ ] deny 规则按 tool name 正则匹配
[ ] deny 规则按 args 模式匹配
[ ] allow 规则放行
[ ] 无规则命中回退默认
[ ] isAllowed / isDenied 快捷方法
```

### 4.2 HookManager

```
[ ] beforeToolCall 返回 deny 禁止执行
[ ] beforeToolCall 返回 allow 放行
[ ] beforeToolCall 不注册返回 undefined
[ ] beforeToolCall 抛异常返回 deny（fail-safe）
[ ] afterToolCall 接收工具执行结果
[ ] afterToolCall 不注册不报错
[ ] onLoopEvent 接收 loop 事件
```

### 4.3 FileSnapshot

```
[ ] snapshot 保存文件到 .deepicode_patches/
[ ] snapshot 自动创建目录
[ ] revert 恢复原始内容
[ ] revert 不存在的快照不报错
[ ] SHA256 路径索引
[ ] 同名文件多次 snapshot 保留最新
```

---

## 5. TUI 包 (`packages/tui/`)

> TUI 组件测试需要 Ink 渲染环境或 React Testing Library。

### 5.1 Bridge

```
[ ] 桥接通过 switch-case 处理 8 种事件类型
[ ] assistant_delta 增量追加
[ ] reasoning_delta 独立追踪
[ ] tool_start 创建工具状态
[ ] tool 更新工具状态
[ ] tool_progress(done) 标记完成
[ ] error 事件设置错误状态
[ ] warning 事件追加到 warnings 数组
[ ] done 事件触发 finally 清理
[ ] status(interrupt/tools_completed) 特殊处理
[ ] tool_call_delta 事件正确处理
[ ] 相同 toolCallIndex 同名工具不冲突
```

### 5.2 Messages

```
[ ] user 消息左对齐
[ ] assistant 消息左对齐（流式增量优先显示流式内容）
[ ] tool 消息截断至 200 字符
[ ] reasoning 行显示
[ ] React key 稳定（role + index）
```

### 5.3 PromptInput

```
[ ] 输入字符追加
[ ] Enter 提交
[ ] Ctrl+C 空闲时触发退出逻辑
[ ] Ctrl+C 加载中触发取消
[ ] 光标位置管理
```

### 5.4 StatusBar

```
[ ] 显示 provider label 和 model
[ ] 显示 tokens（入/中/出）
[ ] 显示缓存命中率
[ ] 显示上下文用量/总量
[ ] 显示 agent 名
[ ] statusMessage 显示退出确认
```

### 5.5 ModelPicker

```
[ ] 三步向导：provider → key → model
[ ] Zen defaultKey 跳过 key 输入
[ ] 环境变量 key 自动填充
```

### 5.6 SessionPicker

```
[ ] 列出最近 20 条 session
[ ] ↑↓ 导航，Enter 选择
[ ] Esc 取消
```

### 5.7 App

```
[ ] /help 显示帮助
[ ] /exit 走 cleanupTerminal 退出
[ ] /agent 切换 agent
[ ] /model 打开 ModelPicker
[ ] /sessions 打开 SessionPicker
[ ] /skill 列出已加载技能
[ ] SIGINT 加载中取消
[ ] SIGINT 空闲双击退出
```

### 5.8 Terminal Cleanup

```
[ ] 正确顺序：mouse↓ → unmount → drainStdin → detachForShutdown → SHOW_CURSOR
[ ] 多处退出路径都走 cleanupTerminal
```

---

## 6. CLI 包 (`packages/cli/`)

```
[ ] --help 打印使用说明
[ ] 非 TTY pipe 模式读取 stdin
[ ] pipe 模式处理 assistant_delta 输出
[ ] pipe 模式 tool_start 显示工具名
[ ] pipe 模式 error/warning 写入 stderr
[ ] pipe 模式 done 不重复换行
[ ] TTY 模式进入 TUI
[ ] --session <id> 恢复 session
```

---

## 7. 集成 / 回归（已有 + 补充）

### 7.1 工具级集成（新建）

```
[ ] read → edit → read 验证编辑结果
[ ] bash → read_file 交叉验证文件内容
[ ] TaskCreate → TaskList → TaskGet → TaskUpdate → TaskStop 完整流程
[ ] grep 结果作为 edit 的上下文锚点
```

### 7.2 SSE 边界（新建）

```
[ ] 1 字节 chunk 不崩溃
[ ] 半个 UTF-8 字符（3 字节不全）
[ ] 半个 JSON 对象
[ ] 超长单行（>100K chars）
```

### 7.3 错误恢复（新建）

```
[ ] API key 无效返回认证错误
[ ] maxTokens 超过限制截断处理
[ ] 并发 submit 被拒绝
[ ] SQL 注入尝试被 shell sanitize 拦截
```

---

## 运行方式

```bash
# 全体测试
bun test

# 带文件监控
bun test --watch

# 单个测试文件
bun test packages/core/__tests__/context.test.ts

# 集成测试（需要真实 API key）
bun test -- --integration

# 类型检查（先于测试）
bun run typecheck
```

## 覆盖率目标

| 包 | 当前 | 目标 |
|---|------|------|
| core | ~20% | 80% |
| tools | ~30% | 80% |
| security | 0% | 80% |
| mcp | 0% | 60% |
| tui | 0% | 50%（手动测试为主） |
| cli | 0% | 50% |
