# Deepicode TODO

本文记录下一阶段任务，优先级从高到低排列。每个任务完成后同步更新 `DONE.md`。

## P0：阻断性修复（本轮审查新发现）

### N1. 上下文无界增长的硬终止防护

状态：待完成

目标：AppendOnlyLog 无裁剪机制，长会话 token 线性增长直到 API 返回 400 `context_length_exceeded`，该错误不可重试，会话直接报错退出。

短期方案（无需 tokenizer）：

- `buildMessages()` 中做粗粒度截断：保留 system message + 最近 N 条 user/assistant 消息对（默认 20 轮），超出丢弃。
- N 可配置，默认值基于 DeepSeek V4 128K 窗口的安全余量估算（扣除 tool result 和 reasoning 的膨胀空间）。

长期方案（配合 #11）：

- 接入 Tokenizer Worker Pool，精确 token 计数 + 65%/75%/80% 三级 Fold 决策。

验收：

- 模拟超过 30 轮对话后，`buildMessages()` 返回的消息数不超过配置上限。
- API 调用不因 context_length_exceeded 而报错。

---

## P0：已完成的阻断项 ✅

以下项目已在 794d414 / d76f3c0 中修复：

- **B1**：SSE `done` 事件重复发射 → 工具调用轮提前终止 ✅
- **B2**：缺少 `write_file` 工具 ✅
- **B3**：`bash` 工具 `cwd` 未 `resolve()` ✅
- **C1**：缺少 `list_dir` / `grep` 工具 ✅
- **B4**：`hash-edit.ts` 临时文件 `Date.now()` 碰撞 ✅
- **B5**：`fuzzy-edit.ts` 正则转义交叉干扰 ✅
- **D1**：`SENSITIVE_FILE_PATTERNS` 重复定义 ✅
- **D2**：`known_hosts` 保护未在 edit 中生效 ✅
- **D3**：`getState()` 硬编码 `isStreaming: false` ✅

---

## P1：数据完整性与资源安全

### N4. Stale-read 全局状态改为会话级

状态：待完成

目标：`stale-read.ts` 的 `track` Map 是模块级全局单例，跨会话残留导致新会话中错误触发"文件已过期"判定。

短期方案（最小改动，1 行）：

- 在 `engine.ts` 的 constructor 或 `submit()` 入口调用 `clearReadTracker()`。

长期方案（正确架构）：

- `ReadTracker` 改为实例化类，由 `ReasonixEngine` 创建并通过 `ToolContext` 注入到工具。

验收：

- 两个连续 Session 对同一文件的操作不产生误报的 stale 警告。
- `clearReadTracker` 有调用点。

### N3. hash-edit 临时文件异常路径泄漏

状态：待完成

目标：`hash-edit.ts` 的流式写入在 IO 异常（磁盘满、权限变更）时，已创建的 `tmpPath` 无清理逻辑。

方案：

- 用 try-finally 包裹流式写入逻辑，finally 块检查并 unlink 残留 tmpPath。
- `write-file.ts` 同样遵循此模式。

验收：

- 模拟写入中途失败后，临时文件被清理。
- 正常写入完成后无临时文件残留。

### 7. 完整化 Hash-Anchored Edit

状态：待完成

目标：让 edit 从"exact replace once"升级为可验证锚点编辑。

验收：

- 支持 oldHash 或上下文 hash。
- hash 不匹配时不写文件。
- 写入使用临时文件 + rename（已完成）。
- 单测覆盖 hash match / mismatch / 多行替换。

### 8. 完整化 9-Pass Fuzzy Edit

状态：部分完成（4/9 pass）

目标：实现实施计划中的 9-pass fallback。

当前已实现：exact、trimmed_full、trimmed_lines、flexible_whitespace

待实现：blockAnchor、escapeNormalized、trimmedBoundary、contextAware、multiOccurrence

验收：

- 所有 pass 有独立单测。
- 组合成功率 > 99%（设计文档目标）。

---

## P1.5：事件体系

### 9. 展示事件与协议事件分层

状态：待完成

目标：

- 协议事件：`assistant_final`、`tool`、`done`
- 展示事件：`status`、`tool_progress`、`warning`

验收：

- `tool_progress` 事件可展示工具执行进度，不影响协议事件确定性。

---

## P2：Context 与 Session

### 11. 接入 token 估算与 fold 决策

状态：待完成

目标：为长会话做上下文预算保护。与 N1 互补——N1 做粗粒度兜底，本项做精确控制。

验收：

- `ContextManager` 提供估算接口（暂时可用近似 token 估算）。
- 实现 75% fold 建议、80% force summary 的最小决策。

### 12. 完成 session 恢复

状态：待完成

目标：JSONL 不只写入，也能恢复。

验收：

- 支持从 `.deepicode/sessions/<sessionId>.jsonl` 加载 messages。
- 启动参数或 API 支持指定 sessionId。
- 恢复后可继续对话。

### N2. 工具输出的非 UTF-8 乱码检测

状态：待完成

目标：bash 命令对非 UTF-8 二进制输出做 `String(b)` 时产生静默乱码，模型可能基于乱码做出错误判断。

方案：

- `shell-exec.ts` 在 `String(b)` 后检测替换字符占比（� > 5%），附加 `encoding_warning` 字段。
- 所有工具的 `JSON.stringify` 调用统一替换为 `safeStringify`（try-catch + 超长截断）。

验收：

- `cat /bin/ls` 类二进制输出在结果中带 `encoding_warning` 标记。

---

## P2：DeepSeekClient 稳定性

### 14. 补齐 SSE 边界测试

状态：待完成

目标：保证 streaming parser 在真实网络 chunk 边界下可靠。

验收：

- chunk 被任意切分（1 字节 / 半个 UTF-8 字符 / 半个 JSON 字段）仍可解析。
- 最后一个 chunk 不完整时不崩溃。
- `[DONE]` 后正确结束。

---

## P3：Shell / TUI / Agent 外壳

### 15. 建立 shell 状态层

状态：待完成

目标：从 CLI 直接消费 core events，升级为 shell state projection。

验收：

- `packages/shell/src/state.ts` 实现不可变状态更新。
- 支持 messages、tool status、stats、errors。

### 16. 重新评估 TUI 接入

状态：待完成

建议：不再跨仓库源码直引 oh-my-pi。若使用，先做 workspace/package 级依赖或复制必要组件。

验收：

- `bun run typecheck` 不依赖 `/vol4/Agent/oh-my-pi` 源码。
- UI 能显示 assistant stream、tool progress、tool result、stats。

---

## P4：测试与文档

### 17. README 重建

状态：待完成

验收：包含安装、配置、运行、测试、工具说明、限制。

### 18. 增加 E2E 场景

状态：待完成

建议场景：

- bash 执行 `pwd` 并返回结果。
- read_file 读取 `package.json`。
- edit 修改临时文件并验证内容。
- 工具错误后模型继续回复。
- 中断正在执行的 bash。

验收：

- 每个场景可自动化运行。
- CI 或本地 `bun test` 可执行，不依赖真实 DeepSeek API。

---

## 暂缓任务

以下任务价值高，但当前不建议立即做：

- 完整 Repair Pipeline。
- Tokenizer Worker Pool（精确版，N1 的粗粒度截断和 #11 的近似估算足以应对短期需求）。
- StrategySelector 和 CNY 成本卡片。
- MCP / LSP / Python Kernel。
- Git Snapshot 回滚。
- 多 Agent Plan / Build 模式。
- D4（空 messages 空哈希，实际不触发）。
- D5（`buildPiModel` + `vendor/pi.d.ts` 死代码清理，不阻塞功能）。

原因：这些任务会显著扩大实现面。建议先把 N1（上下文保护）、session 恢复、测试闭环稳定后再推进。

---

## 已完成汇总

| # | 任务 | commit |
|---|------|--------|
| 1 | `assistant_final` 事件 | — |
| 2 | `reasoning_content` 历史字段 | — |
| 3 | 工具结果提交顺序确定化 | — |
| 4 | bash 最小权限确认 | — |
| 5 | read_file 路径与大文件保护 | — |
| 6 | Stale-read Validation 最小版 | — |
| 10 | prefix fingerprint 覆盖 toolSpecs/fewShots | — |
| 13 | API 重试与错误分类 | — |
| B1 | SSE done 事件重复 | 794d414 |
| B2 | 缺少 write_file | 794d414 |
| B3 | bash cwd 不解析 | 794d414 |
| C1 | 缺少 list_dir/grep | 794d414 |
| B4 | 临时文件碰撞 | d76f3c0 |
| B5 | fuzzy regex 交叉干扰 | d76f3c0 |
| D1 | SENSITIVE_FILE_PATTERNS 重复 | d76f3c0 |
| D2 | known_hosts 保护缺失 | 794d414 |
| D3 | getState 硬编码 | d76f3c0 |
