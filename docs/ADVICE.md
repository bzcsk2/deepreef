这个项目的TUI的两个问题（TUI流式显示缩进不统一，正在思考的内容和思考完毕后缩进不同 ，loop模式下work的工作过程消息会被冲刷掉会消失）

我看的是当前仓库源码，结论是：这两个问题不是同一个层级的问题。第一个是**渲染组件结构不一致**；第二个是 **loop/workflow 模式下“过程信息”有一部分没有被当作 transcript 持久消息处理，而是被当作实时状态面板/临时 round 状态处理**。

## 1. 流式 thinking 和结束后的 thinking 缩进不一致

根因在 `packages/tui/src/DeepiMessages.tsx`。

`AssistantThinkingMessage` 里，`isStreaming === true` 时直接返回 `StreamingCard`：

```tsx
if (isStreaming) {
  return <StreamingCard text={text} startTs={startTs} title={`${roleTitle(role)} · ${t().thinking}`} />;
}
```

而思考结束后，则走另一套结构：`RoleTag` + `Text("  ∴ Thinking")` + `<Box paddingLeft={2}><Markdown /></Box>`。这意味着“正在思考”和“思考完毕”不是同一个外壳，只是显示同一种语义内容。

`StreamingCard` 本身又是 `Card -> CardHeader -> Markdown`，正文 Markdown 直接挂在 Card 下面，没有复用非流式 thinking 的 `RoleTag`、`paddingX={1}`、`paddingLeft={2}` 这些布局约定。 Card 组件本身也只提供 `marginTop={1}` 和 `width="100%"`，不提供统一正文缩进。

同样的问题也出现在 assistant 正文：流式 assistant text 走 `StreamingCard`，非流式 assistant text 走 `AssistantTextMessage`；后者有自己的 header/body row，并在正文前放了一个 `minWidth={2}` 的 spacer。

所以第一个问题的根因不是 Markdown 渲染器，也不是 stream batcher，而是：

**同一种消息在 streaming 和 finalized 两种状态下使用了不同的 React/Ink 布局树。**

修复方向很明确：不要让 `isStreaming` 决定外层布局，只让它决定 header 上是否有 spinner、elapsed time、光标。可以抽一个统一的 `MessageShell` 或 `ReasoningBlock`：

```tsx
function AssistantThinkingMessage({ text, isStreaming, startTs, expanded, role }) {
  if (!text) return null;

  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <RoleTag role={role} />
      <Box flexDirection="row">
        <Text color={TONE.warn} bold>{`  ∴ ${t().thinking}`}</Text>
        {isStreaming ? <Spinner kind="braille" color={TONE.brand} /> : <Text dimColor>{t().ctrlO}</Text>}
      </Box>
      <Box paddingLeft={2}>
        <Markdown text={text} />
        {isStreaming ? <Text color={TONE.ok}>{'▊'}</Text> : null}
      </Box>
    </Box>
  );
}
```

同时建议去掉这类写死在字符串里的空格：

```tsx
`  ∴ ${t().thinking}`
```

改成 `Box paddingLeft / minWidth / gap` 之类的结构化缩进。现在这些空格和外层 `paddingX/paddingLeft` 叠在一起，很容易在不同组件路径下产生视觉偏移。



问题 1 的根因不是“Markdown 自身缩进不稳定”，而是 **streaming 态和 finalized 态使用了两套不同的消息外壳布局**，导致正文起始列不同。

具体对齐关系是：

| 状态                       | 组件路径                                                                              | 正文额外缩进 |
| ------------------------ | --------------------------------------------------------------------------------- | -----: |
| streaming thinking       | `AssistantThinkingMessage -> StreamingCard -> Card -> Markdown`                   |  约 0 列 |
| finalized thinking 展开态   | `AssistantThinkingMessage -> Box paddingX={1} -> Box paddingLeft={2} -> Markdown` |  约 3 列 |
| finalized assistant text | `AssistantTextMessage -> Box paddingX={1} -> minWidth={2} -> Markdown`            |  约 3 列 |

源码上可以直接看到：`AssistantThinkingMessage` 在 `isStreaming` 时直接返回 `StreamingCard`，没有经过 finalized thinking 的 `paddingX={1}` 和 `paddingLeft={2}` 布局。 而 finalized thinking 展开态外层有 `paddingX={1}`，正文再包一层 `paddingLeft={2}`。

`AssistantTextMessage` 也是类似，它本身有 `paddingX={1}`，正文行里还有 `<Box minWidth={2} />`，所以正文相对组件起点多了 3 列。

而 `StreamingCard` 内部确实是 `<Card>` 之后直接渲染 `<Markdown text={text} />`，没有给正文加 `paddingX` 或 `paddingLeft`。 `Card` 自己也只设置 `flexDirection="column" marginTop={1} width="100%"`，没有 padding。

唯一需要补一句：最外层 `DeepiMessages` 对整个 timeline 统一有 `paddingX={1}`，所以这里说的 “0 列 vs 3 列” 是**组件内部相对缩进差**，不是终端绝对列号。

所以你的判断是对的：**StreamingCard 的 body 是 0 额外缩进，非流式 AssistantText/Thinking 的正文是 3 列额外缩进，这就是视觉不统一的直接根因。**


## 2. loop 模式下 work 工作过程消息会被冲刷掉、消失




### loop 中 Worker 的 assistant/tool/reasoning 输出本身

那根因在 `bridge.tsx` 的 workflow 路径。普通 submit 有一套相对完整的 round 生命周期：`startRound()` 初始化，`finalizeRound()` 把 assistant/reasoning 设为 `isStreaming:false`，并在 `tools_completed` 时 finalize 后开启新 round。

但 workflow/loop 走的是另一套 `driveWorkflow()` 内部实现。每次收到 `phase_change`，它会直接生成新的 `wfRoundId`，重置 `assistantText`、`reasoningText`、`toolItemIds`、`toolCallArgs`、`toolOutputs`。 随后的 `assistant_delta`、`assistant_final`、`reasoning_delta` 都写入这个当前 `wfRoundId`。

问题是 workflow 路径没有一个和普通 submit 等价的 `finalizeWorkflowRound()`。在 `finally` 里，它只是把 TUI 状态恢复成 idle/loading false/reasoningActive false，没有统一把当前 workflow round 的 streaming item finalize。

这会导致两类现象：

第一，phase 切换时，如果上一个 worker/supervisor round 还有未完全落盘或仍处于 streaming 状态的内容，局部缓存会被重置，显示上就像被下一阶段“冲掉”。

第二，workflow 路径和普通 submit 路径维护了两套近似逻辑，普通路径有 `finalizeRound()`，workflow 路径没有对应的统一收口，因此 loop 模式更容易出现消息生命周期不完整的问题。

修复方向：

```tsx
const finalizeWorkflowRound = () => {
  if (!wfRoundId) return;

  if (assistantText) {
    upsertWorkflowItem({
      id: wfRoundId + '-text',
      kind: 'assistant_text',
      roundId: wfRoundId,
      text: assistantText,
      isStreaming: false,
      startTs: wfRoundTs,
      role: activeRole,
    });
  }

  if (reasoningText) {
    upsertWorkflowItem({
      id: wfRoundId + '-reasoning',
      kind: 'reasoning',
      roundId: wfRoundId,
      text: reasoningText,
      isStreaming: false,
      startTs: wfRoundTs,
      role: activeRole,
    });
  }
};
```

然后在两个地方调用：

```tsx
// phase_change 里，重置 wfRoundId 之前
finalizeWorkflowRound();

// finally 里，恢复 idle 之前
finalizeWorkflowRound();
```

更好的做法是不要让 workflow 路径复制普通 submit 的 round 管理逻辑，而是把普通 submit 里的 `startRound/finalizeRound/upsertTool/ensureAssistant/ensureReasoning` 抽成一个 `TimelineRoundWriter`，普通对话和 loop workflow 共用它。

## 我认为最核心的两个改动

第一，**统一消息外壳**。`StreamingCard` 不应该成为 thinking/assistant 的另一套布局。它应该退化成“统一消息外壳里的 streaming header/body 状态”，否则缩进永远会在 streaming/final 两套模板之间漂移。

第二，**把 loop 的 Worker 过程从“状态面板”升级为“持久事件流”**。现在 worker activity 一部分在 `OrchestrationStore`，一部分在 workflow bridge 的临时 round 变量里；前者不进入 transcript，后者没有完整 finalize 生命周期。要么全部进入 timeline，要么至少 workflow round 有完整 finalize，并且 activities 真正接到 `AgentProgressDisplay`。
