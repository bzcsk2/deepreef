
# 🌊 DeepReef

**让便宜模型也能稳定交付工程任务的终端原生 AI Loop Agent 。**
<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.3+-orange" alt="Bun"/>
  <img src="https://img.shields.io/badge/TypeScript-Ready-blue" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/核心已就绪-生产可用-brightgreen" alt="Status"/>
  <img src="https://img.shields.io/badge/TUI-Ink%2FReact-blue" alt="TUI"/>
  <img src="https://img.shields.io/badge/Schema-Zod_4-green" alt="Schema"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License"/>
</p>

---

## **Deepreef 经济学

**大部分 AI 编程工具都依赖昂贵的头部模型来保证工作质量，DeepReef 的哲学不同**：

> 不是靠昂贵模型一次性使用"金钱神力"，而是让高级模型规划监督，便宜/免费/本地模型下场施工，在针对性优化的监督闭环loop中持续可靠地把工程任务做完。

## ⚔️ 双轨并行工作流

我们摒弃了容易自我迷失的单体无限 Loop，采用**固定双角色 Workflow**：

```
Supervisor 分析 → Worker 执行 → Worker 汇报 → Supervisor 检查 → 继续/修正/求助人类
```

**👷 Worker (干活 Agent)**：token消耗者，配置本地或性价比高的模型，用户直接交互时为一个普通agent，进入workflow后听从Supervisor指挥，用户可根据模型能力选择harness档位，保证工作顺畅。

**🕵️ Supervisor (监督 Agent)**：配置更智能的模型，用户直接交互时为一个普通agent，在Worflow中负责规划和审查， Worker 达到失败阈值或请求帮助时被主动唤醒，通过读取Worker汇报及不可变快照（EvidenceBundle）给出结构化建议并自动调用Worker进行下一步迭代，直到目标完成。

- **会喊人**：判断Workflow真的无法推进时，Supervisor 会主动停止，ask_user求助。

---

## 🚀 一句话快速开始

```bash
# 需要 Bun >= 1.3
bun install -g @deepreef/latest

# 在你的项目中启动
cd your-project
deepreef
# 选择语言
然后即可使用默认配置开始工作了
# 更改配置
/model 
可呼唤出设置菜单
```
> 💡 本agent的所有使用方法已浓缩为一个 `/help` +任何你想了解的问题，即可让agent为你解答
> 
### 常用命令

| 命令          | 作用                 |
| ----------- | ------------------ |
| `/model`    | 无缝切换对话对象，状态不丢失     |
| `/workflow` | 启动双 Agent 并行工作流    |
| `/sessions` | 查看和恢复历史会话，即使上次意外崩溃 |
| `/skill`    | 浏览 52 个内置专家级工程技能   |
| `/status`   | 查看系统状态             |
| `/context`  | 修改上下文策略            |
| `/thinking` | 调整思考强度             |
| `/harness`  | 调整约束强度             |
|             |                    |

---

## ✨ 核心亮点

### 💰 极致省钱
- **ImmutablePrefix + SHA-256 cacheKey**：稳定缓存边界，最大化 prefix-cache 命中率
- **3 阶段 Tool-call Repair**：自动修复 JSON 参数错误，避免失败后重复计费
- **预设 Provider**：原生整合免费 Provider，开箱即用免费，原生支持本地 OpenAI-compatible 部署，针对Qwen3.6-35/27B及Gemma4系列做了优化。

### ⚡ 极速响应
- 目标每轮响应时间减少 **30–50%**
- Streaming Tool Executor（读操作并行 / 写操作串行）
- 预测性上下文压缩（Fold），压缩不阻塞主流程

### 🛡️ 极强稳定
- **harness 强度可调节**：根据模型能力自动/手动选择不同的容错档位
- 针对小模型专项优化：失败恢复、上下文压缩、Session 持久化、Verification Gate
- SSE 流式解析、429/5xx 指数退避、Session JSONL 恢复、工具异常隔离

### ✏️ 改得精准
- **Hash-Anchored Edit**：SHA-256 校验 + 流式处理大文件
- **9-Pass Fuzzy Edit**：渐进式兜底编辑
- **Stale-read 校验**：防止基于过期内容覆盖文件
- 轻松处理 10MB 级超大代码文件

### 🧩 生态完整
- **30+** 内置工具（文件、Shell、搜索、编辑、Web、MCP、Cron、Workflow、Notebook、Task）
- 原生支持各版本Skills
- **原生 MCP 协议**：轻量级 JSON-RPC 2.0，极速接入海量外部工具
- Plugin / content-pack 完整支持
- **AgentMemory** 原生集成 + 7 个记忆工具

---

## 🏗️ 软件架构

DeepReef 采用"核壳分离"设计，方便自定义开发：

```
deepreef-core      → 推理循环、API 适配、上下文管理、缓存、工具修复
deepreef-tui       → Ink/React 终端界面、状态栏、输入、模型选择
deepreef-tools     → 文件、Shell、搜索、编辑、Web、MCP、Workflow 等 30+ 工具
deepreef-plugin    → Plugin/content-pack、Hook、Zod Schema 工具验证
deepreef-memory    → AgentMemory 原生记忆、7 个 memory tools
deepreef-security  → Deny-first PermissionEngine、HookManager、FileSnapshot
```

| 模块 | 技术选型 |
|------|----------|
| 运行时 | Bun >= 1.3（原生 TS / Fetch / Streams） |
| TUI | Ink（React 19 + Yoga flexbox），~27K 行 |
| Schema 校验 | Zod 4 + Standard Schema V1 |
| MCP | 自研 McpClient / McpHost（JSON-RPC 2.0 + stdio） |
| 安全 | 自研 Deny-first PermissionEngine + HookManager + FileSnapshot |
| 推理引擎 | AsyncGenerator 驱动的 CacheFirstLoop，Token 预算保护，指数退避恢复 |

### 安全沙箱

- **Deny-first 权限引擎**：所有 Shell 与代码修改操作均需授权
- **单文件级 FileSnapshot**：随时可毫秒级回滚
- **bash 危险命令拦截、Web 请求 SSRF 防护**

---

## 📡 默认支持的模型 

| Provider     | 默认模型                            | 用户                        |     |
| ------------ | ------------------------------- | ------------------------- | --- |
| **deepseek** | deepseek-v4-flash-free          | 可添加自己的API key             |     |
| **mimo**     | mimo-v2.5-free                  | 可添加自己的API key             |     |
| **Qwen**     | Qwen3.6-35B-A3B-MTP             | vLLM / Ollama / llama.cpp |     |
| **Gemma**    | gemma-4-26B-A4B-it-NVFP4        | vLLM / Ollama / llama.cpp |     |
| **Kimi**     | Kimi-k2.6                       | 可添加自己的API key             |     |
| **GLM**      | GLM-5.1                         | 可添加自己的API key             |     |
| **stepfun**  | step-3.7-flash-free             | 可添加自己的API key             |     |
| **nvidia**   | nemotron-3-super-120b-a12b-free | 可添加自己的Nim API key         |     |
|              | nemotron-3-Omni-free            |                           |     |
|              | nemotron-3-Ultra-free           |                           |     |
| **other**    | Laguna M.1/SX.2 - free          |                           |     |
|              | Nex-N2-Pro                      |                           |     |
|              | Owl Alpha                       |                           |     |
| **openai**   | gpt-oss-120b                    | 可添加自己的API key             |     |
| **自定义**      | 无                               | openai-compatible         |     |

不喜欢Anthropic的嘴脸，所以没原生支持，有需要的可以自己vibe一下，很简单

---

## 🗺️ 项目状态与理念


核心引擎、30+ 工具、安全层、Plugin/Skills     ✅ 已实现
AgentMemory+ codeGraph 原生配置             ✅ 已实现
面向小模型的harness定制调整                          ✅ 已实现
双 Agent  Workflow 编排                                🔶 部分实现
TUI页面美化                                                     🔶 部分实现

### 我们的信念

> 真正有价值的 Agent，不是只在强模型上表现好，而是能把弱模型、便宜模型、本地模型组织起来，让它们稳定完成工程任务。

AI Coding Agent 的下一阶段是成本控制与交付质量，是更可靠的 Loop。

**欢迎一起来让"便宜好用"成为 AI 编程的标配。**