# Deepicode — 已完成操作记录

## 阶段 0: 基础设施搭建

### 0.1 仓库初始化 (2026-05-28)
- [x] 在 `/vol4/Agent/deepicode/` 初始化 Git 仓库
- [x] 创建根 `package.json` (name: `deepicode`, type: `module`, Bun runtime)
- [x] 创建 `tsconfig.json` + `vitest.config.ts`

### 0.2 Monorepo 结构
- [x] 创建 `packages/{core,cli,shell,tui,tools,security,` 目录
- [x] 根 `package.json` scripts: `dev`, `test`, `typecheck`
- [x] 使用 `../../` 相对路径进行包间引用（无 npm workspaces）

### 0.3 迁移现有代码 → packages/core/
- [x] `src/context/ImmutablePrefix.ts`
- [x] `src/context/AppendOnlyLog.ts`
- [x] `src/context/VolatileScratch.ts`
- [x] `src/context/ContextManager.ts`
- [x] `src/config.ts`
- [x] `src/types.ts`
- [x] `src/utils.ts`
- [x] All 14 unit tests migrated and passing

## 阶段 1: CoreEngine — 核心接口与 ReasonixEngine

### 1.1 CoreEngine 接口
- [x] 定义 `packages/core/src/interface.ts`:
  - `CoreEngine` — 核心引擎契约
  - `LoopEvent` — 事件类型联合 (`assistant_delta | tool_start | tool | done | error`)
  - `AgentState` — 状态快照（messages, stats, token usage）
  - `AgentTool` — 工具描述接口

### 1.2 ReasonixEngine 实现
- [x] `packages/core/src/engine.ts` — 包装 oh-my-pi `streamSimple`:
  - 三区域上下文组装（系统前缀 + 对话日志 + 暂存区）
  - `submit(input)` — 接收用户输入，返回 `AsyncGenerator<LoopEvent>`
  - `streamSimple` 事件到 `LoopEvent` 的映射
  - `getState()` / `setSystemPrompt()` / `clear()` 方法
  - 自动缓存命中检测（prefix-cache）

### 1.3 Oh-my-pi 集成
- [x] 创建 `packages/core/src/vendor/pi.js` — 从 oh-my-pi 源文件导入 `streamSimple`
- [x] 正确解决消息格式问题：oh-my-pi 的 `onPayload` 为通知型（返回值被忽略），需通过 `context.messages` 传递
- [x] 修复 `nextRequestOptions` 与 `context` 的冲突 — 正确使用 `{context, onPayload}`

## 阶段 2: API 连接验证

### 2.1 切换 Bun 运行时
- [x] 确认 oh-my-pi 依赖 `bun:sqlite`, `bun.YAML`, `bun.Glob` — 必须使用 Bun
- [x] 从 npm/tsx 切换到 `bun run`
- [x] 安装 oh-my-pi 依赖（`bun install` in `/vol4/Agent/oh-my-pi/`）

### 2.2 原生模块构建
- [x] 构建 oh-my-pi 的 Rust native addon:
  - `bun --cwd=/vol4/Agent/oh-my-pi/packages/natives run build`
  - 产物: `pi_natives.linux-x64-modern.node`
- [x] 确认模块加载正常

### 2.3 API 测试
- [x] Zen API (deepseek-v4-flash-free) 响应正常 — `hello` 回复
- [x] Token 统计: `in 104 / out 30`
- [x] 前缀缓存确认: `cache+128` 命中

## 阶段 3: CLI 界面

### 3.1 Readline REPL (第一阶段)
- [x] `packages/cli/src/index.ts` — 基于 `node:readline` 的简单 REPL
- [x] 支持 `/bye`, `/exit` 命令
- [x] 实时输出 assistant_delta

### 3.2 Oh-my-pi TUI 集成 (当前阶段)
- [x] `packages/cli/src/tui.ts` — 基于 oh-my-pi TUI 的聊天界面
- [x] `Container` + `Text` + `Input` + `Loader` 组件布局
- [x] `LoopEvent` → TUI 实时渲染映射（assistant_delta 流式刷新、tool 状态提示）
- [x] `index.ts` 入口改为引用 `tui.ts`
- [x] `bun run dev` 启动正常
- [x] 所有 14 个单元测试保持通过

## 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun | oh-my-pi 深度依赖 Bun 特有 API |
| 包间引用 | 相对路径 `../../` | 避免 npm workspaces 解析问题 |
| Oh-my-pi 位置 | `/vol4/Agent/oh-my-pi/` | 独立仓库，deepicode 通过相对路径导入 |
| API 提供商 | Zen API | 零配置，双倍速率限制，前缀缓存 |
| 模型 | deepseek-v4-flash-free | 高性价比，已验证工作正常 |
| 事件模型 | `AsyncGenerator<LoopEvent>` | 自然适配 for-await-of 消费模式 |
