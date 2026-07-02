
## 冗余代码审查

### 死代码（5 项）

| 文件 | 描述 |
|------|------|
| `packages/core/src/perfetto-tracing.ts` | 整个文件 ~334 行完全未被任何模块 import/export，无调用方 |
| `packages/tools/src/shell-exec.ts:100` | `isDenied()` 标注 @deprecated，纯转发，无调用方 |
| `packages/tools/src/hash-edit.ts` | `hashAnchoredReplaceOnce()` 仅测试导入，生产代码不引用 |
| `packages/core/src/engine.ts:424` | `setActiveSkills()` 标注 @deprecated，全代码库无调用 |
| `packages/core/src/engine.ts:436` | `getActiveSkills()` 标注 @deprecated，仅内部和测试引用 |

### 重复代码（3 组，~15 个重复函数）

| 文件对 | 重复内容 |
|--------|----------|
| `shell-exec.ts` ↔ `bash-dual-track.ts` | `truncateOutput`、`BoundedBuffer`、`pushBounded`、`finalizeBounded`、`createProgressThrottle` 5 个函数/接口完全重复；`runShell` 和 `runForegroundShell` 子进程管理逻辑高度重复 |
| `lsp-client.ts` ↔ `lsp/lsp-client.ts` | 两个 LSP 客户端实现并存（116 行函数式 vs 325 行类式），功能重叠，旧版仍被工具入口使用 |
| `prompts/locale.ts` | 纯 pass-through 重新导出 `prompt-locale.ts` 的 7 个函数 + 1 个类型，无附加逻辑 |

### 废弃代码（@deprecated 标记 15 处）

| 文件 | 废弃内容 |
|------|----------|
| `engine.ts` L151/185/421/433/648/656 | 6 处 @deprecated：`activeSkills`、`sessionStrictness`、`setActiveSkills`、`getActiveSkills`、`setHarnessStrictness`、`thinkingMode` |
| `verification-digest.ts:12` | `isVerificationCommand()` @deprecated，纯转发 |
| `text-salvage.ts:31-40` | 3 个 @deprecated 导出：`containsTextFormatToolCalls`、`parseTextFormatToolCalls`、`stripTextFormatToolCalls` |
| `subagent/types.ts:8,48` | `model` 字段 @deprecated，建议用 `target` |
| `tui/store/types.ts:25` | `TimelineItem` 类型别名 @deprecated，但 50+ 文件仍在使用 |
| `tui/fullscreen.ts:35` | `isMouseTrackingEnabled()` @deprecated，仅测试引用 |

### 未被 gitignore 的构建产物 / 临时文件（7 项）

| 路径 | 描述 |
|------|------|
| `covalo-0.1.1.tgz` | npm pack 产物，应加入 .gitignore |
| `covalo-0.1.2.tgz` | npm pack 产物，应加入 .gitignore |
| `packages/tui/src.bak/` | 20 个文件的备份目录，src/ 中已有更新版本 |
| `packages/core/.deepreef/sessions/` | 26 个运行时 .jsonl 会话日志 |
| `packages/tui/.deepreef/` | 运行时产物 |
| `.covalo-test-accept/` | 测试验收产物 |
| `etc/passwd/dual-session.json` | 运行时 dual-session 快照 |

### 未使用的依赖（1 项）

| 依赖 | 说明 |
|------|------|
| `@iarna/toml@^2.2.5` | 全代码库无任何 import/require 引用，已被 `smol-toml` 取代 |

### 冗余抽象（5 项）

| 文件 | 描述 |
|------|------|
| `prompts/locale.ts` | 纯 pass-through 重新导出，无附加逻辑 |
| `verification-digest.ts:isVerificationCommand()` | 一行转发函数 |
| `shell-exec.ts:isDenied()` | 一行转发函数 |
| `shell-exec.ts:createBashTool()` | 仅做分支选择，旧版前台工具在 dual-track 启用时不需要 |
| `tui/store/types.ts:TimelineItem` | 纯类型别名，虽 @deprecated 但 50+ 文件使用 |

### 冗余代码清理建议

1. **立即删除**：`perfetto-tracing.ts`（整个文件）、`isDenied()`、`hashAnchoredReplaceOnce()`
2. **提取公共模块**：`shell-exec.ts` 和 `bash-dual-track.ts` 的 5 个重复函数提取到 `shell-helpers.ts`
3. **统一 LSP 实现**：废弃 `lsp-client.ts` 旧版，统一使用 `lsp/lsp-client.ts` 类实现
4. **清理 @deprecated**：逐个评估 15 处 @deprecated，删除无调用方的，保留有调用方的并添加迁移计划
5. **更新 .gitignore**：添加 `*.tgz`、`src.bak/`、`.deepreef/`、`.covalo-test-accept/`、`etc/passwd/`
6. **移除未使用依赖**：`npm uninstall @iarna/toml`
7. **npm-placeholders**：确认 `@covalo/*` 包名是否已发布，如已发布则移除该目录

结论：**这段“冗余代码审查”大体方向是对的，但清理建议偏激，不能按“立即删除”执行。** 更准确的处理方式是：**重复代码可重构，兼容层可逐步迁移，死代码先用本地 `rg` 二次确认，再删。** 报告中的冗余代码节包括死代码、重复代码、废弃导出、构建产物、未使用依赖等判断。 

## 逐项判断

### 1. `perfetto-tracing.ts`：基本正确，但删除前做一次本地 `rg`

这个判断**大概率正确**。文件本身确实是独立 tracing 模块，提供 `initializePerfettoTracing`、`startInteractionSpan`、`startLLMRequestSpan`、`startToolSpan`、`writePerfettoTrace` 等导出函数，并且注释说通过 `COVALO_TRACE=1` 或 `--trace` 启用。

但我查到 CLI help 并没有 `--trace` 入口，只有 config/eval/harness/help/version 等命令。 同时 `@covalo/core` 的主 barrel `index.ts` 也没有导出 perfetto tracing 模块。

**处理建议**：不要一上来修 `perfetto-tracing.ts` 的性能问题。如果它确实无调用方，直接删除更合理；如果你还想保留 tracing 功能，那就反过来把它接入 CLI/TUI，而不是把它当作运行时热点优化。

---

### 2. `shell-exec.ts` ↔ `bash-dual-track.ts`：重复判断正确，但不能删 `createBashTool`

这个判断**正确一半**。

重复代码确实存在。`shell-exec.ts` 中有 `BoundedBuffer`、`truncateOutput`、`pushBounded`、`finalizeBounded`、`createProgressThrottle`，以及前台 `runShell` 子进程管理逻辑。 `bash-dual-track.ts` 里也有同类的 `truncateOutput`、`BoundedBuffer`、`pushBounded`、`finalizeBounded`、`createProgressThrottle`，以及 `runForegroundShell`。

但报告里说 `createBashTool()` 是冗余抽象，这个**不能直接按删除处理**。因为 `packages/tools/src/index.ts` 明确从 `shell-exec.ts` 导入 `createBashTool`，并且 `createDefaultTools()` 里用它根据 `shellPolicy` 决定是否启用 dual-track。

**处理建议**：
可以提取公共模块，比如 `shell-output-buffer.ts` / `shell-process-runner.ts`。但不要删除 `createBashTool()`，它是兼容分发入口。最多把内部实现瘦身成：

```ts
export function createBashTool(options = {}) {
  return createDualTrackBashTool({ legacyForegroundOnly: !options.dualTrack })
}
```

或者保留旧前台实现作为兼容模式。

---

### 3. 两套 LSP client：判断正确，应该迁移，但不是简单删除

这个判断**正确**。现在确实有两个 LSP client：

旧版 `packages/tools/src/lsp-client.ts` 是函数式实现，核心入口是 `runLspRequest()`。 新版 `packages/tools/src/lsp/lsp-client.ts` 是类式 `LspClient`，使用 `vscode-jsonrpc`，有状态、健康检查、diagnostics map、shutdown 等更完整能力。

更关键的是：当前 `createLspTool()` 仍然导入旧版 `runLspRequest`，说明“旧版仍被工具入口使用”这个判断是准确的。

**处理建议**：
这项应该列为“迁移任务”，不是“立即删旧文件”。正确顺序是：

1. 改 `packages/tools/src/lsp.ts`，从新版 `LspClient` 发请求。
2. 保持原有 LSP tool 输出格式不变。
3. 补测试：hover、definition、diagnostics、timeout、server crash。
4. 再删除旧的 `packages/tools/src/lsp-client.ts`。

---

### 4. `prompts/locale.ts`：冗余判断正确，但属于兼容 re-export

这个判断**正确**。`packages/core/src/prompts/locale.ts` 基本就是纯 pass-through，重新导出 `../prompt-locale.js` 的函数和类型。 真正实现都在 `prompt-locale.ts`，包括 `normalizePromptLocale`、`setPromptLocale`、`getPromptLocale`、磁盘读写等。

但它可能是为了保留旧路径 `@covalo/core/prompts/locale`。因为 `packages/core/package.json` 暴露了 `./*` 子路径导出，理论上外部或内部可以通过旧路径导入。

**处理建议**：
不要直接删。先用本地：

```bash
rg 'prompts/locale|prompt-locale'
```

如果只有内部旧路径在用，统一改到 `prompt-locale.ts` 后删除。如果已发布包可能有人用旧路径，则保留一个版本周期，并在 changelog 里标记 deprecated。

---

### 5. `isDenied()`：代码冗余判断基本正确，但“立即删除”不严谨

`isDenied()` 确实是一个薄 wrapper：它只调用 `matchDeniedShellPattern(command, backend)`，而且注释写着 `@deprecated`，保留导出供测试。

但报告说“无调用方”我不能完全确认，因为我没有可靠全仓 `rg` 输出；代码注释本身说“保留导出供测试”，所以它至少可能是测试兼容入口。

**处理建议**：
可以清理，但必须先迁移测试。正确任务不是“删除 `isDenied()`”，而是：

```bash
rg 'isDenied\('
```

如果只在测试中使用，改测试直接测 `matchDeniedShellPattern()`，然后删 `isDenied()`。

---

### 6. `hash-edit.ts`：基本正确，可以考虑删除

这个判断**基本正确**。`hash-edit.ts` 提供 `hashAnchoredReplaceOnce()`，是一个流式替换实现。 但当前生产 `edit.ts` 没有导入它，而是自己内联了 hash 校验、唯一性检查、CRLF 恢复和写文件逻辑。

所以“生产代码不引用”这个判断看起来成立。

但注意一点：报告的“好的实践”里提到 hash-anchored edit，这是 `edit.ts` 当前内联实现的能力，不等价于必须保留 `hash-edit.ts` 这个文件。

**处理建议**：
如果本地 `rg 'hashAnchoredReplaceOnce|hash-edit'` 只命中测试，可以删除文件，并把相关测试改成覆盖 `createEditTool()` 的真实行为。

---

### 7. `setActiveSkills()` / `getActiveSkills()`：报告判断不完整，不能直接删

这项要修正。`setActiveSkills()` 和 `getActiveSkills()` 的确标注了 `@deprecated`。 但 `activeSkills` 字段并不是完全无意义：`buildActiveSkillsPrompt()` 会读取 `this.activeSkills` 并拼到 system prompt 里。 `submit()` 里也会调用 `this.buildActiveSkillsPrompt()`，并把 `activeSkillsPrompt` 纳入系统提示层。

所以这里不能简单理解成“死代码”。更准确说法是：

**公开 setter/getter 可能没人用了，但 activeSkills 机制仍然接在 prompt 组装路径上。**

**处理建议**：
如果项目已经完全迁移到 AgentProfile skills，就应该整条链路一起清：

1. 确认没有调用 `setActiveSkills()`。
2. 删除 `setActiveSkills()` / `getActiveSkills()`。
3. 删除 `activeSkills` 字段。
4. 删除或替换 `buildActiveSkillsPrompt()`。
5. 确认 AgentProfile skills 已经覆盖原功能。

否则只删除 setter/getter 会留下半截逻辑。

---

### 8. `@deprecated` 统计：基本正确，但其中很多是兼容层，不该批量删

报告列出的 deprecated 位置基本能对上：

`engine.ts` 里确实有 `activeSkills`、`sessionStrictness`、`setActiveSkills()`、`getActiveSkills()`、`setHarnessStrictness()`、`thinkingMode` 等 deprecated 标记。

`verification-digest.ts` 的 `isVerificationCommand()` 也是 deprecated wrapper。 `text-salvage.ts` 里也有 3 个 deprecated 旧导出。 `subagent/types.ts` 里 `model` 字段确实 deprecated，建议用 `target`。  `TimelineItem` 也是 `TranscriptEntry` 的 deprecated alias。 `isMouseTrackingEnabled()` 也明确 deprecated。

**处理建议**：
这个分类正确，但执行上要分三类：

| 类型              | 处理                             |
| --------------- | ------------------------------ |
| 纯测试兼容 wrapper   | 迁移测试后删除                        |
| 外部 API 兼容 alias | 保留一个版本周期，打 deprecation warning |
| 内部状态仍接主链路       | 不单独删，必须连同新机制一起迁移               |

---

### 9. 构建产物 / 临时文件：判断基本正确，但 `.gitignore` 结论要补充

报告说 `covalo-0.1.1.tgz` 和 `covalo-0.1.2.tgz` 是 npm pack 产物，这个能验证，两个文件确实在仓库里。

`packages/tui/src.bak/` 也确实存在，至少 `src.bak/index.ts` 是一个备份式 barrel 文件。 `etc/passwd/dual-session.json` 也确实存在，而且内容看起来就是一次路径穿越/dual-session 快照产物，`dualSessionId` 和 `sessionId` 都是 `"../../etc/passwd"`。

`.gitignore` 当前忽略了 `.covalo/` 和 `.looprig/`，但没有忽略 `*.tgz`、`src.bak/`、`.deepreef/`、`.covalo-test-accept/`、`etc/passwd/`。 所以报告建议补 `.gitignore` 是对的。

不过要注意：**已经被 git 跟踪的文件，加入 `.gitignore` 不会自动消失**。需要同时执行：

```bash
git rm --cached covalo-0.1.1.tgz covalo-0.1.2.tgz
git rm -r --cached packages/tui/src.bak
git rm -r --cached etc/passwd
```

再补 `.gitignore`。

---

### 10. `@iarna/toml` 未使用依赖：方向正确，但还要本地 `rg` 确认

root `package.json` 里确实同时存在 `@iarna/toml`、`smol-toml` 和 `toml`。 `packages/core/package.json` 也明确依赖 `smol-toml`。

所以“`@iarna/toml` 可能已经被 `smol-toml` 取代”这个判断是合理的。但“全代码库无任何 import/require”需要本地 grep 最终确认。

**处理建议**：

```bash
rg "@iarna/toml|from ['\"]toml['\"]|from ['\"]smol-toml['\"]|require\\(['\"]@iarna/toml"
```

如果没有命中 `@iarna/toml`，再移除依赖并更新 lockfile。

---

## 修正后的结论表

| 报告项                                   |         判断 | 处理建议                                |
| ------------------------------------- | ---------: | ----------------------------------- |
| `perfetto-tracing.ts` 死代码             |       基本正确 | 本地 `rg` 确认后删除；或正式接入 tracing         |
| `isDenied()` 死代码                      | 基本正确但需确认测试 | 迁移测试后删                              |
| `hash-edit.ts` 生产未用                   |       基本正确 | 确认只测试引用后删除                          |
| `setActiveSkills/getActiveSkills`     |       部分正确 | 不能单删；activeSkills 仍接 prompt 链路      |
| shell 重复函数                            |         正确 | 提取公共 helper；不删 `createBashTool`     |
| LSP 双实现                               |         正确 | 先迁移 `lsp.ts` 到新版 `LspClient`，再删旧版   |
| `prompts/locale.ts` pass-through      |         正确 | 作为兼容 re-export，迁移后删                 |
| deprecated 15 处                       |       基本正确 | 分兼容层/测试层/主链路状态逐项处理                  |
| `.tgz` / `src.bak` / `etc/passwd` 等产物 |         正确 | `git rm --cached` + 更新 `.gitignore` |
| `@iarna/toml` 未使用                     |      大概率正确 | 本地 `rg` 确认后移除                       |

## 给 agent 的最终清理指令

不要让 agent 按报告的“立即删除”执行。应该这样下：

```text
只处理冗余代码清理，不改业务逻辑。

第一步先运行：
rg "perfetto-tracing|initializePerfettoTracing|startInteractionSpan|startLLMRequestSpan|startToolSpan"
rg "hashAnchoredReplaceOnce|hash-edit"
rg "isDenied\\("
rg "setActiveSkills|getActiveSkills|activeSkills"
rg "@iarna/toml|smol-toml|from ['\"]toml['\"]"

然后按以下规则处理：
1. shell-exec.ts 与 bash-dual-track.ts 的重复 buffer/throttle 逻辑提取公共 helper，但保留 createBashTool 兼容入口。
2. LSP 先把 lsp.ts 从旧 runLspRequest 迁移到新版 LspClient，再删除旧 lsp-client.ts。
3. prompts/locale.ts 只有在全仓旧路径无调用后删除，否则保留 deprecated re-export。
4. hash-edit.ts 只有在确认生产无调用、测试已迁移后删除。
5. activeSkills 不允许只删 set/get；若清理，必须连同 buildActiveSkillsPrompt 和 AgentProfile skills 迁移一起处理。
6. 删除已跟踪构建产物和运行时产物，并更新 .gitignore。
7. @iarna/toml 只有在 rg 确认无 import/require 后移除。
```

总体评价：**冗余识别质量比安全问题分级更可靠，但“清理建议”需要降一档执行，尤其是兼容入口和 deprecated API，不能直接等同于死代码。**
