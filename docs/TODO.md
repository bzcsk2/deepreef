# TODO

最后整理：2026-06-24。

本文件只保留当前下一步工作。历史长文已移到 `docs/archive/`。

## P0：统一配置系统

目标：把当前分散的 last-config、role-config、model-targets、TUI settings、env 读取整理成统一 schema/control-plane。

建议范围：

- 新增用户级 `~/.deepreef/config.toml`。
- 新增项目级 `<project>/.deepreef/config.toml`。
- 定义 Zod schema、默认值合并、版本迁移。
- 增加 CLI 命令：
  - `deepreef config path`
  - `deepreef config print`
  - `deepreef config validate`
  - `deepreef config edit`
  - `deepreef config doctor`
- 明确优先级：

```text
CLI flags
  > TUI 临时设置
  > 项目级 .deepreef/config.toml
  > 用户级 ~/.deepreef/config.toml
  > 当前 .deepreef/last-config.json / role-config.json fallback
  > 内置默认值
```

注意：session、goal、mailbox、tokensUsed、workflow phase 属于运行状态，不应写进主配置。

## P1：Workflow 可靠性

目标：让 Supervisor/Worker loop 能稳定处理常规工程任务。

建议任务：

- 为真实小型项目补 workflow e2e fixture。
- 强化 Worker report 的结构化输出和证据字段。
- 完善 `runSupervisorAnalyse()` 对结构化 plan 的校验和 fallback。
- 让 `useMailboxWorkflow` 分支有明确启用条件或移出主链路。
- 增加 workflow resume / interrupted / waiting_user 测试。
- 明确 maxRounds、goal status、budget limited 三者的终止语义。

## P2：Goal 自动续跑与预算治理

目标：让 loop = goal 的语义更完整，同时避免不可控自动执行。

建议任务：

- 完整接入 `GoalRuntime` 的 continuation gate。
- usage/token/time accounting 接入真实 engine usage。
- `budget_limited` 后只允许收尾汇报，不开始新实质工作。
- `blocked` 保持连续三轮同一阻塞审计。
- 增加用户恢复 blocked/paused/usage_limited 的明确路径。

## P3：TUI 长会话性能

目标：长时间会话、长 workflow、长流式输出后 TUI 不明显变卡。

建议任务：

- 给 bridge runtime 的 warnings、messageQueue 等数组设置上限。
- TranscriptStore 做 round-aware trim，保护 streaming reasoning/tool/prompt。
- DeepiMessages 做渲染窗口化。
- 暴露 transcript/store/reader/timeline 数据规模指标。
- 增加长 timeline 回归测试。

历史专项建议见 [archive/TUI性能整改建议.md](archive/TUI性能整改建议.md)。

## P4：Provider 与本地模型体验

目标：降低本地/免费/便宜模型的配置和调参成本。

建议任务：

- 完善 provider profile 和 model capability profile。
- 给常见本地 OpenAI-compatible 服务补配置示例。
- 调整 harness strictness 与小模型推荐组合。
- 建立 benchmark matrix，记录 Worker 模型可靠性。

## P5：文档和发布

目标：让外部用户更容易安装、运行、定位问题和贡献。

建议任务：

- 补 plugin/content-pack authoring 文档。
- 补 MCP 示例。
- 补 memory 配置说明。
- 补 workflow 示例和失败排查。
- 保持 README、docs 和代码命令一致。
- 发布前固定执行 `bun run typecheck && bun test && bun run build && npm pack --dry-run`。
