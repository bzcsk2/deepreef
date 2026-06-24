# Operations

最后整理：2026-06-24。

## 安装

```bash
npm install -g @deepreef/cli
```

或：

```bash
bun install -g @deepreef/cli
```

源码运行：

```bash
git clone https://github.com/bzcsk2/DeepReef.git
cd DeepReef
bun install
bun run dev
```

## 常用命令

TUI 内常用命令：

| 命令 | 说明 |
| --- | --- |
| `/help` | 查看帮助。 |
| `/model` | 切换当前角色的 provider/model/baseUrl/API key。 |
| `/workflow` | 启动 Supervisor/Worker loop。 |
| `/goal` | 在 loop 模式查看或管理当前 goal。 |
| `/sessions` | 查看和恢复历史 session。 |
| `/skill` | 浏览和启用技能。 |
| `/status` | 查看运行状态。 |
| `/context` | 调整上下文策略。 |
| `/thinking` | 调整 thinking 模式。 |
| `/harness` | 调整弱模型执行约束。 |

## Goal 命令

`/goal` 仅在 loop 模式下有效。

常见用法：

```text
/goal
/goal <objective>
/goal edit <new objective>
/goal pause
/goal resume
/goal clear
/goal budget <tokens>
/goal no-budget
```

目标持久化路径：

```text
.deepreef/sessions/<sessionId>/goal.json
```

## 当前配置文件

当前已实现的是窄配置，不是完整 TOML 控制面。

| 文件 | 说明 |
| --- | --- |
| `.deepreef/last-config.json` | 全局 fallback provider/model/baseUrl。 |
| `.deepreef/role-config.json` | Worker/Supervisor per-role provider/model/baseUrl。 |
| `.deepreef/model-targets.json` | 项目级 model target 覆盖。 |
| `.deepreef/sessions/` | session、goal 等运行状态。 |

API key 通常来自环境变量或 TUI 输入，不应提交到 git。

常见环境变量命名：

```text
DEEPSEEK_API_KEY
MIMO_API_KEY
NVIDIA_API_KEY
QWEN_API_KEY
KIMI_API_KEY
OPENAI_API_KEY
<PROVIDER>_BASE_URL
<PROVIDER>_MODEL
```

Memory 开关：

```text
DEEPREEF_MEMORY=false
DEEPREEF_MEMORY_AUTO_OBSERVE=false
DEEPREEF_MEMORY_INJECT_CONTEXT=false
DEEPREEF_MEMORY_ADVANCED=true
DEEPREEF_MEMORY_GRAPH=true
DEEPREEF_MEMORY_CONSOLIDATE=true
DEEPREEF_MEMORY_REFLECT=true
DEEPREEF_MEMORY_SLOTS=true
```

## 安全边界

DeepReef 是本地工程 agent，能读写文件、运行命令、访问网络和调用扩展工具。它不是完整隔离沙箱。

当前安全机制包括：

- Deny-first permission engine。
- 写文件和 shell 等敏感工具走权限判断。
- 危险命令阻断。
- stale-read 编辑保护。
- 文件快照。
- Web 请求 SSRF 防护。
- 子 agent 工具/权限隔离。

不要在不愿审查修改结果的仓库中运行 DeepReef。
