# 开发

最后整合日期：2026-06-25。

本文档是面向参与 DeepReef 开发的人类和编码智能体的维护指南。

## 环境

所需基线：

- Bun 1.3+
- Node.js 18+
- TypeScript 5.x

安装依赖：

```bash
bun install
```

从源码运行：

```bash
bun run dev
```

构建 npm CLI 输出：

```bash
bun run build
```

构建产物为带有 Node shebang 的 `dist/index.js`。包二进制名称为 `deepreef`。

## 根级脚本

| 脚本 | 用途 |
| --- | --- |
| `bun run dev` | 从 TypeScript 源码启动 CLI。 |
| `bun run build` | 将 `packages/cli/src/index.ts` 打包至 `dist/index.js`。 |
| `bun run smoke:cli` | 运行 `node ./dist/index.js --help`。 |
| `bun run test` | 运行 core/tools/tui/cli/security 测试。 |
| `bun run test:all` | 运行主测试套件及 memory 包测试。 |
| `bun run test:memory` | 运行 memory 包测试。 |
| `bun run typecheck` | 对整个仓库运行 TypeScript 类型检查。 |
| `bun run pack:dry-run` | 预览 npm 包内容。 |
| `bun run benchmark:fusion` | 运行基准测试矩阵脚本。 |

作用域测试：

```bash
bun test packages/core
bun test packages/tui
bun test packages/tools
bun test packages/memory
bun test packages/cli
```

## 默认验证

在准备 PR 之前，针对所涉区域运行最小可靠的验证集。对于大范围改动，请运行：

```bash
bun run typecheck
bun test
bun run build
bun run smoke:cli
npm pack --dry-run
```

对于 memory 相关改动：

```bash
bun run test:memory
```

对于包/导出/CLI 入口相关改动，请检查 `package.json` 字段：

- `bin`
- `files`
- `exports`（如果新增）
- 位于 `dist/` 下的构建产物

## 测试策略

当前测试覆盖范围包括：

- 核心引擎、上下文、修复、工具执行、会话、提供者、工作流；
- 目标运行时/工具、mailbox、结构化协议、`resolve-effective-tools`；
- TUI 桥接、会话记录存储、工作流菜单、命令、消息渲染、国际化；
- 默认工具、MCP、memory、插件/内容包；
- CLI 配置命令及包冒烟检查。

测试数量频繁变化。除非文档是发布说明或 PR 摘要，否则不要在其中记录确切的通过数量。

## 按区域划分的变更规则

| 变更区域 | 预期后续操作 |
| --- | --- |
| 核心运行时行为 | 新增或更新核心测试。 |
| 工作流 / 目标 / mailbox | 在适用处覆盖协调器路径、结构化解析器、命令路径及故障状态。 |
| TUI 状态或渲染 | 新增/更新 TUI store、bridge、command 或组件测试。 |
| 提供者/配置 | 更新配置/提供者测试及 `docs/OPERATIONS.md`。 |
| CLI 命令或斜杠命令 | 更新命令测试及面向用户的文档。 |
| 公开配置键、工具名称、提供者 ID | 在同一 PR 中更新文档和测试。 |
| 安全/权限行为 | 包含负面测试；切勿仅依赖正向路径测试。 |

## 编码智能体工作流

编码智能体应按以下顺序执行：

1. 阅读 `docs/README.md`。
2. 阅读 `docs/ARCHITECTURE.md` 中涉及的相关子系统。
3. 阅读 `ARCHITECTURE.md` 中列出的唯一事实来源代码路径。
4. 进行最小范围的改动。
5. 运行最相关的检查。
6. 说明已验证和未验证的内容。

硬性规则：

- 当任务明确标明仅限 `docs/` 下的文档时，不要编辑根级文档。
- 在检查当前包边界之前，不要为已有抽象创建第二套实现。
- 不要为了修复局部故障而将 Supervisor 工具扩展到所有工作流阶段。
- 不要将运行时状态移至配置中。
- 不要为了通过测试而削弱权限检查。
- 除非依赖变更需要，否则不要静默重新生成锁文件。

## 文档维护

文档集刻意保持精简：

- `README.md` — 文档索引及维护规则。
- `ARCHITECTURE.md` — 设计、运行时映射、状态、不变性。
- `OPERATIONS.md` — 安装、命令、配置、提供者、日志记录、安全性。
- `DEVELOPMENT.md` — 本地开发、测试、验证、编码智能体规则。
- `ROADMAP.md` — 当前工作及非目标。
- `CHANGELOG.md` — 公开变更历史。

除非有特定的发布管理原因，否则不要重新引入冗长的每日 `DONE` 日志、历史 TODO 堆积或归档目录。Git 历史记录和 PR 描述是存放详细历史实现日志的正确位置。

## PR 检查清单

在提交 PR 之前：

- 仅涉及预期中的文件。
- 确保文档中不包含指向已删除文件的失效链接。
- 对照当前代码验证命令和路径。
- 运行相关检查，或明确说明未运行检查的原因。
- 总结对用户/开发者的影响，而不仅仅是文件列表。

对于纯文档 PR，类型检查/测试为可选，除非文档中包含必须与代码验证的生成代码片段或示例。至少应检查链接、命令名称和已删除文件的引用。
