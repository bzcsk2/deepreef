  经过对全部 30 个源文件的系统审查，发现以下问题，按严重程度排列:

  ---
  🔴 严重 Bug

  B1: done 事件重复发射导致工具调用轮循环提前终止

  client.ts 中同一轮 SSE 流会产生两个 done 事件:

  // client.ts:233-234 — finish_reason="tool_calls" 时发射第一次 done
  if (choice?.finish_reason) {
    yield { type: "done", finishReason: choice.finish_reason }
  }

  // client.ts:164-166 — [DONE] 标记时发射第二次 done，finishReason=null
  if (payload === "[DONE]") {
    yield { type: "done", finishReason: null }
    return
  }

  engine.ts:160-193 的 done case 中：
  - 第一个 done (finishReason="tool_calls") → 进入 if 分支，执行工具，break
  - 第二个 done (finishReason=null) → reason 变成 "stop"，isToolUse=false → 进入 else
  分支，直接 return 退出 submit()

  影响：工具调用完成后，引擎本该继续 while 循环让模型处理工具结果，但被第二个 done
  事件提前终止。当前测试没覆盖是因为 mock 只发射了一个 done。

  修复：client.ts 在已发射过 finish_reason done 后，不应再发射第二个 done，直接 return
   即可。

  ---
  B2: edit 工具无 write_file 功能——无法创建新文件

  edit 工具依赖 old_string 替换，无法创建新文件。packages/tools/src/index.ts 只导出
  createEditTool，没有 createWriteFileTool。

  ---
  🟡 中等 Bug

  B3: bash 工具 cwd 路径未基于 ctx.cwd 解析

  packages/tools/src/shell-exec.ts:48:
  const cwd = typeof args.cwd === "string" ? args.cwd : ctx.cwd

  用户提供的 cwd 被直接使用，未通过 resolve(ctx.cwd, args.cwd) 解析。read_file 和 edit
   工具正确使用了 resolve(ctx.cwd, args.path)，但 bash 工具遗漏了。

  ---
  B4: hashAnchoredReplaceOnce 临时文件并发碰撞

  packages/tools/src/hash-edit.ts:25:
  const tmpPath = `${filePath}.deepicode_tmp_${Date.now()}`

  同时钟毫秒内同文件两次编辑会碰撞。应加随机后缀或使用 crypto.randomUUID()。

  ---
  B5: fuzzyReplaceOnce 正则模式可能匹配到错误位置

  packages/tools/src/fuzzy-edit.ts:37-42 中，flexible_whitespace 正则替换用 \s+
  替代所有空白，但若 needle 包含正则特殊字符（被 escapeRegExp
  转义），转义产生的反斜杠和原文字符组合可能产生非预期的匹配。例如 needle 含
  \n（字面量），escaping 后变 \\n，然后空白替换产生意外效果。

  ---
  🟠 功能/实现遗漏

  C1: 缺少关键工具 — list_dir / grep / write_file

  当前工具集只有 read_file、edit、bash。缺少：
  - list_dir — 目录列表（只能用 bash ls 代替但非结构化）
  - grep — 内容搜索（模型无法高效搜索代码库）
  - write_file — 创建新文件

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

  packages/tools/src/edit.ts 和 packages/tools/src/file-ops.ts 中几乎相同，仅
  file-ops.ts 多了 known_hosts。应提取到共享模块。

  D2: known_hosts 保护未在 edit 中生效

  file-ops.ts 的敏感文件列表包含 known_hosts，但 edit.ts 没有。

  D3: engine.ts:70 getState() 硬编码 streamingMessage: "" 和 isStreaming: false

  这些值从不更新，getState() 返回的 AgentState 不反映实际 streaming 状态。

  D4: ImmutablePrefix.computeFingerprint 中空 messages 数组产生空哈希

  如果 build() 调用时 systemPrompt 为空字符串，生成的 prefix 只有一条空 content 的
  system 消息，hash 仍能生成但可能与其他空 system prompt 实例相同。实际不导致问题。

  D5: buildPiModel 导入了未使用的 vendor/pi.d.ts 类型

  config.ts 导入了 Model 类型用于 buildPiModel 返回值，但该函数在 engine.ts
  中并未被调用。这是死代码——ReasonixEngine 直接使用 DeepSeekClient 而非 pi-ai。

  ---
  优先级建议

  ┌────────┬──────────────────┬───────────────────────────────────────────────────┐
  │ 优先级 │       问题       │                       理由                        │
  ├────────┼──────────────────┼───────────────────────────────────────────────────┤
  │ P0     │ B1: done         │ 工具调用循环实际会断掉，当前只在单轮/无工具 mock  │
  │        │ 事件重复         │ 中看不出来                                        │
  ├────────┼──────────────────┼───────────────────────────────────────────────────┤
  │ P0     │ B2: 缺少         │ 创建新文件是基本需求                              │
  │        │ write_file       │                                                   │
  ├────────┼──────────────────┼───────────────────────────────────────────────────┤
  │ P1     │ B3: cwd 不解析   │ 相对路径在 bash 工具中行为不一致                  │
  ├────────┼──────────────────┼───────────────────────────────────────────────────┤
  │ P1     │ C1: 缺少         │ 模型无法高效导航代码库                            │
  │        │ list_dir/grep    │                                                   │
  ├────────┼──────────────────┼───────────────────────────────────────────────────┤
  │ P2     │ B4, B5           │ 边界情况，低概率触发                              │
  ├────────┼──────────────────┼───────────────────────────────────────────────────┤
  │ P3     │ D1-D5, C2-C6     │ 代码质量和未完成功能                              │
  └────────┴──────────────────┴───────────────────────────────────────────────────┘