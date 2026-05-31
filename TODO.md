# Deepicode TODO

本文只记录**待完成**工作。已完成项见 `DONE.md`。

> **关联文档**：[实施计划](Deepicode实施计划.md) | [ADVICE](ADVICE.md) | [DONE](DONE.md)


---
## 一、TUI 界面重构

整体设计：键盘快捷键驱动，鼠标仅用于终端文本选择。参考 Claude Code TUI 设计。

### Phase 1：气泡消息 + 主题扩展 + 可折叠思考 ✅

| # | 内容 | 涉及文件 | 状态 |
|---|------|---------|------|
| T1 | 新增主题键 `assistantMessageBackground`, `codeBlockBackground`, `reasoningBackground`（6 个主题） | `packages/ink/src/theme/theme-types.ts` | ✅ |
| T2 | 禁用鼠标点击交互，移除 mouseTracking | `packages/tui/src/App.tsx`, `packages/ink/src/components/AlternateScreen.tsx` | ✅ |
| T3 | 气泡消息：用户/助手不同背景色 + 角色标签 | `packages/tui/src/DeepiMessages.tsx` | ✅ |
| T4 | 代码块渲染：检测 ``` 围栏，codeBlockBackground 背景 | `packages/tui/src/DeepiMessages.tsx` | ✅ |
| T5 | 可折叠思考过程：Ctrl+O 切换，▶/▼ 指示器，折叠态显示 "ctrl+o open" | `packages/tui/src/DeepiMessages.tsx` | ✅ |
| T5a | 思考内容回答后自动折叠修复：`finally` 块中保留 `reasoningText` 不清空；思考区块移至最后一条 assistant 消息上方（独立气泡） | `packages/tui/src/bridge.tsx`, `DeepiMessages.tsx` | ✅ |
| T5b | Ctrl+O 在输入框中被拦截，防止插入为普通字符 | `packages/tui/src/DeepiPromptInput.tsx` | ✅ |
| T5c | Assistant 回答消失修复：`assistant_final` 闭包引用 Bug——React 批处理时更新器读到已清空的变量，改为 const 局部变量保存引用 | `packages/tui/src/bridge.tsx` | ✅ |

### Phase 2：多行输入 + 斜杠命令补全

| # | 内容 | 涉及文件 | 状态 |
|---|------|---------|------|
| T6 | 多行输入：Ctrl+Enter 提交，Enter 换行，光标位置重构 | `packages/tui/src/DeepiPromptInput.tsx` | ⬜ |
| T7 | 斜杠命令自动补全弹出窗口 | `packages/tui/src/CommandAutocomplete.tsx` (新) | ⬜ |
| T8 | 光标/编辑体验增强（Ctrl+←→ 跳词，Ctrl+Backspace 删词） | `packages/tui/src/DeepiPromptInput.tsx` | ⬜ |

### Phase 3：中英文切换

| # | 内容 | 涉及文件 | 状态 |
|---|------|---------|------|
| T9 | i18n 基础设施（t() 函数，zh-CN/en JSON） | `packages/tui/src/i18n/` (新) | ⬜ |
| T10 | 替换所有硬编码字符串（~30-40 处） | 所有 TUI 组件 | ⬜ |
| T11 | `/lang` 命令切换语言 | `packages/tui/src/App.tsx` | ⬜ |

### Phase 4：消息渲染增强

| # | 内容 | 涉及文件 | 状态 |
|---|------|---------|------|
| T12 | 代码块语法高亮 | `packages/tui/src/HighlightedCode.tsx` (新) | ⬜ |
| T13 | 虚拟消息列表（长会话性能） | `packages/tui/src/VirtualMessageList.tsx` (新) | ⬜ |
| T14 | 消息搜索（Ctrl+F） | `packages/tui/src/SearchOverlay.tsx` (新) | ⬜ |

---

### Existing: Bash 确认 UI（已实现核心机制，TUI 交互有 Bug）

**已完成**：
- `permission.ts`：exec tier → `"ask"`，deny 规则先拦截危险命令
- `engine.ts`：`pendingPermission` + `respondPermission()` + `requestPermission` callback
- `streaming-executor.ts`：权限"ask"逻辑移到 `executeToolCall`（async generator），yield `permission_ask` 事件 + await 用户响应
- `interface.ts`：新增 `permission_ask` role
- `bridge.tsx`：`permissionPrompt` 状态字段，`permission_ask` → 设置提示
- `App.tsx`：`handleSubmit` 拦截 permission prompt，输入 y → `respondPermission(true)`

**已知 Bug**：

| # | 问题 | 症状 | 根因分析 |
|---|------|------|---------|
| U1 | 输入 y 无反应 | 用户看到 `🔐 Allow bash? [y/n]` 提示后，输入 y 回车，bash 不执行 | `DeepiPromptInput` 的 `useInput` 在 `isLoading=true` 时可能不处理输入；或者 `permissionPrompt` 状态的 React 渲染时序导致 `handleSubmit` 收到的 `bridgeState.permissionPrompt` 为 null（闭包陈旧） |
| U2 | 光标不在对话框 | 显示确认提示时，输入焦点丢失 | `permission_ask` 事件到达时，bridge 的 `finally` 块可能已将 `isLoading` 设为 false 并 reset 了状态，但光标恢复逻辑可能因 Ink 的渲染时序而异常 |
| U3 | 确认 UI 显示时机 | 提示出现后可能被后续渲染覆盖 | `permission_ask` yield 后，`finally` 块中 `reasoningText: null` 等状态重置可能与 prompt 渲染竞争 |
| U4 | Fail-open 静默穿透 | hook 返回 undefined 且无 requestPermission 时，权限检查穿透直接执行工具 | `if (hookDecision !== "allow" && this.requestPermission)` 这行之后无 else deny，当两个条件都不满足时 fall through 到工具执行 |

**修复方向**：
- U1：`handleSubmit` 中 `bridgeState.permissionPrompt` 需要用 ref 而非 state，避免闭包陈旧问题
- U2：确认模式下强制 focus 输入框，或用独立的 useInput handler
- U3：`finally` 块检查 `permissionPrompt` 状态，有 pending 时不 reset
- U4：`executeToolCall` 的 ask 分支末尾加 `else { deny }`：hook 未显式 allow 且无 requestPermission 时拒绝执行

---
## 二、Bug 修复（来自 ADVICE）

| # | 问题 | 位置 | 优先级 |
|---|------|------|--------|
| B6 | SessionLoader 恢复时系统消息重复 | `core/src/session.ts` | P1 |
| B5 | repair.ts 1e+1f 组合策略缺失 | `core/src/context/repair.ts` | P2 |
| L2 | SessionWriter 队列无界增长 | `core/src/session.ts:114-142` | P2 |
| L5 | fuzzy-edit/hash-edit 未归一化 CRLF | `tools/src/fuzzy-edit.ts`, `hash-edit.ts` | P2 |
| L9 | reasoningText 消失导致布局跳动 | `tui/src/bridge.tsx:180-189` | P2 | ✅ 已修复：`finally` 块不再清空 `reasoningText`，改为保留 |
| L10 | Assistant 回答完成后内容消失 | `tui/src/bridge.tsx` `assistant_final` | P1 | ✅ 已修复：闭包引用 Bug——React 批处理时更新器读到已清空的变量，改为 const 局部变量保存 |
| — | notebook-edit 同步文件操作 → 异步 + 原子写入 | `tools/src/notebook-edit.ts` | P2 |
| — | /skill 跨包相对路径 import → package alias | `tui/src/App.tsx:171` | P2 |
| — | handleSessionSelect 卸载后 setState | `tui/src/App.tsx:217-230` | P3 |
| Q10 | tool_start key fallback 不一致 | `tui/src/bridge.tsx:83,95,111` | P3 |
| — | tool_call_id 规范化（跨 provider） | `core/src/loop.ts` | P3 |
| — | client.ts 3 处 any/as 类型断言 | `core/src/client.ts` | P3 |

---


## 三、Phase 2：智能推理强度调节

参考：**RNX** `src/loop.ts`（strategy select 内嵌逻辑）

| # | 内容 | 说明 |
|---|------|------|
| ST1 | Tier 配置定义（CNY 四档） | `packages/core/src/strategy/` 目录不存在 |
| ST2 | TaskClassifier（纯规则打分） | LoopEvent 已预留 `strategy_notify` / `strategy_estimate_refined` |
| ST3 | ChainEstimator（滑动 TPS + Agentic 补偿） | |
| ST4 | StrategySelector + TUI 倒计时 | |

---

## 五、测试待完成（来自 TEST.md）

### 🟡 中等（1 项进行中）

| # | 模块 | 项 |
|---|------|----|
| M10 | write_file | 权限继承 — 父目录 mode 继承 |

### 🔴 困难（23 项，需要真实环境/大量数据/复杂状态机）

| # | 模块 | 项 |
|---|------|----|
| H1 | Streaming | AbortSignal 终止后续工具 |
| H2 | Streaming | shared 工具并发安全 |
| H3 | Streaming | 工具执行超时 |
| H4 | Engine | interrupt 在工具执行中 |
| H5 | Engine | interrupt 在 SSE 流中 |
| H6 | Engine | submit 后 switchAgent |
| H7 | Engine | fold force 决策集成场景 |
| H8 | Engine | 并发 submit |
| H9 | Engine | submit 中 updateConfig |
| H10 | Engine | 超长对话 50 轮+ |
| H11 | edit | 极端文件 1MB 单行 |
| H12 | edit | 极端文件 10 万行 |
| H13 | bash | 超时 sleep 60 |
| H14 | bash | stdout 未完全消费 |
| H15 | bash | detached 子进程 |
| H16 | WebFetch | 超时 30s / DNS 失败 |
| H17 | McpClient | 全套 12 项 JSON-RPC stdio |
| H18 | McpHost | 全套 6 项 |
| H19 | MCP Tools | List/Read 资源 |
| H20 | Bridge | 全套 18 项 TUI 状态机 |
| H21 | Terminal | 全套 8 项 Ink/SIGINT |
| H22 | 压力 | 50 轮 / 50K JSON / 10MB 文件 |
| H23 | 压力 | 100 工具 / 1000 行 JSONL / 极端文件名 |

---

## 六、暂缓

- TTSR 规则系统
- Universal Config Discovery
- Python Kernel
- 多前端（Web、IDE Plugin）
- LSP 完整集成（当前仅返回 status:unavailable）
- E2E 测试覆盖 TUI 流程
- 长会话压测（50+ 轮）
- README / 配置指南 / 发布包

---

## 进度总览

| 内容 | 状态 |
|------|------|
| Phase 0-5 全部 + 安全层 + 壳层 + 多 Agent + 30+ 工具 + Skills + MCP | ✅ DONE.md |
| ADVICE 审计修复 38 项 + P0-P3 批量修复 32 项 | ✅ DONE.md |
| TT1-TT3 测试 | ✅ DONE.md |
| TUI Phase 1（气泡 + 主题 + 可折叠思考 + 思考持久化 + 回答消失修复） | ✅ |
| TUI Phase 2（多行输入 + 命令补全） | ⬜ |
| TUI Phase 3（中英文切换） | ⬜ |
| TUI Phase 4（语法高亮 + 虚拟列表 + 搜索） | ⬜ |
| Bug 修复（B5/B6 等 11 项） | ⬜ |
| Phase 2 智能推理调节（ST1-4） | ⬜ |
| Phase 6/7 剩余 | ⬜ |
