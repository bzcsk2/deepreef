  经过对全部 30 个源文件的系统审查，发现以下问题，按严重程度排列:

  ---
   🔴 严重 Bug — 全部已修复 ✅

   B1: done 事件重复发射导致工具调用轮循环提前终止
   ✅ 已修复（commit 794d414）：
   - client.ts: 增加 finishReasonYielded 标记，[DONE] 时不重复发射
   - engine.ts: 增加 finishedWithToolUse 防御，第二个 done 直接跳过

  ---
   B2: edit 工具无 write_file 功能——无法创建新文件
   ✅ 已修复（commit 794d414）：新增 packages/tools/src/write-file.ts

  ---
   🟡 中等 Bug — 全部已修复 ✅

   B3: bash 工具 cwd 路径未基于 ctx.cwd 解析
   ✅ 已修复（commit 794d414）：增加 resolve(ctx.cwd, args.cwd)

  ---
   B4: hashAnchoredReplaceOnce 临时文件并发碰撞
   ✅ 已修复（commit d76f3c0）：Date.now() → crypto.randomUUID()

  ---
   B5: fuzzyReplaceOnce 正则模式可能匹配到错误位置
   ✅ 已修复（commit d76f3c0）：改为 split(/\s+/) 分段转义后 join('\\s+')

  ---
   🟠 功能/实现遗漏

   C1: 缺少关键工具 — list_dir / grep / write_file
   ✅ 已修复（commit 794d414）：
   - write_file: packages/tools/src/write-file.ts
   - list_dir: packages/tools/src/list-dir.ts
   - grep: packages/tools/src/grep.ts

  C2: Session 恢复未实现 (TODO #12)

  JSONL 写入可工作但不可恢复。session.ts 只有写路径没有读路径。

  C3: Token 估算完全缺失 (TODO #11)

  没有 tokenizer worker pool，没有 fold 决策。长会话会静默超出 DeepSeek
  上下文窗口导致不可预期的截断或错误。

  C4: 9-Pass Fuzzy Edit 只实现了 4 pass (TODO #8)

  fuzzy-edit.ts 只有 exact、trimmed_full、trimmed_lines、flexible_whitespace 四个
  pass。缺少
  blockAnchor、escapeNormalized、trimmedBoundary、contextAware、multiOccurrence 五个
  pass。

  C5: 事件体系分层未实现 (TODO #9)

  tool_progress 事件未实现，协议事件和展示事件混在一起。

  C6: SSE 解析分片边界无测试 (TODO #14)

  没有任何测试覆盖 SSE chunk 被任意切分的情况。

  ---
  🔵 代码改进建议

   D1: SENSITIVE_FILE_PATTERNS 重复定义
   ✅ 已修复（commit d76f3c0）：提取到 packages/tools/src/sensitive.ts

   D2: known_hosts 保护未在 edit 中生效
   ✅ 已修复（commit 794d414）：edit.ts 补上 known_hosts 模式

   D3: engine.ts:70 getState() 硬编码 streamingMessage: "" 和 isStreaming: false
   ✅ 已修复（commit d76f3c0）：改为参数化接口 getState(isStreaming, streamingMessage, pendingToolCalls)

  D4: ImmutablePrefix.computeFingerprint 中空 messages 数组产生空哈希

  如果 build() 调用时 systemPrompt 为空字符串，生成的 prefix 只有一条空 content 的
  system 消息，hash 仍能生成但可能与其他空 system prompt 实例相同。实际不导致问题。

  D5: buildPiModel 导入了未使用的 vendor/pi.d.ts 类型

  config.ts 导入了 Model 类型用于 buildPiModel 返回值，但该函数在 engine.ts
  中并未被调用。这是死代码——ReasonixEngine 直接使用 DeepSeekClient 而非 pi-ai。

  ---
  🟣 第二轮深度审查 — 新发现隐患

  N1: 上下文无界增长引发会话”硬终止”

  - 📍 影响位置：packages/core/src/context/append-log.ts
  - AppendOnlyLog 没有任何裁剪机制，对话历史只追加不缩减。随着对话轮次增加，token 消耗线性增长。当累积 messages 超过 DeepSeek API 上下文窗口时，API 返回 400 context_length_exceeded。
  - 关键链路：AppendOnlyLog append → messages 无限膨胀 → API 400 → client.ts:118 400 ∉ retryableStatuses → 不可重试 → engine.ts 收到 error → consecutiveErrors ≥ 3 → Agent Loop 终止。
  - 用户唯一恢复手段是重启整个会话（丢失全部历史）。

  解决办法：
  1. 短期（无需 tokenizer）：在 buildMessages() 中做粗粒度截断——保留 system message + 最近 N 条 user/assistant 消息对（如最近 20 轮），超出部分直接丢弃。N 可配置，默认值基于 DeepSeek V4 128K 窗口的安全余量估算。
  2. 长期（配合 C3）：接入 Tokenizer Worker Pool，实现精确 token 计数 + 65%/75%/80% 三级 Fold 决策（设计文档 §3.3）。Fold 时由 LLM 对归档区做结构化压缩，而非粗暴截断。

  ---

  N2: 工具输出中的非 UTF-8 乱码污染模型判断

  - 📍 影响位置：packages/tools/src/shell-exec.ts:48 / file-ops.ts:69
  - bash 工具中 `String(b)` 对非 UTF-8 二进制输出会产生乱码（� 替换字符）而非报错。这些乱码被 JSON.stringify 包装后写回上下文，模型看到乱码内容可能做出错误判断。
  - 注：streaming-executor.ts:79-95 已有 try-catch 包裹 handler.execute()，所以 JSON.stringify 即使抛异常（极罕见：仅在 Bun 遇到 Proxy/BigInt 等特殊对象时发生）也会被转为 ToolResult error，不会导致 Agent Loop 崩溃。真正风险是**静默乱码**而非崩溃。

  解决办法：
  1. 在 shell-exec.ts 的 `String(b)` 之后增加 UTF-8 有效性检测：如果 stdout/stderr 包含大量替换字符（� 占比 > 5%），在返回的 JSON 中附加 `”encoding_warning”: “output contains non-UTF-8 binary data”` 字段，提醒模型忽略乱码内容。
  2. 对所有工具的 `JSON.stringify(out)` 调用统一替换为 safeStringify 工具函数，内部做 try-catch + 超长截断（超出 200K 字符时截断并附加 truncation 提示）。

  ---

  N3: hash-edit.ts 异常路径下的临时文件泄漏

  - 📍 影响位置：packages/tools/src/hash-edit.ts:25-75
  - 编辑操作在流式写入 tmpPath 期间，如果 createReadStream 或 createWriteStream 中途抛出 IO 异常（磁盘满、权限变更、管道断裂），函数在 return 或 throw 之前没有清理已创建的 tmpPath 文件。
  - 注：hashAnchoredReplaceOnce 函数签名不接受 AbortSignal，所以 Abort 不会直接中断流式写入（原文档描述有误）。真正的泄漏触发场景是**流式 IO 中途异常**。

  解决办法：
  在 hashAnchoredReplaceOnce 中，用 try-finally 包裹整个流式写入逻辑。finally 块中检查 tmpPath 是否存在，存在则 unlink：

  ```
  let tmpCreated = false
  try {
    // createWriteStream → tmpCreated = true
    // ... streaming write + rename
    // rename 成功后 tmpCreated = false（旧路径已不存在）
  } finally {
    if (tmpCreated) await unlink(tmpPath).catch(() => {})
  }
  ```

  同时，write-file.ts（如果未来有）也应该遵循同样的 try-finally 模式。

  ---

  N4: stale-read.ts 全局状态跨会话污染

  - 📍 影响位置：packages/tools/src/stale-read.ts:8
  - `const track = new Map<string, ReadRecord>()` 是模块级全局单例，生命周期随整个进程。clearReadTracker() 已定义但无任何调用点。Session A 读取过的文件记录会残留到 Session B，导致新会话中产生错误的”文件已过期”判定，强迫 Agent 做不必要的 re-read。

  解决办法：
  1. 短期（最小改动）：在 engine.ts 的 constructor 或 submit() 入口调用 clearReadTracker()，确保每次新建引擎/会话时清理旧记录。
  2. 长期（正确架构）：将 ReadTracker 改为实例化类，由 ReasonixEngine 在 constructor 中创建并注入到工具工厂。工具通过 ctx 访问该会话专属的 tracker 实例，而非模块级全局变量。

  ```typescript
  // stale-read.ts 改为
  export class ReadTracker {
    private track = new Map<string, ReadRecord>()
    recordRead(absPath: string, mtimeMs: number, size: number): void { ... }
    checkStale(absPath: string): Promise<{ isStale: boolean; message?: string }> { ... }
    clear(): void { this.track.clear() }
  }

  // engine.ts constructor 中
  this.readTracker = new ReadTracker()
  // 工具创建时注入: createReadFileTool(this.readTracker)
  ```

  ---
  优先级总览

  ┌────────┬────────────────────────┬───────────────────────────────────────────────────┐
  │  状态  │         问题           │                     备注                           │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ B1: done 事件重复      │ 794d414                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ B2: 缺少 write_file    │ 794d414                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ B3: bash cwd 不解析    │ 794d414                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ C1: list_dir/grep      │ 794d414                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ B4: 临时文件碰撞       │ d76f3c0                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ B5: fuzzy regex 交叉   │ d76f3c0                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ✅ 已修 │ D1-D3                  │ d76f3c0                                            │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ 🔴 P0   │ N1: 上下文无界增长     │ 长会话必然触发，需短期截断方案                      │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ 🟡 P1   │ N4: stale-read 全局污染│ 跨会话误报，建议短期 clear + 长期实例化             │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ 🟡 P1   │ N3: 临时文件泄漏       │ 异常路径下泄漏，需 try-finally                      │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ 🟢 P2   │ N2: 非UTF-8乱码       │ 低概率触发但后果隐蔽，建议加编码检测                 │
  ├────────┼────────────────────────┼───────────────────────────────────────────────────┤
  │ ⬜ 未修 │ D4-D5, C2-C6           │ 待后续迭代                                          │
  └────────┴────────────────────────┴───────────────────────────────────────────────────┘