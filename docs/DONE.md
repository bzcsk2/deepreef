# Done

最后整理：2026-06-24。

本文件是当前能力摘要，不再记录旧的逐日长日志。历史 DONE 已移到 [archive/DONE-历史长文.md](archive/DONE-历史长文.md) 和 [archive/DONE-2026-06-18.md](archive/DONE-2026-06-18.md)。

## 项目基础

- Monorepo 包结构已建立。
- npm 包名为 `@deepreef/cli`。
- CLI 入口为 `deepreef`。
- README、中文 README、Roadmap、Contributing、Security、Changelog 已存在。
- Bun build 输出 `dist/index.js`，带 Node shebang。

## Core

- `ReasonixEngine` 主循环和 session 恢复。
- OpenAI-compatible SSE client。
- ContextManager、ImmutablePrefix、AppendOnlyLog、VolatileScratch。
- Tool-call repair / salvage / truncation recovery。
- StreamingToolExecutor shared/exclusive 执行。
- SessionLoader / AsyncSessionWriter。
- Provider 配置、role-config、model-targets。
- Harness、model profile、capability catalog、benchmark 基础。

## Tools / Security

- 默认工程工具集已接入。
- 文件、编辑、Shell、grep、glob、list_dir、web、task、workflow、notebook 等工具已存在。
- PermissionEngine、HookManager、FileSnapshot 已存在。
- stale-read、read-before-write、危险命令拦截等保护已接入。

## TUI

- Ink/React TUI 已接入 CLI。
- ModelPicker、SessionPicker、SkillModal、ContextModal、SearchOverlay 已存在。
- Bridge、TranscriptStore、TranscriptReader、BridgeRuntime 已存在。
- Workflow mode router 和 workflow 状态展示已存在。
- Worker/Supervisor per-role 模型配置可持久化。
- **P0 i18n（中英文切换）已完成：**
  - 修复 `persist.ts` locale 加载（Zod safeParse）。
  - 创建 `LocaleContext` + `useLocale/useT/useSetLocale` hooks（`i18n/context.tsx`）。
  - 扩展 `Strings` 类型覆盖所有 P0 区域（status、workflow、agents、modals、help 等）。
  - 迁移所有 15+ 组件和 `status/format.ts` 的硬编码 UI 字符串为 `t()` 调用。
  - 新增 `i18n.test.ts`，更新 legacy test 签名；`bun test` 159/159 pass。
  - 架构：模块级 `t()` 用于组件内，context 用于需要显式响应式订阅的场景；切换时 `setLocale` 既改模块变量也更新 React state 触发全局重渲染。

## Workflow / Goal / Mailbox

- `DualAgentRuntime` 已建立 Worker/Supervisor 双引擎。
- `WorkflowCoordinator` 阶段状态机已存在。
- 结构化 Supervisor decision schema 和 parser 已存在。
- completion audit 与 blocker audit gate 已接入。
- `GoalStore`、`GoalRuntime`、goal steering、goal tools 已存在。
- `/goal` pause/resume/clear/budget/no-budget/edit 路径已使用 system/control API。
- `Mailbox`、`AgentCommController`、mailbox tools 已存在。
- CLI 已动态注册 goal/mailbox tools。

## Ecosystem

- MCP host/client 和 MCP 工具代理已接入。
- PluginRuntime 与 content-pack 支持已接入。
- AgentMemory runtime、tools、hooks 和 MCP surface 已接入。
- Skills 加载路径已接入默认工具和 plugin。

## 文档整理

- `docs/` 根目录已整理为当前文档入口。
- 旧的长篇 TODO/DONE/整改建议已归档到 `docs/archive/`。
- 新增当前架构、运行、开发、状态、待办文档。
