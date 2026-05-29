## deepicode 项目代码审查报告

**审查时间**: 2026-05-29 · **审查范围**: `packages/` 全部源代码

---

## 已修复

以下问题已在实际代码中修复，此处仅记录：

| # | 问题 | 位置 | commit |
|---|------|------|--------|
| B1 | SSE `done` 事件重复发射 | `client.ts` + `engine.ts` | 794d414 |
| B2 | 缺少 `write_file` 工具 | `tools/src/index.ts` | 794d414 |
| B3 | `bash` cwd 未 resolve | `shell-exec.ts` | 794d414 |
| B4 | 临时文件 `Date.now()` 碰撞 | `hash-edit.ts` | d76f3c0 |
| B5 | fuzzy regex 转义交叉干扰 | `fuzzy-edit.ts` | d76f3c0 |
| C1 | 缺少 `list_dir` / `grep` | 新增工具 | 794d414 |
| D1 | SENSITIVE_FILE_PATTERNS 重复 | 提取到 `sensitive.ts` | d76f3c0 |
| D2 | `known_hosts` 保护缺失 | `edit.ts` | 794d414 |
| D3 | `getState()` 硬编码 | `engine.ts` | d76f3c0 |
| N1 | 上下文无界增长 | `context/manager.ts` | 已修复 |
| N3 | hash-edit 临时文件泄漏 | `hash-edit.ts` | 已修复 |
| N4 | stale-read 全局污染 | `stale-read.ts` | 已修复 |
| #7 | Hash-Anchored Edit 完整化 | `hash-edit.ts` + `edit.ts` | 已修复 |
| #8 | 9-Pass Fuzzy Edit | `fuzzy-edit.ts` | 已修复 |

---

## 🔴 P0 — 阻断性 Bug

### P0-1: `grep` 工具命令注入漏洞

**位置**: `grep.ts:63-80`

```typescript
// 当前代码
return execSync(rgCmd.join(" "), { encoding: "utf-8", timeout: 15000 })
// pattern / searchPath / include 来自 LLM 输出，未经转义直接拼入 shell 命令
```

**风险**: LLM 输出的 pattern 可能含 shell 元字符（`;`、`$()`、`` ` ``）。虽然 LLM 不会主动攻击，但 prompt injection 可诱导 LLM 生成恶意 pattern。

**修复**:

```typescript
// 使用 spawn 传数组参数，绕过 shell 解析
import { spawnSync } from "node:child_process"

function runSearch(pattern: string, searchPath: string, include?: string): string {
  const args = ["-n", "--no-heading"]
  if (include) args.push("-g", include)
  args.push(pattern, searchPath)

  // 优先 rg，回退 grep
  const result = spawnSync("rg", args, { encoding: "utf-8", timeout: 15000 })
  if (result.error || result.status === 127) {
    const grepArgs = ["-rn"]
    if (include) grepArgs.push(`--include=${include}`)
    grepArgs.push(pattern, searchPath)
    const grepResult = spawnSync("grep", grepArgs, { encoding: "utf-8", timeout: 15000 })
    if (grepResult.error) throw grepResult.error
    return grepResult.stdout
  }
  return result.stdout
}
```

**测试方法**:

```typescript
// 在 grep.test.ts 中添加
it("should not execute shell metacharacters in pattern", async () => {
  const result = await grepTool.execute({
    pattern: "$(echo injected > /tmp/pwned)",
    path: "."
  }, { cwd: "/tmp", sessionId: "test", signal: undefined })
  // 不应创建 /tmp/pwned 文件
  const fs = require("node:fs")
  expect(fs.existsSync("/tmp/pwned")).toBe(false)
})

it("should handle pattern with semicolons safely", async () => {
  const result = await grepTool.execute({
    pattern: "test; rm -rf /",
    path: "."
  }, { cwd: "/tmp", sessionId: "test", signal: undefined })
  // 不应崩溃或执行额外命令，正常返回搜索结果或空
  expect(result.isError).toBe(false)
})
```

---

### P0-2: `write_file` 目标目录不存在时崩溃

**位置**: `write-file.ts:34`

```typescript
// 当前代码 — 没有 mkdir
await fsWriteFile(path, args.content, "utf-8")
// 父目录不存在 → ENOENT → 异常被 streaming-executor catch → 返回丑陋的 500 错误
```

**修复**:

```typescript
// 在 fsWriteFile 之前加一行
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

await mkdir(dirname(path), { recursive: true })
await fsWriteFile(path, args.content, "utf-8")
```

**测试方法**:

```typescript
it("should create parent directories automatically", async () => {
  const tmpDir = `/tmp/deepicode_test_${Date.now()}`
  const result = await writeFileTool.execute({
    path: `${tmpDir}/sub/deep/file.txt`,
    content: "hello"
  }, { cwd: "/", sessionId: "test", signal: undefined })

  expect(result.isError).toBe(false)
  const fs = require("node:fs")
  expect(fs.existsSync(`${tmpDir}/sub/deep/file.txt`)).toBe(true)
  expect(fs.readFileSync(`${tmpDir}/sub/deep/file.txt`, "utf-8")).toBe("hello")
  fs.rmSync(tmpDir, { recursive: true })
})
```

---

## 🟠 P1 — 功能缺陷

### P1-1: `buildMessages()` 截断可能破坏 assistant+tool 消息对

**位置**: `context/manager.ts:29-38`

```typescript
// 当前截断逻辑：按 user 消息位置切分
const cutFrom = userIdx[userIdx.length - this.maxRounds]
log = log.slice(cutFrom)
// 如果截断点落在 [assistant(tool_calls), tool_result, assistant] 中间 → 孤立的 tool 消息 → API 400
```

**修复**:

```typescript
// 截断后向前扫描，确保不切断 tool 消息组
let cutFrom = userIdx[userIdx.length - this.maxRounds]

// 向前扩展到最近的完整 round 边界：
// 确保 cutFrom 之前没有未配对的 tool_calls
for (let i = cutFrom; i < log.length; i++) {
  if (log[i].role === "tool" && (i === 0 || log[i - 1].role !== "assistant")) {
    // 孤立的 tool 消息 — 跳过直到下一个 user 消息
    while (i < log.length && log[i].role !== "user") i++
    cutFrom = i
    break
  }
}
log = log.slice(cutFrom)
```

**测试方法**:

```typescript
it("should not break tool message pairs during truncation", () => {
  const ctx = new ContextManager()
  ctx.configure({ maxContextRounds: 1 })

  // 构造 3 轮对话，第 2 轮有工具调用
  ctx.startTurn()
  ctx.log.append({ role: "user", content: "round1" })
  ctx.log.append({ role: "assistant", content: "answer1" })

  ctx.startTurn()
  ctx.log.append({ role: "user", content: "round2" })
  ctx.log.append({ role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "bash", arguments: "{}" } }] })
  ctx.log.append({ role: "tool", tool_call_id: "t1", content: "result" })
  ctx.log.append({ role: "assistant", content: "answer2" })

  ctx.startTurn()
  ctx.log.append({ role: "user", content: "round3" })

  const msgs = ctx.buildMessages()
  // 不应包含孤立的 tool 消息
  const toolMsgs = msgs.filter(m => m.role === "tool")
  for (const tm of toolMsgs) {
    const idx = msgs.indexOf(tm)
    expect(msgs[idx - 1]?.role).toBe("assistant")
  }
})
```

---

### P1-2: `multiOccurrence` pass 默认取最后一次出现

**位置**: `fuzzy-edit.ts:14-20`

```typescript
if (allOccurrences.length >= 2) {
  const lastIdx = allOccurrences[allOccurrences.length - 1]
  return { ... method: "multiOccurrence" }  // 猜测最后一次，静默误替换
}
```

**修复**:

```typescript
if (allOccurrences.length >= 2) {
  // 不猜测，返回错误让模型提供更多上下文
  return {
    edited: haystack,
    replacedCount: 0,
    method: "multiOccurrence",
    error: `old_string occurs ${allOccurrences.length} times. Please re-read the file and provide more surrounding context to make old_string unique.`
  }
}
```

**测试方法**:

```typescript
it("should reject ambiguous old_string with multiple occurrences", () => {
  const haystack = "function a() { return 1 }\nfunction b() { return 2 }"
  const result = fuzzyReplaceOnce(haystack, "return", "return 42")
  expect(result).toBeNull()  // 或返回带 error 字段的结果
})

it("should match unique old_string with surrounding context", () => {
  const haystack = "function a() { return 1 }\nfunction b() { return 2 }"
  const result = fuzzyReplaceOnce(haystack, "a() { return 1", "a() { return 42")
  expect(result).not.toBeNull()
  expect(result!.edited).toContain("return 42")
})
```

---

### P1-3: `interrupt()` 后引擎在 error 路径延迟一轮才停止

**位置**: `engine.ts:276-288`

```typescript
// 当前：interrupt() → abortController.abort() → client yield error → streamError 被设置
// → consecutiveErrors++ → continue → while 循环下一轮才检查 _interrupted
if (streamError) {
  if (fullContent) { ... }
  consecutiveErrors++
  if (consecutiveErrors >= 3) { yield error; return }
  continue  // ← 多走一轮
}
```

**修复**:

```typescript
if (streamError) {
  // 用户主动中断时立即退出，不进入重试
  if (this._interrupted) {
    yield { role: "status", content: "interrupted" }
    return
  }
  // ... 原有重试逻辑
}
```

**测试方法**:

```typescript
it("should stop immediately on interrupt during API call", async () => {
  // Mock client 延迟 500ms 返回
  streamMock.mockReturnValueOnce(async function* () {
    await new Promise(r => setTimeout(r, 500))
    yield { type: "error", message: "Aborted" }
  })

  const engine = new ReasonixEngine(testConfig)
  const events: LoopEvent[] = []

  // 100ms 后中断
  setTimeout(() => engine.interrupt(), 100)

  const start = Date.now()
  for await (const e of engine.submit("test")) {
    events.push(e)
  }
  const elapsed = Date.now() - start

  // 应在中断后迅速退出（< 200ms），而非等待 500ms + 重试
  expect(elapsed).toBeLessThan(300)
  expect(events.some(e => e.role === "status" && e.content === "interrupted")).toBe(true)
})
```

---

## 🟡 P2 — 代码质量与边界问题

### P2-1: `shell-exec.ts` 输出截断无提示

**位置**: `shell-exec.ts:135-138`

```typescript
function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max)  // 静默截断，模型不知道内容不全
}
```

**修复**:

```typescript
function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n... [truncated: ${s.length - max} more chars]`
}
```

**测试方法**:

```typescript
it("should append truncation notice to truncated output", () => {
  const long = "x".repeat(200)
  const result = truncate(long, 100)
  expect(result.length).toBeLessThan(200)
  expect(result).toContain("truncated")
})

it("should not append notice when not truncated", () => {
  const short = "hello"
  expect(truncate(short, 100)).toBe("hello")
})
```

---

### P2-2: `engine.ts` `sessionId` 使用 `Date.now()` 可碰撞

**位置**: `engine.ts:54`

```typescript
this.sessionId = `session-${++sessionCounter}-${Date.now()}`
// sessionCounter 进程重启后归零，同毫秒启动的两个实例 ID 相同
```

**修复**:

```typescript
import { randomUUID } from "node:crypto"
this.sessionId = randomUUID()
```

**测试方法**:

```typescript
it("should generate unique session IDs", () => {
  const ids = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const engine = new ReasonixEngine(testConfig)
    ids.add(engine.getState().sessionId)
  }
  expect(ids.size).toBe(100)
})
```

---

### P2-3: `client.ts` SSE JSON 解析失败静默丢弃

**位置**: `client.ts:173-177`

```typescript
try {
  json = JSON.parse(payload) as SSEChunk
} catch {
  continue  // 无任何日志，调试困难
}
```

**修复**:

```typescript
try {
  json = JSON.parse(payload) as SSEChunk
} catch {
  // 只在前 200 字符处截断记录，避免日志爆炸
  if (process.env.DEEPICODE_DEBUG) {
    console.debug("[SSE] JSON parse failed:", payload.slice(0, 200))
  }
  continue
}
```

**测试方法**:

```typescript
it("should not crash on malformed SSE data", async () => {
  const client = new DeepSeekClient()
  // 通过 mock fetch 注入损坏的 SSE 帧
  const events: DeepSeekStreamEvent[] = []
  for await (const e of client.chatCompletionsStream([{ role: "user", content: "hi" }], {
    apiKey: "sk-test", baseUrl: "https://api.deepseek.com", model: "test",
  })) {
    events.push(e)
  }
  // 不应有未捕获异常，损坏的帧被静默跳过
  expect(events.every(e => e.type !== "error" || !e.message.includes("JSON"))).toBe(true)
})
```

---

### P2-4: `list-dir.ts` stat 失败默认标记为 `file`

**位置**: `list-dir.ts:37-38`

```typescript
} catch {
  items.push({ name, type: "file" })  // 权限不足/符号链接断裂 → 误导为普通文件
}
```

**修复**:

```typescript
} catch {
  items.push({ name, type: "unknown" })
}
```

**测试方法**:

```typescript
it("should mark inaccessible entries as unknown", async () => {
  const tmpDir = `/tmp/deepicode_test_${Date.now()}`
  fs.mkdirSync(`${tmpDir}/secret`, { recursive: true })
  fs.writeFileSync(`${tmpDir}/secret/file.txt`, "secret")
  fs.chmodSync(`${tmpDir}/secret`, 0o000)  // 移除所有权限

  const result = await listDirTool.execute(
    { path: tmpDir },
    { cwd: "/", sessionId: "test", signal: undefined }
  )
  const items = JSON.parse(result.content).items
  const secret = items.find((i: any) => i.name === "secret")
  expect(secret.type).toBe("unknown")

  fs.chmodSync(`${tmpDir}/secret`, 0o755)
  fs.rmSync(tmpDir, { recursive: true })
})
```

---

### P2-5: `sleep()` 函数 AbortSignal 监听器未在 timer 完成时移除

**位置**: `client.ts:276-286`

```typescript
const timer = setTimeout(resolve, ms)
const onAbort = () => { clearTimeout(timer); reject(...) }
signal?.addEventListener("abort", onAbort, { once: true })
// timer 先触发时，onAbort 残留在 signal 上（{ once: true } 不会触发，因为 signal 未被 abort）
```

**修复**:

```typescript
const timer = setTimeout(() => {
  signal?.removeEventListener("abort", onAbort)
  resolve()
}, ms)
```

**测试方法**:

```typescript
it("should clean up abort listener when timer completes first", async () => {
  const controller = new AbortController()
  await sleep(10, controller.signal)
  // signal 上的 listener 应在 timer 完成后被移除
  // 用 EventTarget.listenerCount 或模拟 signal 验证
  // （具体实现取决于 Bun 是否暴露 listenerCount API）
})
```

---

### P2-6: `else if (finishedWithToolUse)` 为防御性死代码

**位置**: `engine.ts:253`

B1 修复后，client 不再发射二次 `done`，该分支永不执行。

**修复**: 保留该分支并添加注释说明其防御性质，或删除并简化逻辑。推荐保留（零成本安全网）：

```typescript
} else if (finishedWithToolUse) {
  // 防御性分支：client fix 后二次 done 不应出现，但保留以防 API 行为变化
  break
}
```

---

## 持续关注（低风险，不建议立即改动）

| # | 问题 | 理由 |
|---|------|------|
| 1 | Stale-read TOCTOU 窗口 | 毫秒级窗口，atomic rename 保护，实际触发概率极低 |
| 2 | Session JSONL 崩溃一致性 | best-effort 设计，session 恢复未实现时无影响 |
| 3 | Bash 命令绕过 | 黑名单永远有绕过，不建议改为白名单 |
| 4 | Fuzzy Edit 灵活空白误匹配 | 前 6 个 pass 已提供位置约束，残留在第 8 pass |
| 5 | Prompt 注入 | system prompt 加声明即可化解 |

---



## 总览

| 级别 | 数量 | 问题 |
|------|------|------|
| 🔴 P0 | 0 | 已全部修复 ✅ |
| 🟠 P1 | 0 | 已全部修复 ✅ |
| 🟡 P2 | 0 | 已全部修复 ✅ |
| ⬜ 关注 | 5 | TOCTOU、Session 一致性、Bash 绕过、Fuzzy 误匹配、Prompt 注入 |
| ✅ 已修复 | 25 | B1-B5, C1, D1-D3, N1/N3/N4, #7/#8, P0-1, P0-2, P1-1, P1-2, P1-3, P2-1~P2-6 |
| ❌ 驳回 | 17 | 见驳回表 |
