# TUI 前端代码审查报告

> 审查日期：2025-06-11
> 审查范围：`packages/tui/src/` 全部源代码
> 审查目标：发现潜在 Bug、竞态条件、代码质量问题、测试覆盖缺口

---

## 目录

1. [严重问题](#1-严重问题)
2. [中等问题](#2-中等问题)
3. [代码质量与可维护性问题](#3-代码质量与可维护性问题)
4. [测试覆盖缺口](#4-测试覆盖缺口)
5. [优化建议汇总](#5-优化建议汇总)

---

## 1. 严重问题

### 1.1 App.tsx — 模块级可变状态导致竞态条件

**文件**: `packages/tui/src/App.tsx` 第 15-29 行

```typescript
let _cancel: (() => void) | null = null;
let _interrupt: (() => void) | null = null;
let _setStatusMsg: ((m: string | null) => void) | null = null;
```

**问题描述**：
模块级变量 `_cancel`、`_interrupt`、`_setStatusMsg` 在组件挂载时被赋值（第 107-109 行）：

```typescript
_cancel = () => bridgeRef.current.cancel();
_interrupt = () => engineRef.current.interrupt();
_setStatusMsg = setStatusMessage;
```

这些模块级变量被 `doInterrupt` 函数和 SIGINT 处理器引用。存在以下风险：

- React 18+ 严格模式下组件可能挂载两次，导致重复赋值
- 如果将来支持多 Tab 或多 App 实例，多个实例会互相覆盖这些全局变量
- 模块级状态使得代码难以测试和推理

**建议**：
- 使用 React Context 传递这些回调
- 或使用 `useRef` 存储并在 `useEffect` 中注册/注销 SIGINT 处理器
- 避免使用模块级可变状态

---

### 1.2 App.tsx — useEffect 依赖缺失

**文件**: `packages/tui/src/App.tsx` 第 107-109 行

```typescript
useEffect(() => {
  process.on('SIGINT', doInterrupt);
  return () => { process.off('SIGINT', doInterrupt); };
}, []);
```

**问题描述**：
`doInterrupt` 闭包捕获了模块级变量 `_cancel`、`_interrupt`、`_setStatusMsg`。`useEffect` 的依赖数组为 `[]`，意味着 SIGINT 处理器在组件整个生命周期中只注册一次。如果这些模块级变量在组件重新挂载时被重新赋值，SIGINT 处理器仍然引用旧值。

虽然当前代码在组件挂载时一次性赋值（不在 `useEffect` 中），但如果未来重构导致赋值时机变化，这个模式会引入难以调试的 Bug。

**建议**：
- 将 `doInterrupt` 定义为 `useCallback` 并正确设置依赖
- 或将 SIGINT 处理逻辑移到 `useEffect` 内部，确保每次依赖变化时重新注册

---

### 1.3 QuestionPrompt.tsx — 自定义输入处理逻辑错误

**文件**: `packages/tui/src/QuestionPrompt.tsx` 第 188-196 行

```typescript
useInput((input, key) => {
  // ...
  // Custom input handling
  if (state.editing && !key.ctrl && !key.meta) {
    if (key.backspace || key.delete) {
      handleCustomInput(input.slice(0, -1));  // ❌ Bug 1
    } else if (input.length === 1) {
      handleCustomInput(input + input);       // ❌ Bug 2
    }
  }
});
```

**Bug 1 — Backspace 处理错误**：
`input.slice(0, -1)` 中的 `input` 是 `useInput` 回调的参数（当前按下的字符），而不是当前编辑的文本内容。Backspace 应该从当前文本中删除最后一个字符，而不是从输入的字符中截取。

**Bug 2 — 字符输入重复**：
`handleCustomInput(input + input)` 将输入的字符重复了两次。应该是 `handleCustomInput(input)`。

**建议**：
```typescript
if (state.editing && !key.ctrl && !key.meta) {
  if (key.backspace || key.delete) {
    // 从当前文本中删除最后一个字符
    setState(s => questionStoreCustom(s, s.tab, s.customInputs[s.tab]?.slice(0, -1) ?? ''));
  } else if (input.length === 1) {
    handleCustomInput(input);
  }
}
```

---

## 2. 中等问题

### 2.1 bridge.tsx — submit 函数中 beforeSubmit 闭包陷阱

**文件**: `packages/tui/src/bridge.tsx` 第 228 行

```typescript
const submit = async (text: string, isQueueResubmit = false) => {
  // ...
  await beforeSubmit?.();
  // ...
};
```

**问题描述**：
`beforeSubmit` 是从 `createBridge` 的参数传入的，在 bridge 创建时被固定。`submit` 函数在 `processQueue` 中被递归调用时，`beforeSubmit` 始终是创建 bridge 时的初始值。

如果 `beforeSubmit` 依赖外部状态变化（如在 App 中定义的 `beforeSubmit` prop），则队列中的后续提交可能使用过时的 `beforeSubmit`。

**建议**：
- 将 `beforeSubmit` 改为通过 ref 传递，允许外部更新
- 或在 bridge 上暴露一个 `setBeforeSubmit` 方法

---

### 2.2 bridge.tsx — processQueue 中的 setTimeout(0) 不可靠

**文件**: `packages/tui/src/bridge.tsx` 第 113-119 行

```typescript
setTimeout(() => {
  processingQueue = false;
  void submit(next, true);
}, 0);
```

**问题描述**：
使用 `setTimeout(0)` 来延迟队列处理，这在事件循环繁忙时可能导致不可预测的延迟。此外，如果组件在 `setTimeout` 触发前卸载，`submit` 可能在一个已卸载的 bridge 上执行。

**建议**：
- 使用 `queueMicrotask` 替代 `setTimeout(0)`：
  ```typescript
  queueMicrotask(() => {
    processingQueue = false;
    void submit(next, true);
  });
  ```
- 或使用 `Promise.resolve().then(...)`
- 添加已卸载检查

---

### 2.3 DeepiPromptInput.tsx — useInput 回调中闭包捕获过时状态

**文件**: `packages/tui/src/DeepiPromptInput.tsx` 第 250-400 行

**问题描述**：
`useInput` 回调中直接引用了 `input`、`pasteParts`、`cursor` 等 state 变量。Ink 的 `useInput` 在组件挂载时注册一次回调，因此回调中捕获的 state 值可能是过时的。

代码中使用了 `inputRef`、`pastePartsRef`、`cursorRef` 来同步最新值，但 `submitLine` 函数直接使用了闭包中的 `input` 和 `pasteParts`：

```typescript
const submitLine = useCallback(() => {
  const text = expandTrackedPastes(input, pasteParts).trim();
  // ...
}, [input, pasteParts, onSubmit]);
```

如果 `useInput` 回调中调用的 `submitLine` 是过时闭包，则可能提交旧文本。

**建议**：
- `submitLine` 中改用 ref 读取最新值：
  ```typescript
  const submitLine = useCallback(() => {
    const text = expandTrackedPastes(inputRef.current, pastePartsRef.current).trim();
    // ...
  }, [onSubmit]);  // 依赖减少
  ```

---

### 2.4 SearchOverlay.tsx — useInput 的 isActive 条件

**文件**: `packages/tui/src/SearchOverlay.tsx` 第 130 行

```typescript
useInput(handleKeyDown, { isActive: isOpen });
```

**问题描述**：
当 `isOpen` 为 `false` 时，`useInput` 不会注册键盘监听。但当 `isOpen` 从 `true` 变为 `false` 时，Ink 的 `useInput` 可能不会立即取消注册，导致在关闭搜索后仍有短暂时间捕获到键盘事件。

此外，`handleKeyDown` 回调中检查了 `if (!isOpen) return;`，但 `isOpen` 是闭包中捕获的值，在回调注册时就已经固定。

**建议**：
- 在 `handleKeyDown` 中使用 ref 读取最新的 `isOpen` 值
- 确保 `useInput` 的 `isActive` 变化能正确触发重新注册

---

### 2.5 ModelPicker.tsx — inputBuf 直接拼接用户输入

**文件**: `packages/tui/src/ModelPicker.tsx` 第 165-167 行

```typescript
if (_input) {
  setInputBuf(prev => prev + _input);
}
```

**问题描述**：
在 API Key 输入步骤中，直接将用户输入的每个字符拼接到 `inputBuf`。对于 bracketed paste（多字符粘贴），`_input` 可能包含多个字符，但这里没有像 `DeepiPromptInput` 那样处理粘贴优化。

**建议**：
- 检测 `_input.length > 1` 的场景，作为粘贴处理
- 或统一使用与 `DeepiPromptInput` 相同的粘贴处理逻辑

---

## 3. 代码质量与可维护性问题

### 3.1 tokens.ts — 颜色值注释与实际不一致

**文件**: `packages/tui/src/reasonix/tokens.ts` 第 38-42 行

```typescript
const dark: ThemeTokens = {
  fg: { strong: '#ffffff', body: '#E1D3DC', sub: '#8D7B88', meta: '#8D7B88', faint: '#5D5159' },
  tone: { brand: '#00FF66', accent: '#4A90E2', ok: '#00FF66', warn: '#FFBD2E', err: '#FF5F56', info: '#4A90E2' },
  surface: { bg: '#000000', bgInput: '#653a99be', bgCode: '#0C0C0C', bgElev: '#13283F' },
};
```

**问题描述**：
- 注释说 `surface.bgInput` 是 `#1D3B5C`（深蓝色），但实际值是 `#653a99be`（带 alpha 通道的紫色）
- `bgInput` 使用了 8 位 hex 颜色（含 alpha 通道 `be`），这在 Ink 中可能不被所有终端支持
- 注释中描述的配色思路与实际使用的颜色不一致

**建议**：
- 更新注释以匹配实际颜色值
- 或统一颜色方案，确保注释与代码一致
- 考虑移除 alpha 通道，使用标准 6 位 hex 颜色

---

### 3.2 App.tsx — 大量 useState 导致组件膨胀

**文件**: `packages/tui/src/App.tsx`

**问题描述**：
`App.tsx` 中有 20+ 个 `useState` 调用，管理各种 UI 状态（显示/隐藏各种覆盖层、模型选择、Agent 选择、语言选择等）。这使得组件：

- 难以测试（需要模拟大量状态）
- 难以维护（状态逻辑分散在各处）
- 渲染性能受影响（每次状态变化都重新渲染整个组件树）

**建议**：
- 将覆盖层显示状态提取为自定义 hook（如 `useOverlayState`）
- 使用 `useReducer` 管理相关状态组
- 将大组件拆分为更小的子组件

---

### 3.3 bridge.tsx — commitBridge 中的副作用

**文件**: `packages/tui/src/bridge.tsx` 第 72-78 行

```typescript
const commitBridge = (updater: (prev: BridgeState) => Partial<BridgeState>): void => {
  setState(prev => {
    const patch = updater(prev);
    bridgeRuntime?.applyPatch(patch);  // ⚠️ 副作用
    if (bridgeRuntime && transcriptStore) {
      return prev;  // 跳过 React state 更新
    }
    return { ...prev, ...patch };
  });
};
```

**问题描述**：
在 `setState` 的 updater 函数中调用 `bridgeRuntime?.applyPatch(patch)` 是副作用，违反了 React 的纯函数原则。React 18+ 的严格模式可能会 double-invoke updater，导致 `applyPatch` 被调用两次。

**建议**：
- 将 `applyPatch` 移到 `setState` 外部的 `useEffect` 中
- 或使用 `useCallback` 包装并在 `setState` 之后调用

---

### 3.4 bridge.tsx — timelineItemCache 死代码

**文件**: `packages/tui/src/bridge.tsx` 第 69 行

```typescript
const timelineItemCache = new Map<string, TimelineItem>();
```

**问题描述**：
`timelineItemCache` 被创建但从未在任何地方读取。这是一个死代码，增加了维护负担。

**建议**：
- 删除未使用的变量
- 如果计划将来使用，添加注释说明用途

---

### 3.5 App.tsx — handleSubmit 中 locale 依赖缺失

**文件**: `packages/tui/src/App.tsx` 第 167 行

```typescript
const handleSubmit = useCallback((text: string) => {
  // ...
  if (command?.name === 'help') {
    appendMessage({
      role: 'assistant' as const,
      content: buildHelpText(activeAgent, t()),
    });
    return;
  }
  // ...
}, [activeAgent, appendMessage, bridge, thinkingMode]);
```

**问题描述**：
`buildHelpText(activeAgent, t())` 中 `t()` 在每次渲染时返回当前 locale 的 strings 对象。但 `handleSubmit` 的依赖数组中缺少对 locale 变化的追踪。如果用户在输入框中输入时切换了语言，`/help` 命令可能返回旧语言的文本。

**建议**：
- 添加 locale 到依赖数组
- 或使用 ref 存储当前 locale，在回调中读取最新值

---

### 3.6 WelcomeScreen.tsx — Figlet 字体渲染性能问题

**文件**: `packages/tui/src/WelcomeScreen.tsx` 第 42 行

```typescript
const ascii = figlet.textSync('deepseek', { font: 'ANSI Regular' }).trim().split('\n');
```

**问题描述**：
`figlet.textSync` 是同步调用，在每次渲染时都会执行。虽然 figlet 通常很快，但在终端宽度较大时，ANSI Regular 字体可能生成大量字符，导致每次欢迎屏渲染时都有可感知的阻塞。

**建议**：
- 将 figlet 结果缓存为模块级常量（内容不变）
- 或使用 `useMemo` 包装

---

### 3.7 颜色值硬编码问题

**多处文件**中存在直接使用颜色字符串而非语义化 Token 的情况：

- `PermissionPrompt.tsx` 中使用了 `"warning"`、`"error"` 等 Ink 内置颜色名
- `WelcomeScreen.tsx` 中使用了 `"#F59E0B"` 硬编码颜色
- `SearchOverlay.tsx` 中使用了 `"warning"` 颜色名

**建议**：
- 统一使用 `tokens.ts` 中定义的语义化 Token（`TONE.warn`、`TONE.err` 等）
- 避免混用 Ink 内置颜色名和自定义 Token

---

## 4. 测试覆盖缺口

### 4.1 缺少测试的组件

| 组件文件 | 测试文件 | 覆盖状态 |
|---------|---------|---------|
| `DeepiPromptInput.tsx` | ❌ 无对应测试 | `prompt-paste.test.ts` 只测试了粘贴逻辑，未测试键盘交互 |
| `App.tsx` | ❌ 无对应测试 | 组件过大，难以单元测试 |
| `ModelPicker.tsx` | ❌ 无对应测试 | 多步骤交互逻辑未测试 |
| `PermissionPrompt.tsx` | ❌ 无对应测试 | 三阶段权限流程未测试 |
| `QuestionPrompt.tsx` | ❌ 无对应测试 | 多问题表单交互未测试 |
| `SearchOverlay.tsx` | ❌ 无对应测试 | 搜索过滤逻辑未测试 |
| `WelcomeScreen.tsx` | ❌ 无对应测试 | 欢迎屏渲染未测试 |
| `FullscreenLayout.tsx` | ❌ 无对应测试 | 布局逻辑未测试 |
| `StatusBar.tsx` | ❌ 无对应测试 | 状态栏格式化未测试 |

### 4.2 测试建议

**高优先级**（核心交互逻辑）：
1. `DeepiPromptInput` — 键盘事件处理、历史浏览、粘贴折叠
2. `ModelPicker` — 多步骤选择流程、API Key 输入
3. `PermissionPrompt` — 三阶段权限流程

**中优先级**（业务逻辑）：
4. `QuestionPrompt` — 多问题表单、自定义输入
5. `SearchOverlay` — 搜索过滤、结果遍历

**低优先级**（渲染逻辑）：
6. `WelcomeScreen` — 欢迎屏渲染
7. `StatusBar` — 状态栏格式化

---

## 5. 优化建议汇总

| 优先级 | ID | 问题 | 文件 | 建议 |
|--------|-----|------|------|------|
| 🔴 高 | 1.1 | 模块级可变状态 | `App.tsx` | 使用 Context 或 ref 替代 |
| 🔴 高 | 1.3 | 自定义输入处理 Bug | `QuestionPrompt.tsx` | 修复 backspace 和字符输入逻辑 |
| 🟡 中 | 2.1 | beforeSubmit 闭包陷阱 | `bridge.tsx` | 使用 ref 传递 |
| 🟡 中 | 2.2 | setTimeout(0) 不可靠 | `bridge.tsx` | 改用 queueMicrotask |
| 🟡 中 | 2.3 | useInput 过时闭包 | `DeepiPromptInput.tsx` | 改用 ref 读取最新值 |
| 🟡 中 | 3.3 | commitBridge 副作用 | `bridge.tsx` | 将 applyPatch 移到 useEffect |
| 🟡 中 | 3.4 | timelineItemCache 死代码 | `bridge.tsx` | 删除未使用变量 |
| 🟢 低 | 3.1 | 颜色注释不一致 | `tokens.ts` | 更新注释或统一颜色值 |
| 🟢 低 | 3.2 | App 组件膨胀 | `App.tsx` | 提取自定义 hooks |
| 🟢 低 | 3.5 | locale 依赖缺失 | `App.tsx` | 添加 locale 到依赖数组 |
| 🟢 低 | 3.6 | Figlet 同步渲染 | `WelcomeScreen.tsx` | 缓存 figlet 结果 |
| 🟢 低 | 3.7 | 颜色值硬编码 | 多处 | 统一使用语义化 Token |
| 🟢 低 | 4 | 测试覆盖缺口 | 多个组件 | 添加单元测试 |

---

## 附录：审查文件清单

| 文件路径 | 行数 | 主要功能 |
|---------|------|---------|
| `src/App.tsx` | ~800 | 根组件，管理所有 UI 状态和覆盖层 |
| `src/bridge.tsx` | ~600 | Bridge 层，管理 LLM 通信状态 |
| `src/DeepiPromptInput.tsx` | ~400 | 用户输入框组件 |
| `src/DeepiMessages.tsx` | ~300 | 消息时间线渲染 |
| `src/BridgeConnected.tsx` | ~150 | Bridge 连接包装组件 |
| `src/ModelPicker.tsx` | ~250 | 模型选择弹窗 |
| `src/PermissionPrompt.tsx` | ~200 | 权限请求弹窗 |
| `src/QuestionPrompt.tsx` | ~250 | 追问表单弹窗 |
| `src/SearchOverlay.tsx` | ~150 | 搜索覆盖层 |
| `src/StatusBar.tsx` | ~100 | 底部状态栏 |
| `src/WelcomeScreen.tsx` | ~150 | 欢迎界面 |
| `src/FullscreenLayout.tsx` | ~60 | 全屏布局容器 |
| `src/reasonix/tokens.ts` | ~120 | 主题颜色 Token |
| `src/reasonix/markdown.tsx` | ~350 | Markdown 渲染器 |
| `src/reasonix/StreamingCard.tsx` | ~100 | 流式输出卡片 |
| `src/reasonix/Card.tsx` | ~20 | 卡片容器 |
| `src/store/transcript-store.ts` | ~250 | Transcript 存储 |
| `src/store/bridge-runtime.ts` | ~120 | Bridge 运行时拆分 store |
| `src/store/subscribe-store.ts` | ~70 | 轻量订阅 store |
| `src/store/BridgeRuntimeContext.tsx` | ~90 | Bridge 运行时 Context |
| `src/store/TranscriptContext.tsx` | ~60 | Transcript Context |
| `src/delta-batcher.ts` | ~60 | Delta 事件合并器 |
| `src/commands.ts` | ~120 | 斜杠命令解析 |
| `src/i18n/index.ts` | ~30 | 国际化入口 |
| `src/i18n/strings.ts` | ~60 | 字符串定义接口 |
| `src/settings.ts` | ~60 | TUI 设置持久化 |
| `src/question-state.ts` | ~200 | 追问状态管理 |
