# Deepreef TUI 长时间运行变卡问题整改方案

## 一、问题目标

请优化 Deepreef TUI 在长时间会话、长时间 workflow、长时间流式输出后的卡顿问题。

当前问题不应简单定性为传统“内存泄漏”，更准确的描述是：

```text
TUI 缺少历史窗口化和数据保留上限，导致 transcript/timeline 在长时间会话中无界增长；同时 UI 每次变更仍存在全量投影、全量遍历和全量渲染路径，最终造成内存占用上升、GC 压力增大、Ink/React reconcile 成本上升、Markdown 渲染成本上升，表现为 TUI 越跑越卡。
```

本次整改只处理 **TUI 显示层和 bridge runtime 层的历史数据保留与渲染性能**。不要修改 core 的模型上下文、任务逻辑、workflow phase 状态机、工具权限逻辑。

核心原则：

1. 不裁剪 core engine 的模型上下文。
2. 不影响 session 持久化。
3. 不丢失当前正在流式输出的消息、reasoning、tool。
4. 不破坏 worker/supervisor reasoning 的历史显示结构。
5. 不破坏用户正在交互的 permission/question prompt。
6. 优先解决 TUI 长时间运行卡顿，而不是做复杂的全局重构。

---

## 二、当前风险点

### 1. TranscriptStore 无界增长

当前 `TranscriptStore` 内部维护：

```ts
order: string[]
entries: Map<string, TimelineItem>
liveTouchedIds: Set<string>
entryRevision: Map<string, number>
```

这些结构会随着 TUI timeline 增长而持续增长。

新增 message、assistant text、reasoning、tool 时，会向 `order` 和 `entries` 追加条目；`markLiveTouch()` 又会同步增加 `liveTouchedIds` 和 `entryRevision`。

这会导致：

```text
会话越长 -> order 越长 -> entries 越多 -> liveTouchedIds 越多 -> entryRevision 越多
```

### 2. Timeline 投影存在 O(n) 路径

`TranscriptStore.toTimelineItems()` 会按 `order` 全量 map：

```ts
return this.order.map(id => this.entries.get(id)!);
```

`transcriptToTimeline()` 又会遍历所有 timeline item，进行缓存复用、active id 收集和缓存清理。

这意味着每次 store version 变化后，UI 订阅层仍然要处理完整 timeline。

### 3. DeepiMessages 全量渲染 timeline

`DeepiMessages` 当前使用：

```tsx
timeline.map(item => <MessageBlock key={item.id} item={item} expanded={expanded} />)
```

timeline 越长，每次 render 的元素创建、React reconcile、Ink layout、Markdown 处理成本都会上升。

### 4. BridgeState 的 warnings / messageQueue 也缺少明确上限

`warnings` 当前是 append 形式：

```ts
warnings: [...prev.warnings, warning]
```

`messageQueue` 也可能 append 用户输入：

```ts
messageQueue: [...prev.messageQueue, text]
```

这些不是主要瓶颈，但应该同步加上限，避免极端情况下无界增长。

---

## 三、不要做的错误修复

不要简单粗暴地做：

```ts
order.splice(0, overflow)
```

原因：

1. 可能裁掉当前正在 streaming 的 reasoning。
2. 可能裁掉正在 running 的 tool。
3. 可能破坏同一个 round 内 assistant / reasoning / tool 的关系。
4. 可能破坏 hydration merge 对 liveTouchedIds 的保护。
5. 可能让用户正在看的上下文突然消失。
6. 可能导致 TranscriptReader 的 cache 和 store 状态不一致。

也不要直接清空所有历史：

```ts
transcriptStore.replaceAll([])
```

这会破坏用户体验，也会让 TUI 像“丢消息”。

正确方向是：

```text
做 UI 层的 round-aware trim + bridge 数组上限 + 渲染窗口化 + 性能指标。
```

---

## 四、整改优先级

建议分四个阶段做。

```text
P0：加监控指标，先能看见数据规模
P1：限制 warnings / messageQueue 等低风险数组
P2：实现 TranscriptStore round-aware trim
P3：实现 DeepiMessages 渲染窗口化
P4：补测试，防止裁剪破坏 streaming / round 结构
```

P1 和 P2 是直接止血。P3 是真正改善长 timeline 渲染卡顿的关键。P0 和 P4 用来防回归。

---

# P0：增加 TUI 数据规模指标

## 目标

开发态能看到以下指标：

```text
transcript.order.length
transcript.entries.size
transcript.liveTouchedIds.size
transcript.entryRevision.size
reader.itemCache.size
timeline.length
warnings.length
messageQueue.length
```

## 修改文件

优先修改：

```text
packages/tui/src/store/transcript-store.ts
packages/tui/src/store/transcript-reader.ts
packages/tui/src/store/bridge-runtime.ts
```

## TranscriptStore 增加 stats 方法

在 `TranscriptStore` 中增加：

```ts
export interface TranscriptStoreStats {
  orderLength: number;
  entriesSize: number;
  liveTouchedSize: number;
  entryRevisionSize: number;
  version: number;
}

getStats(): TranscriptStoreStats {
  return {
    orderLength: this.order.length,
    entriesSize: this.entries.size,
    liveTouchedSize: this.liveTouchedIds.size,
    entryRevisionSize: this.entryRevision.size,
    version: this.version,
  };
}
```

## TranscriptReader 增加 cache stats

在 `TranscriptReader` 中增加：

```ts
export interface TranscriptReaderStats {
  cachedTimelineLength: number;
  cachedVersion: number;
  itemCacheSize: number;
}

getStats(): TranscriptReaderStats {
  return {
    cachedTimelineLength: this.cachedTimeline.length,
    cachedVersion: this.cachedVersion,
    itemCacheSize: this.itemCache.size,
  };
}
```

## BridgeRuntime 增加轻量 stats

在 `BridgeRuntime` 中增加方法：

```ts
getStats(): {
  warningsLength: number;
  messageQueueLength: number;
} {
  return {
    warningsLength: this.feedback.getSnapshot().warnings.length,
    messageQueueLength: this.promptQueue.getSnapshot().messageQueue.length,
  };
}
```

如果 `SubscribeStore` 没有 `getSnapshot()`，使用现有读取方法；不要为此大改 store 架构。

---

# P1：限制 warnings 和 messageQueue

## 目标

低风险地阻止 bridge 反馈队列无界增长。

## 常量建议

新增常量位置可以放在 `bridge.tsx` 或 `bridge-runtime.ts` 附近：

```ts
const MAX_WARNINGS = 100;
const MAX_MESSAGE_QUEUE = 50;
```

## 限制 warnings

把所有：

```ts
warnings: [...prev.warnings, warning]
```

改为：

```ts
warnings: [...prev.warnings, warning].slice(-MAX_WARNINGS)
```

如果 warnings 需要去重，可以额外做：

```ts
const nextWarnings = [...prev.warnings, warning].slice(-MAX_WARNINGS);
return { warnings: nextWarnings };
```

不要吞掉非 tool-loop warning。之前已经隐藏 tool-loop notice 的逻辑应保留。

## 限制 messageQueue

当前 messageQueue 可能在 running 时继续追加。建议封装 helper：

```ts
function appendBoundedQueue(queue: string[], text: string): string[] {
  return [...queue, text].slice(-MAX_MESSAGE_QUEUE);
}
```

然后把：

```ts
messageQueue: [...prev.messageQueue, text]
```

改成：

```ts
messageQueue: appendBoundedQueue(prev.messageQueue, text)
```

如果队列满时不想静默丢弃最旧输入，可以选择更严格策略：

```ts
if (prev.messageQueue.length >= MAX_MESSAGE_QUEUE) {
  return {
    warnings: [...prev.warnings, 'Message queue is full; oldest queued input was dropped.'].slice(-MAX_WARNINGS),
    messageQueue: [...prev.messageQueue.slice(1), text],
  };
}
```

建议第一版采用“丢最旧 + warning”策略。

---

# P2：实现 TranscriptStore round-aware trim

## 目标

对 TUI transcript 做安全裁剪，避免 `order / entries / liveTouchedIds / entryRevision` 无界增长。

注意：这只裁剪 **TUI transcript store**，不是裁剪 core engine 的对话上下文，也不是裁剪 session 文件。

## 建议上限

第一版建议：

```ts
const DEFAULT_MAX_TRANSCRIPT_ENTRIES = 1200;
const DEFAULT_MIN_PRESERVE_TAIL_ENTRIES = 300;
```

解释：

* `maxEntries = 1200`：超过后开始裁剪。
* `preserveTailEntries = 300`：至少保留尾部最近 300 条，避免刚发生的上下文被裁掉。
* 如果 workflow 很长，可后续改成可配置环境变量。

例如：

```ts
const DEFAULT_TRANSCRIPT_TRIM_LIMITS = {
  maxEntries: 1200,
  preserveTailEntries: 300,
};
```

## 新增 trim options 类型

在 `transcript-store.ts` 增加：

```ts
export interface TranscriptTrimOptions {
  maxEntries: number;
  preserveTailEntries: number;
}
```

## 新增 public 方法

在 `TranscriptStore` 中增加：

```ts
trimToLimit(options: TranscriptTrimOptions): number {
  const { maxEntries, preserveTailEntries } = options;

  if (maxEntries <= 0) return 0;
  if (this.order.length <= maxEntries) return 0;

  const preserveTail = Math.max(0, Math.min(preserveTailEntries, this.order.length));
  const hardCutoffIndex = Math.max(0, this.order.length - preserveTail);

  const removableIds: string[] = [];

  for (let i = 0; i < hardCutoffIndex; i++) {
    const id = this.order[i];
    const entry = this.entries.get(id);
    if (!entry) {
      removableIds.push(id);
      continue;
    }

    if (!this.canTrimEntry(entry)) {
      continue;
    }

    removableIds.push(id);

    if (this.order.length - removableIds.length <= maxEntries) {
      break;
    }
  }

  if (removableIds.length === 0) return 0;

  const removeSet = new Set(removableIds);
  this.order = this.order.filter(id => !removeSet.has(id));

  for (const id of removeSet) {
    this.entries.delete(id);
    this.liveTouchedIds.delete(id);
    this.entryRevision.delete(id);
  }

  this.bump();
  return removeSet.size;
}
```

## 新增 canTrimEntry

在 `TranscriptStore` 内新增私有方法：

```ts
private canTrimEntry(entry: TimelineItem): boolean {
  switch (entry.kind) {
    case 'assistant_text':
    case 'reasoning':
      return entry.isStreaming !== true;

    case 'tool':
      return entry.tool.status !== 'running';

    case 'message':
      return true;
  }
}
```

## 更安全的 round-aware 版本

上面的版本是 entry-aware。更推荐做 round-aware，避免裁剪掉一个 round 的一半。

实现思路：

1. 根据 `roundId` 聚合 timeline item。
2. 没有 `roundId` 的 message 独立成组。
3. 从最旧的 group 开始裁。
4. 如果 group 内存在 streaming reasoning / assistant 或 running tool，则整个 group 不裁。
5. 至少保留尾部 `preserveTailEntries`。

可以实现 helper：

```ts
private getTrimGroupId(id: string, entry: TimelineItem | undefined): string {
  if (!entry) return `missing:${id}`;
  if ('roundId' in entry) return `round:${entry.roundId}`;
  return `entry:${id}`;
}
```

再构建 group：

```ts
const groups: Array<{ groupId: string; ids: string[]; startIndex: number }> = [];
const groupById = new Map<string, { groupId: string; ids: string[]; startIndex: number }>();

for (let i = 0; i < hardCutoffIndex; i++) {
  const id = this.order[i];
  const groupId = this.getTrimGroupId(id, this.entries.get(id));
  let group = groupById.get(groupId);
  if (!group) {
    group = { groupId, ids: [], startIndex: i };
    groupById.set(groupId, group);
    groups.push(group);
  }
  group.ids.push(id);
}
```

判断 group 是否可裁：

```ts
private canTrimGroup(ids: string[]): boolean {
  for (const id of ids) {
    const entry = this.entries.get(id);
    if (entry && !this.canTrimEntry(entry)) return false;
  }
  return true;
}
```

然后按 group 删除。

推荐第一版实现 round-aware，不要只按单条 entry 裁。

## trim 调用时机

在以下写入路径末尾调用：

```ts
appendMessage
ensureTextPart
upsertAssistantText
upsertReasoning
upsertTool
upsertItem
replaceAll
mergeHydration
```

不要在 `appendPartDelta()` 每个 chunk 都 trim。流式每个 chunk 都 trim 会增加开销。

建议方式：

* 新增 `maybeTrimAfterStructuralChange()`。
* 只在新增条目或全量替换后调用。
* 对 `appendPartDelta()`、`setTextPart()`、`finalizePart()` 不调用 trim。

示例：

```ts
private trimOptions: TranscriptTrimOptions = {
  maxEntries: 1200,
  preserveTailEntries: 300,
};

private maybeTrimAfterStructuralChange(): void {
  this.trimToLimit(this.trimOptions);
}
```

但要注意：`trimToLimit()` 内部会 `bump()`，如果外部方法也会 `bump()`，可能导致重复通知。

更好的方式：

```ts
private trimToLimitInternal(options: TranscriptTrimOptions): number {
  // 执行删除，但不 bump
}

private bumpAfterMutation(): void {
  this.trimToLimitInternal(this.trimOptions);
  this.bump();
}
```

然后把新增结构的方法中原来的 `this.bump()` 改成 `this.bumpAfterMutation()`。

第一版也可以接受重复 bump，但不优雅。

## 不要裁剪 liveTouchedIds 的语义

删除 entry 时必须同步：

```ts
this.liveTouchedIds.delete(id);
this.entryRevision.delete(id);
```

否则即使 entries 已删，liveTouchedIds 和 entryRevision 也会继续增长。

## 需要暴露设置入口

可以先硬编码默认值。后续再从环境变量读取：

```ts
DEEPCODE_TUI_MAX_TRANSCRIPT_ENTRIES=1200
DEEPCODE_TUI_PRESERVE_TAIL_ENTRIES=300
```

第一版不强制环境变量，避免改动过多。

---

# P3：DeepiMessages 渲染窗口化

## 目标

即使 store 内保留 1200 条，也不一定每次渲染全部。TUI 默认只渲染最近 N 条，避免 Ink 长列表 layout 卡顿。

## 建议默认值

```ts
const DEFAULT_RENDER_WINDOW = 300;
```

第一版可以只做尾部窗口：

```ts
const visibleTimeline = timeline.length > DEFAULT_RENDER_WINDOW
  ? timeline.slice(-DEFAULT_RENDER_WINDOW)
  : timeline;
```

然后：

```tsx
const renderedItems = useMemo(() =>
  visibleTimeline.map(item => <MessageBlock key={item.id} item={item} expanded={expanded} />),
  [visibleTimeline, expanded]
);
```

但要避免 `slice()` 每次 render 都创建新数组导致 memo 失效。建议：

```tsx
const visibleTimeline = useMemo(() => {
  if (timeline.length <= DEFAULT_RENDER_WINDOW) return timeline;
  return timeline.slice(-DEFAULT_RENDER_WINDOW);
}, [timeline]);
```

再 map：

```tsx
const renderedItems = useMemo(() =>
  visibleTimeline.map(item => <MessageBlock key={item.id} item={item} expanded={expanded} />),
  [visibleTimeline, expanded]
);
```

## 加隐藏历史提示

当 timeline 被窗口化时，在顶部显示一行：

```tsx
{hiddenCount > 0 && (
  <Box paddingX={1}>
    <Text dimColor>{`… ${hiddenCount} older items hidden for TUI performance`}</Text>
  </Box>
)}
```

其中：

```ts
const hiddenCount = timeline.length - visibleTimeline.length;
```

不要把这行做成 warning，不要进入 bridge warnings；它只是 UI 提示。

## 注意

这不是完整虚拟列表，但对 TUI 足够有效。终端里完整虚拟列表成本较高，可以后续再做。

如果用户需要查看完整历史，后续可以加快捷键：

```text
Ctrl+H: toggle full history
```

第一版不强制做。先默认窗口化，保证长时间运行不卡。

---

# P4：TranscriptReader cache 同步

## 目标

保证 store trim 后，reader 的 `itemCache` 能清理掉被裁掉的 id。

当前 `transcriptToTimeline()` 已经会删除 inactive cache id。只要 trim 后 store version 变化，reader 下次 getSnapshot 会重新投影并清理缓存。

但建议补两个小改进。

## 增加 itemCache size 指标

已在 P0 提到。

## trim 后无需手动 invalidate

不要在每次 trim 后都调用 `reader.invalidate()`，否则会失去结构共享优势。

只有全量 replace/session 切换时才 invalidate。普通 trim 让 `transcriptToTimeline()` 自己清理 cache 即可。

---

# P5：优化 timeline-adapter 的热点

`timelineEntryEquals()` 里 tool args 比较使用：

```ts
JSON.stringify(a.tool.args) === JSON.stringify(b.tool.args)
```

当工具 args 很大、tool 很多时，这会成为热点。

第一版可以先不改。若 profile 显示这里明显耗时，再做优化。

可选优化：

1. 在 `ToolStatus` 中增加 `argsSummary` 或 `argsHash`。
2. 或在 `TranscriptStore` 写入 tool 时把 args 结构冻结/复用，减少深比较需求。
3. 或只比较 object reference，再在 store 写入时保证 args 更新时换引用。

不要现在大改。先做 trim 和 render window。

---

# P6：测试方案

## 1. TranscriptStore trim 测试

新增测试文件，例如：

```text
packages/tui/src/store/transcript-store.test.ts
```

按项目现有测试结构放置。

测试场景：

### 测试 1：超过 maxEntries 后会裁剪旧条目

构造 20 个 message item，设置：

```ts
maxEntries: 10
preserveTailEntries: 5
```

断言：

```text
entry count <= 10
旧 id 被删除
新 id 保留
entries / order 数量一致
```

### 测试 2：同步清理 liveTouchedIds 和 entryRevision

append 20 个条目后 trim。

断言被删除 id：

```ts
entries.has(id) === false
liveTouchedIds.has(id) === false
entryRevision.has(id) === false
```

如果私有字段不好测，可以通过新增 debug stats 检查 size 不超过 entry count。

### 测试 3：不裁剪 streaming reasoning

构造一个旧的 reasoning：

```ts
{
  kind: 'reasoning',
  isStreaming: true
}
```

即使它在头部，也不能被 trim 删除。

### 测试 4：不裁剪 running tool

构造：

```ts
{
  kind: 'tool',
  tool: { status: 'running' }
}
```

断言 trim 后仍保留。

### 测试 5：round-aware 裁剪不会留下半个 round

构造一个 round：

```text
assistant_text round-1
reasoning round-1
tool round-1
```

如果 round 被裁，应全部删除；如果保留，应全部保留。

不要出现只删除 reasoning、保留 tool 的情况。

## 2. DeepiMessages 窗口化测试

如果已有 React/Ink 测试环境，可以测：

```text
timeline length = 500
render window = 300
实际 MessageBlock 数量 = 300
顶部显示 hidden count = 200
```

如果现有测试不方便，至少把窗口化逻辑提取成纯函数：

```ts
export function getVisibleTimeline<T>(timeline: T[], windowSize: number): {
  visible: T[];
  hiddenCount: number;
}
```

然后测这个纯函数。

## 3. Bridge queue/warnings 测试

测试 warnings 超过 100 后只保留最后 100 条。

测试 messageQueue 超过 50 后只保留最后 50 条，并产生 queue full warning。

---

# P7：手动验收

运行：

```bash
bun run typecheck
bun test
```

然后手动测试：

## 短会话

1. 普通聊天正常显示。
2. reasoning 流式显示正常。
3. tool running/done 显示正常。
4. worker/supervisor role 显示正常。
5. Ctrl+O 展开/折叠 reasoning 正常。

## 长会话

构造长 workflow 或模拟大量 timeline item。

检查：

1. TUI 不再随时间明显变卡。
2. 最近消息始终显示。
3. 正在 streaming 的 reasoning 不会消失。
4. running tool 不会被裁掉。
5. Worker/Supervisor 的最近 reasoning 不会被新 reasoning 覆盖。
6. 顶部能看到“older items hidden”的提示。
7. `TranscriptStore.getStats()` 中 entries/order 不再无限增长。
8. `TranscriptReader.getStats()` 中 itemCache 不再无限增长。
9. warnings 长度不会超过上限。
10. messageQueue 长度不会超过上限。

---

# P8：建议修改顺序

请按以下顺序做，降低风险：

```text
1. 加 stats，不改变行为
2. 加 warnings/messageQueue 上限
3. 加 TranscriptStore trim，但先只在 append/upsert 新条目后触发
4. 加 DeepiMessages render window
5. 补测试
6. 跑 typecheck / test
7. 手动长会话回归
```

不要一上来重构整个 TUI store。不要改 core engine 上下文裁剪。不要把 session 持久化和 UI 裁剪混在一起。

---

# P9：建议提交信息

如果一次性完成：

```text
fix(tui): bound transcript history and render window for long sessions
```

如果拆成多次提交：

```text
chore(tui): add transcript runtime stats
fix(tui): bound bridge warning and message queues
fix(tui): trim transcript store by safe timeline groups
perf(tui): render bounded recent timeline window
test(tui): cover transcript trimming behavior
```
