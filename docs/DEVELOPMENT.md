# Development

最后整理：2026-06-24。

## 环境

- Bun 1.3+
- Node.js 18+
- TypeScript 5.x

安装依赖：

```bash
bun install
```

本地启动：

```bash
bun run dev
```

## 常用验证

```bash
bun run typecheck
bun test
bun run build
npm pack --dry-run
```

按范围运行：

```bash
bun test packages/core
bun test packages/tui
bun test packages/tools
bun test packages/memory
bun test packages/cli
```

根脚本：

| 脚本 | 说明 |
| --- | --- |
| `bun run dev` | 从源码启动 CLI。 |
| `bun run build` | 构建 `dist/index.js`。 |
| `bun run smoke:cli` | 对构建后的 CLI 跑 help smoke。 |
| `bun run test` | 跑 core/tools/tui/cli/security 测试。 |
| `bun run test:all` | 跑全部 Bun 测试。 |
| `bun run test:memory` | 跑 memory 测试。 |
| `bun run typecheck` | TypeScript 全仓检查。 |
| `bun run pack:dry-run` | npm 打包预演。 |

## 测试现状

当前仓库测试覆盖面较广，包括：

- core engine、context、repair、tool execution、session、provider、workflow。
- goal runtime/tools、mailbox、structured protocol、resolve-effective-tools。
- TUI bridge、transcript store、workflow menu、commands、message rendering。
- tools、MCP、memory、plugin/content-pack 相关能力。

测试数量会随文件变化，以仓库实际为准。

## 变更原则

- 改 runtime 行为时补 core 测试。
- 改 TUI 状态或渲染时补 TUI store/bridge/component 测试。
- 改 workflow/goal/mailbox 时至少覆盖 coordinator 主路径和命令路径。
- 改 provider/config 时覆盖 `packages/core/__tests__/config.test.ts`。
- 改公开命令、配置、工具名时同步更新 docs。

## 发布前检查

发布或准备 PR 前建议至少执行：

```bash
bun run typecheck
bun test
bun run build
bun run smoke:cli
npm pack --dry-run
```

如果改了 memory：

```bash
bun run test:memory
```

如果改了包导出或 CLI 入口，检查 `package.json` 的 `bin`、`files`、`exports` 和构建产物。
