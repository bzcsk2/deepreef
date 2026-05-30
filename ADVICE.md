# Deepicode 代码审查与建议

**最后更新**: 2026-06-02（第四轮修复 — 9 项已完成）

> 已修复项见 `DONE.md` § ADVICE 审计修复。本文只保留当前待处理项和观察建议。

---

## 一、DeepicodeAudit-2026-06-02 评估

16 个 NEW + 3 个 SEC + 3 个 OBS **全部真实**，0 误判。审计方法从"单文件逻辑扫描"升级为"跨模块一致性+安全完整性+协议合规性"三维审查。

### 逐条评估

**NEW-1 [P1] isToolUseFinishReason() 重复定义** — `client.ts:253` 导出，`loop.ts:9` 独立定义（内容完全相同）。API 新增 finish_reason 变体时改一处漏一处。

**NEW-2 [P2] hash-edit 恒真哈希** — `sha256(oldString) === needleHash` 是恒真式（`needleHash = sha256(oldString)`），每次匹配执行一次无意义 SHA-256。降级 P1→P2（非正确性 Bug）。

**NEW-3 [P2] shell-exec 僵尸进程** — `detached: true` 导致崩溃后子进程组无回收。Windows 部分继续搁置。

**NEW-4 [P2] 截断边界 assistant(tool_calls)** — 同前轮 P2-4，本轮提供了具体修复代码。

**NEW-5 [P2] hook beforeToolCall 异常未隔离** — 异常冒泡进入工具执行错误流，应 fail-safe (deny)。

**NEW-6 [P2] MCP notifications/initialized 协议错误** — `request()` 给通知加 id 等响应，违反 MCP 协议。

**NEW-7 [P2] McpClient pending 泄漏** — request() 无超时，卡住的 server 导致 pending Map 无限增长。

**NEW-8 [P2] bridge contextUsage 跳变** — `contextUsage = addInput`（当次请求），工具循环中状态栏数值跳变。

**NEW-9 [P2] fuzzy-edit Pass 7 多匹配** — Pass 1-6 拒绝多匹配，Pass 7 没有检查。

**NEW-10 [P3] toolIdSeq reset** — `reset()` 不重置 `toolIdSeq`，无实际后果。降级 P2→P3。

**NEW-11 [P3] config readFileSync** — 启动时一次性同步 I/O，影响可忽略。

**NEW-12 [P3] sensitive `.key` 模式过宽** — `[^.]+\.key` 匹配 `package.key`、`schema.key` 等非密钥文件。

**NEW-13 [P3] MCP Content-Length** — 只支持 newline-delimited，不支持 Content-Length header 模式。

**NEW-14 [P3] Google HTML 解析脆弱** — 正则依赖 Google HTML 结构，标注实验性功能即可。

**NEW-15 [P3] repair storm KV 丢失多参数** — storm 只提取第一个 KV 对。最后手段，概率低。

**NEW-16 [P3] FullscreenLayout 冗余** — `isFullscreenEnvEnabled()` 在 App.tsx 和 FullscreenLayout 内各判断一次，内部分支永假。

**SEC-3 [P2] bash 绕过 sensitive 检查** — `bash("cat .env")` 完全绕过 `isSensitive()`。

**SEC-4 [P3] McpAuth stub 撒谎** — 返回 `{ status: "stored" }` 但什么都没存。

### 横向一致性矩阵

11 工具对比揭示了三个系统性差距：

| 差距 | 影响 | 优先 |
|------|------|------|
| AbortSignal 仅 3/11 工具传递 | Ctrl+C 对大文件读/写无效 | P2 |
| sensitive 检查仅 3/11 工具覆盖 | bash 可读取敏感文件 | P2 |
| 错误格式 `[Error]` 前缀与 `safeStringify({error:...})` 不一致 | 模型看到混乱的错误格式 | P3 |

### 架构观察

- **OBS-1 prefox.build() 重复** — 影响微小，随下次重构清理
- **OBS-2 stats 恢复后不连续** — session 恢复后 tokens 从 0 开始
- **OBS-3 reasoning_content 入库** — 建议写入前剥离

---

## 二、建议修复优先级

| 优先级 | 编号 | 问题 | 修改量 | 文件 |
|--------|------|------|--------|------|
| ✅ 已修复 | NEW-1 | isToolUseFinishReason 重复定义 | ✅ | `loop.ts` → import from `client.ts` |
| ✅ 已修复 | NEW-5 | hook beforeToolCall 异常未隔离 | ✅ | `hooks.ts` (try-catch + deny fallback) |
| ✅ 已修复 | SEC-3 | bash 绕过 sensitive 检查 | ✅ | `shell-exec.ts` (path extraction + isSensitive) |
| ✅ 已修复 | NEW-2 | hash-edit 恒真哈希 | ✅ | `hash-edit.ts` (移除冗余校验 + needleHash) |
| ✅ 已修复 | NEW-4 | 截断边界 assistant(tool_calls) | ✅ | `manager.ts` (反向扫描) |
| ✅ 已修复 | NEW-6 | MCP notifications/initialized | ✅ | `mcp/client.ts` (notification 直接 write) |
| ✅ 已修复 | NEW-7 | MCP pending 泄漏（超时） | ✅ | `mcp/client.ts` (30s timeout + clearTimeout) |
| ✅ 已修复 | NEW-8 | bridge contextUsage 跳变 | ✅ | `bridge.tsx` (累积 input tokens) |
| ✅ 已修复 | NEW-9 | fuzzy-edit Pass 7 多匹配 | ✅ | `fuzzy-edit.ts` (matchAll + count check) |
| 🟢 P3 | NEW-3 | shell-exec 僵尸进程 | ~15行 | `shell-exec.ts` |
| 🟢 P3 | NEW-10 | toolIdSeq reset 一致性 | ~1行 | `state.ts` |
| 🟢 P3 | NEW-11 | config readFileSync | ~5行 | `config.ts` |
| 🟢 P3 | NEW-12 | sensitive `.key` 模式过宽 | ~3行 | `sensitive.ts` |
| 🟢 P3 | NEW-13 | MCP Content-Length 解析 | ~15行 | `mcp/client.ts` |
| 🟢 P3 | NEW-14 | Google HTML 解析脆弱 | 标注 | `web-search.ts` |
| 🟢 P3 | NEW-15 | repair storm KV 丢失多参数 | ~5行 | `repair.ts` |
| 🟢 P3 | NEW-16 | FullscreenLayout 冗余判断 | ~5行 | `FullscreenLayout.tsx` |
| 🟢 P3 | SEC-4 | McpAuth stub 返回真实状态 | ~2行 | `mcp/auth.ts` |
| 🟢 P3 | OBS-2 | stats 恢复不连续 | ~5行 | `engine.ts` |

---

## 三、未覆盖的风险

1. **SSE 流中断恢复**：`client.ts` 的 abort/retry 在 Bun 环境下的行为可能与 Node.js 不同
2. **大文件 hash 计算**：`hash-edit.ts` 的 `createReadStream` 在 100MB+ 文件上可能阻塞主线程
3. **Worker 生命周期**：`tokenizer-worker.js` 在 Bun 的 Worker 实现中可能有内存泄漏
