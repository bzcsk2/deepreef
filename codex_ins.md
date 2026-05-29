# Codex 验证说明（2026-05-29 更新）

以下验证项均在 `/vol4/Agent/deepicode` 执行通过。

## 1. 静态检查

```bash
bun run typecheck
```

结果：TypeScript 零错误 ✅。无跨仓库导入，`ToolResult` 以字符串写入 `ChatMessage.content`。

## 2. 单元测试

```bash
bun test
```

结果：20 pass / 3 skip / 0 fail ✅。context 测试、engine-tools 测试均通过。

## 3. CLI 基础行为

```bash
bun run dev --help    # 打印 help 后退出
printf '你好\n' | bun run dev  # 单轮请求
```

## 4. 工具调用回归测试

`packages/core/__tests__/engine-tools.test.ts` 已覆盖：
- `tool_start.toolCallIndex` 对应真实下标
- tool 消息 `content` 为字符串
- 工具返回 `isError: true` 时 `LoopEvent.role` 为 `error`，上下文带 `is_error: true`

## 5. codex 建议完成状态

| 建议 | 状态 | 说明 |
|------|------|------|
| 工具结果按声明顺序提交 | ✅ 已完成 | shared 并发执行后按 index 排序再提交 |
| assistant_final 事件 | ✅ 已完成 | interface + engine + TUI 均已接入 |
| reasoning_content 历史字段 | ✅ 已完成 | ChatMessage 字段 + round-trip + 单测 |
| prefix fingerprint 覆盖 toolSpecs/fewShots | ✅ 已完成 | cacheKey 三段组合，4 个单测覆盖 |
| 展示事件与协议事件分层 | ⏳ 待完成 | assistant_final 已落位，tool_progress 未实现 |

## 6. 后续架构建议

核心原则（不变）：
- 模型看到的历史必须稳定、可重放、协议正确。
- UI/CLI 可以更实时、更丝滑，但展示顺序不应破坏模型历史顺序。
- 工具并发是执行优化，不应改变 assistant.tool_calls 与 tool result 的协议配对。

仍不建议在本阶段引入：context fold、storm breaker、repair pipeline、完整 session persistence。
