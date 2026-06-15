# Supervisor 能力退化修复方案

最后更新：2026-06-15（SFR-00 至 SFR-90 全部完成）

本文用于指导后续 Agent 修复 `windev` 开发线上的 Supervisor 能力退化，并完整接通 `/workflow` 菜单定义的 `alone / subagent / loop` 三种运行模式。修复目标不是简单替换模型、修改菜单标签或放宽全部权限，而是恢复可验证的角色与工作流契约：

- Supervisor 普通对话可以识别当前项目、读取代码、搜索代码、维护任务清单和询问用户；在 `subagent` 模式下可通过 `AgentTool` 派发子 Agent。
- Supervisor 在固定 Workflow 的 analyse/check/intervene 回合中只消费工作流上下文和 Evidence，不自行调用工程工具。
- Worker 保持完整工程执行能力。
- `/workflow` 选择的模式必须真实改变消息路由、工具策略、事件消费、取消和恢复行为，不能只改变状态栏标签。
- 角色、提示词、工具和模型配置必须在请求发出前可观测、可测试，不能依赖 TUI 启动副作用碰巧生效。

---

## 1. 当前基线与问题表现

### 1.1 分支基线

截至 2026-06-15：

- 远端不存在 `origin/lindev`。
- 本地 `lindev` 与 `origin/windev` 均指向 `f07bc0f`。
- 本方案以 `origin/windev` / `f07bc0f` 为修复基线。

执行修复前必须先确认：

```bash
git fetch origin --prune
git rev-parse HEAD
git rev-parse origin/windev
git status --short
```

不得覆盖或删除工作区中与本任务无关的未跟踪文件和用户修改。

### 1.2 用户可见症状

用户要求 Supervisor 查看当前目录中的项目时，Supervisor 回复自己无法访问本地文件系统、无法浏览目录、无法扫描文件。

该回复不是单纯的模型质量问题。当前请求确实可能没有向 Supervisor 暴露任何工具，也没有保留 Deepreef 基础系统提示中的工作目录和运行环境。

### 1.3 `/workflow` 菜单当前真实状态

菜单、配置持久化和状态栏模式标签已经存在，但三种模式没有完整接入运行时：

| 菜单模式 | 菜单承诺 | 当前真实行为 |
|---|---|---|
| `alone` | 只使用当前 Agent | 普通消息发送给 `activeRole`，但没有禁止 `AgentTool` 或跨 Agent 调度 |
| `subagent` | Supervisor 自主调度，按需派 Worker | 与 `alone` 使用同一 `bridge.submit(submitted, false, activeRole)` 路径，没有独立路由策略 |
| `loop` | Supervisor 分析 → Worker 执行 → 汇报 → 检查 | 选择后尝试把下一条消息作为 goal，但启动、事件、输出、取消和重新开始链路不完整 |

`workflowMode` 当前只用于 `ui-settings.json` 持久化、菜单当前值和状态栏标签。除 `pendingWorkflowGoal` 的一次性分支外，它没有进入统一消息路由器，也没有传入 Core Runtime。

---

## 2. 已确认根因

### SR-01：工具已注册，但被 Agent 空白允许列表全部过滤

`packages/cli/src/tui.ts` 为 `supervisorEngine` 注册了：

```text
AgentTool
AskUserQuestion
read_file
grep
list_dir
todowrite
```

但 `packages/core/src/agent.ts` 中 Supervisor 定义为：

```ts
toolNames: []
```

`ReasonixEngine.submit()` 当前过滤逻辑为：

```ts
if (ac.toolNames && !ac.toolNames.includes(tool.name)) continue
```

空数组是真值，因此 Supervisor 的全部已注册工具均被过滤，最终请求的 `toolSpecs` 为零。

### SR-02：角色提示词覆盖基础系统提示，导致环境上下文丢失

CLI 使用 `buildSystemPrompt(process.cwd(), ...)` 构建的基础系统提示包含：

- 当前工作目录与工作区根目录；
- 平台和 Shell backend；
- Deepreef 工具使用说明；
- “先探索代码再回答”等执行规则。

但 `ReasonixEngine.submit()` 优先使用 `AgentConfig.systemPrompt`：

```ts
const baseSystemPrompt = ac.systemPrompt ?? this.ctx.prefix.messages[0]?.content ?? ""
```

Supervisor Agent 自带的一句短提示会覆盖已注入的基础系统提示。模型因此不知道自己处于可操作本地项目的 Deepreef 运行时。

### SR-03：AgentRuntime 没有显式传递角色

`AgentRuntime` 保存了 `this.role`，但提交时调用：

```ts
this.engine.submit(input)
```

角色行为依赖 TUI 挂载后的 `switchAgent()` 副作用。非 TUI 调用、Workflow 调用、启动竞态或测试环境可能回退到错误的 `currentAgent`。

### SR-04：配置来源未收敛

当前至少存在四类能力或身份来源：

- `agent.ts` 中 AgentDefinition 的 `systemPrompt` / `toolNames`；
- `.deepreef/agents.json` 中角色 profile 的 tools、thinking、skills；
- CLI 手工注册到 Supervisor Engine 的工具；
- WorkflowCoordinator 自己构造的工作流提示和输入。

这些来源没有形成单一、明确的“本次请求有效配置”。注册工具不等于暴露工具，角色 profile 也不等于请求真正采用的配置。

### SR-05：弱模型与关闭思考放大退化，但不是首要根因

默认 Supervisor profile 使用 `zen/mimo-v2.5-free`，thinking 为 `off`。这会降低复杂规划和主动工具使用能力，但即使替换成更强模型，零工具和环境提示丢失仍会导致错误拒答。

不得把“更换模型”作为本次修复的替代方案。

### SR-06：测试只证明对象存在，没有证明真实请求契约

现有测试主要覆盖 Runtime 创建、角色字段、状态转换和导出符号，没有断言：

- Supervisor 请求中实际包含哪些工具；
- 最终 system prompt 是否包含工作目录和角色约束；
- Direct Chat 与 Workflow 的工具策略是否不同；
- AgentRuntime 是否把角色显式传给 Engine；
- 注册工具与 Agent allowlist 不一致时是否产生诊断。

### WR-01：`alone` 与 `subagent` 没有真实行为差异

普通消息路径不读取 `workflowMode`，始终调用：

```ts
bridge.submit(submitted, false, activeRole)
```

因此 `subagent` 不会自动路由到 Supervisor，也不会建立 Supervisor 自主派发 Worker 的运行策略；`alone` 也没有禁止跨 Agent 派发。

### WR-02：`loop` goal 收集依赖陈旧 React closure

`handleSubmit` 内读取 `pendingWorkflowGoal`，但该状态没有出现在 `useCallback` 依赖数组中。选择 `loop` 后，下一条 goal 可能仍被旧回调当作普通 Direct Chat 提交。

不得只通过把变量补进依赖数组来宣布修复完成。goal 收集、运行中、等待用户和终态必须收敛为明确状态机。

### WR-03：Coordinator 阶段事件与 Generator 输出是断开的双通道

`WorkflowCoordinator.transition()` 通过 `onEvent` 回调发出 `phase_change`，但 CLI 创建 Coordinator 时没有提供该回调。`bridge.runWorkflow()` 又把 `runWorkflow()` yield 的 Runtime `LoopEvent` 强制当作 `WorkflowEvent`，只尝试处理 `phase_change`。

结果是 TUI 收不到真实阶段变化，Supervisor/Worker 的文本、reasoning、工具调用和工具结果被丢弃，completed、blocked、waiting_user 等终态也无法可靠显示。

### WR-04：模式切换和取消没有终止 Coordinator

切换到 `alone` 或 `subagent` 时只重置 React `workflowState`，没有调用 `workflowCoordinator.interrupt()` / `reset()`。Bridge cancel 会中断 Runtime 和主 Engine，但没有中断 Coordinator。界面可能显示已退出 loop，而后台 Workflow 仍继续调度。

### WR-05：`pendingWorkflowGoal` 生命周期不完整

- 从 `loop` 切换到其他模式时没有清除；
- 持久化恢复为 `loop` 后不会恢复或重新创建待 goal 状态；
- 斜杠命令、空输入、取消和启动失败时没有统一规则；
- blocked Workflow 未 reset 时无法开始新 Workflow。

### WR-06：状态栏没有展示固定 Workflow 的关键状态

当前状态栏显示模式、两个角色状态和 goal，但不显示真实阶段链与 `iteration/maxRounds`。用户无法判断 loop 正处于 analyse、do、report、check、waiting_user、blocked 还是第几轮。

### WR-07：测试门禁没有执行真实菜单流程

当前 Workflow/TUI 测试大量只检查类型、复制实现或使用占位断言。没有覆盖：

```text
/workflow
→ 选择模式
→ 输入任务
→ 验证实际路由
→ 消费角色输出与阶段事件
→ 取消/切换/完成/再次启动
```

---

## 3. 目标行为与非目标

### 3.1 `/workflow` 三模式产品契约

以下语义是后续实现和验收的唯一依据：

| 模式 | 普通非命令输入路由 | 跨 Agent 行为 | 生命周期 |
|---|---|---|---|
| `alone` | 发送给当前 `activeRole` | 禁止自主派发另一个 Agent；只运行当前角色 | 每条输入是独立 Direct Chat turn |
| `subagent` | 固定发送给 Supervisor | Supervisor 可使用 `AgentTool` 按需派 Worker 子 Agent；不进入固定 Coordinator 状态机 | 每条输入是一项 Supervisor 主导任务 |
| `loop` | 空闲时把下一条非命令输入作为 goal；运行时不得悄悄启动第二个 Workflow | Coordinator 固定调度 Supervisor 与 Worker | `awaiting_goal → running → waiting_user / blocked / completed / failed → awaiting_goal` |

补充规则：

1. `/talk worker|supervisor` 只改变 Direct Chat 输入目标；在 `subagent` 模式下普通任务仍由 Supervisor 接收，在 `loop` 运行期间不得改变 Coordinator 当前调度角色。
2. 斜杠命令永远按命令处理，不能被当作 loop goal。
3. 从 `loop` 切换到其他模式时必须中断并清理当前 Coordinator，不能只隐藏状态。
4. 持久化 `loop` 模式表示重启后进入 `awaiting_goal`；真实未完成 Workflow 的恢复必须依赖 checkpoint。
5. `blocked/completed/failed` 后允许开始新 goal，旧状态必须先归档或 reset。
6. 所有模式的 Supervisor/Worker 输出进入同一主时间线，并携带 role、mode、workflowId、phase、iteration 元数据。

### 3.2 必须实现的能力矩阵

| 场景 | Supervisor 可见工具 | 必须包含的提示上下文 | 禁止能力 |
|---|---|---|---|
| `alone` + Supervisor Direct Chat | `AskUserQuestion`、`read_file`、`grep`、`list_dir`、`todowrite` | Deepreef 基础提示、cwd、Supervisor 角色提示、当前启用 skills | `AgentTool`、`write_file`、`edit`、`bash`、其他直接 mutation/exec |
| `subagent` + Supervisor | `AgentTool`、`AskUserQuestion`、`read_file`、`grep`、`list_dir`、`todowrite` | Deepreef 基础提示、cwd、Supervisor 调度提示、当前启用 skills | `write_file`、`edit`、`bash`、其他直接 mutation/exec |
| 固定 Workflow analyse/check/intervene | 默认无工程工具；仅使用 Coordinator 提供的结构化上下文和 Evidence | Workflow 专用提示、goal、plan/report/evidence、轮次约束 | 工程工具调用、直接修改、绕过 Coordinator 派发 |
| `alone` + Worker Direct Chat / Workflow do | Worker 配置允许的完整工具集，但 `alone` 中不暴露 `AgentTool` | Deepreef 基础提示、Worker 角色提示、任务上下文 | 由现有 Permission/Harness 禁止的能力 |

### 3.3 非目标

- 不在本任务中自动替用户切换 Supervisor 模型。
- 不恢复已移除的 Build/Plan 用户身份。
- 不重写第二套 Engine、ToolRegistry、ContextManager 或 WorkflowCoordinator。
- 不把 Supervisor 全局改成可直接写文件或执行 Shell。
- 不依赖提示词实现安全边界；工具是否暴露必须由运行时决定。

---

## 4. 总体设计决策

### 4.1 引入显式提交场景

不要继续用 `role` 同时隐式表达身份、能力和工作流阶段。为 Engine 提交增加显式场景，例如：

```ts
type WorkflowMode = "alone" | "subagent" | "loop"

interface SubmitContext {
  role: "worker" | "supervisor"
  mode: WorkflowMode
  workflowPhase?: WorkflowPhase
}
```

允许采用与现有代码风格更一致的命名，但必须能够明确区分：

- `supervisor + alone`
- `supervisor + subagent`
- `supervisor + loop`
- `worker + alone`
- `worker + loop`

兼容入口可暂时默认 `worker + alone`，但生产双 Runtime 路径必须显式传递。

### 4.2 基础提示与角色提示必须组合，不得互相覆盖

建议将最终提示构造收敛为单一函数：

```ts
composeSystemPrompt({
  basePrompt,
  rolePrompt,
  workflowPrompt,
  activeSkillsPrompt,
})
```

组合顺序应稳定并有测试：

```text
Deepreef 基础运行环境
→ 角色职责与边界
→ 当前 Workflow 专用约束（仅 workflow）
→ 已启用 Skill 内容
```

`setSystemPrompt()` 设置的是基础运行时提示；AgentDefinition 的 `systemPrompt` 是角色附加提示。二者不得再使用 `??` 互斥选择。

### 4.3 工具暴露必须由“场景能力策略”统一计算

工具注册表表示“运行时拥有的工具”，不是“本次请求允许看到的工具”。

新增或收敛一个纯函数，输入注册工具、角色、提交场景和 Agent/Profile 配置，输出本次请求的有效工具列表。例如：

```ts
resolveEffectiveTools({
  registeredTools,
  role,
  mode,
  agentToolNames,
  profileAllow,
  profileDeny,
})
```

规则：

1. Supervisor Direct Chat 默认只允许明确的监督工具集合。
2. Supervisor Workflow 默认不暴露工程工具。
3. Worker 继续使用当前完整工具策略和 Permission/Harness。
4. `undefined` 与 `[]` 的语义必须明确：
   - `undefined`：不额外按 Agent allowlist 限制；
   - `[]`：明确禁止全部工具。
5. 工具注册与 allowlist 不一致时写诊断日志，禁止静默退化。

### 4.4 不以 TUI `useEffect` 作为正确性前提

角色必须在 Runtime/Engine 调用边界显式传递。TUI 的 `switchAgent()` 只用于用户选择自定义 Agent 身份，不得承担 Supervisor 能否获得正确提示和工具的基础职责。

### 4.5 建立单一模式路由器

不要继续在 `App.tsx.handleSubmit()` 中堆叠模式分支。新增可单元测试的纯函数模式路由器，例如：

```ts
routeWorkflowInput({
  mode,
  lifecycle,
  activeRole,
  inputKind,
})
```

输出明确动作：

```ts
type WorkflowRouteAction =
  | { type: "direct"; role: AgentRole; mode: "alone" }
  | { type: "supervisor_task"; mode: "subagent" }
  | { type: "start_workflow"; goal: string }
  | { type: "workflow_instruction"; content: string }
  | { type: "reject"; reason: string }
```

TUI 只负责收集输入和执行动作。Core Runtime 必须收到 mode，不能只由 TUI 标签表达。

### 4.6 统一 Workflow 事件流

Coordinator 阶段事件和角色 Runtime 事件必须进入同一个带元数据的事件协议：

```ts
interface RoleLoopEvent extends LoopEvent {
  agentRole: "worker" | "supervisor"
  workflowMode: "alone" | "subagent" | "loop"
  workflowId?: string
  workflowPhase?: WorkflowPhase
  iteration?: number
}
```

必须选择一种事件所有权模型：由 `runWorkflow()` generator 同时 yield 阶段事件和角色事件，或由 Coordinator 统一通过订阅器发出全部事件。禁止继续保留“阶段走 callback，角色输出走 generator，但 Bridge 只消费其中一部分”的双通道状态。

### 4.7 建立明确的菜单生命周期状态机

建议状态：

```ts
type WorkflowLifecycle =
  | { status: "idle" }
  | { status: "awaiting_goal" }
  | { status: "running"; workflowId: string }
  | { status: "waiting_user"; workflowId: string }
  | { status: "blocked"; workflowId: string; reason?: string }
  | { status: "completed"; workflowId: string }
  | { status: "failed"; workflowId: string; reason?: string }
```

不得继续使用 `workflowMode + pendingWorkflowGoal + workflowState.phase` 三组可能互相矛盾的状态表达同一事实。

---

## 5. 分阶段实施计划

后续 Agent 必须按以下顺序领取。每阶段先补失败测试，再做最小实现；一个阶段通过后再进入下一阶段。

### SFR-00：建立失败基线和请求观测测试

**目标**

先证明当前退化，不先改生产实现。

**修改位置**

- `packages/core/__tests__/dual-agent-runtime.test.ts`
- 新增建议：`packages/core/__tests__/supervisor-request-contract.test.ts`
- 如需 CLI 装配测试，可新增 `packages/cli/src/__tests__/supervisor-wiring.test.ts`

**必须新增的失败测试**

1. Supervisor `subagent` 请求必须包含六个监督工具；Supervisor `alone` 请求必须包含五个只读/交互工具且不包含 `AgentTool`。
2. 同一请求不得包含 `write_file`、`edit`、`bash`。
3. 最终 system prompt 必须同时包含 cwd 标记和 Supervisor 角色说明。
4. Supervisor Workflow 请求不得包含工程工具。
5. `AgentRuntime(role: "supervisor").submit()` 必须显式以 Supervisor 身份提交，不依赖 `switchAgent()`。
6. 注册了工具但因 allowlist 被全部过滤时，必须产生可诊断结果。
7. `alone`、`subagent`、`loop` 对同一普通输入产生三个不同的真实路由动作。
8. `/workflow → loop → goal` 能稳定启动 Coordinator，不受 React 陈旧 closure 影响。
9. Coordinator 的阶段事件和两个角色输出均进入主时间线。
10. 切换模式和取消会中断 Coordinator，不留下后台运行任务。

**测试要求**

- 测试必须捕获传给真实 `ChatClient.chatCompletionsStream()` 的 messages 和 tool specs。
- 禁止只测试常量或在测试中复制工具过滤算法。
- 修复前这些测试应能稳定失败。

**验收**

提交失败测试和基线说明，记录实际失败原因。

### SFR-10：修复显式角色路由

**目标**

消除对 TUI `switchAgent()` 启动副作用的依赖。

**修改位置**

- `packages/core/src/dual-agent-runtime/runtime.ts`
- `packages/core/src/engine.ts`
- 邻近 Runtime 测试

**修改方法**

1. `AgentRuntime.submit()` 必须把 `this.role` 和提交场景传给 Engine。
2. `DualAgentRuntime.sendDirect()` 使用 `direct` 场景。
3. WorkflowCoordinator 调用 Runtime 时使用 `workflow` 场景。
4. Engine 日志记录有效 role、agent、mode，不能只记录 `currentAgent`。
5. 保留旧调用兼容时，明确默认值并增加弃用说明。

**验收**

- 不调用 `switchAgent("supervisor")` 时，Supervisor 请求仍使用 Supervisor 身份。
- Worker 与 Supervisor 的直接对话上下文继续隔离。
- Workflow 测试全部通过。

### SFR-20：修复系统提示组合

**目标**

Supervisor 获得基础环境上下文，同时保持角色和 Workflow 约束。

**修改位置**

- `packages/core/src/engine.ts`
- `packages/core/src/agent.ts`
- 可新增 `packages/core/src/system-prompt-compose.ts`
- `packages/cli/src/tui.ts`

**修改方法**

1. 将 Engine 基础提示、角色提示、Workflow 提示、Skill 提示定义为独立层。
2. 删除当前 `ac.systemPrompt ?? existingPrefix` 的互斥覆盖语义。
3. Supervisor Direct Chat 角色提示明确说明：
   - 可以使用已暴露的只读工具；
   - 应先检查项目再回答项目问题；
   - 可以通过 `AgentTool` 派发执行；
   - 不得声称缺少已经实际暴露的能力。
4. Supervisor Workflow 使用 Workflow 专用提示，明确禁止工具调用并要求结构化输出。
5. 不在角色提示中硬编码虚假的工具能力；最终工具列表才是事实来源。

**验收**

- Supervisor Direct Chat 最终 system prompt 同时包含 cwd、角色职责、工具边界。
- Workflow 提示不会污染普通对话，普通对话提示不会破坏 Workflow 结构化协议。
- Worker 原有基础提示和 Skill 注入不回归。

### SFR-30：收敛 Supervisor 工具暴露策略

**目标**

使“注册了什么”和“本次允许什么”之间的关系明确且可诊断。

**修改位置**

- `packages/core/src/engine.ts`
- `packages/core/src/agent.ts`
- `packages/core/src/capability-catalog/`
- `packages/cli/src/tui.ts`
- `packages/core/src/agent-profile/`

**修改方法**

1. 定义 Supervisor `subagent` 模式的默认工具集合：

   ```text
   AgentTool
   AskUserQuestion
   read_file
   grep
   list_dir
   todowrite
   ```

2. 不要只把 `toolNames: []` 改成六个名字后结束任务。必须让工具策略与 role/mode/profile 一起计算，否则 Workflow 也会错误获得工具。
3. 优先复用并接通 CapabilityCatalog；若本阶段无法完成完整 Catalog 接线，至少新增单一纯函数并记录后续收敛任务，禁止在 CLI、Engine、Runtime 三处复制过滤规则。
4. Supervisor `alone/subagent` 即使用户 profile 请求写工具，也不得因本修复意外获得 mutation/exec；产品若未来允许放宽，必须单独设计和审核。
5. Supervisor Workflow 返回空工程工具集合。
6. 当期望工具未注册、配置名称拼写错误或过滤后为空时，写入 RuntimeLogger warning，字段至少包含 role、mode、registeredCount、effectiveCount、被过滤原因；不得记录敏感参数。

**验收**

- Supervisor `subagent` 精确获得六个默认工具；Supervisor `alone` 获得移除 `AgentTool` 后的五个工具。
- Workflow 获得零个工程工具。
- Worker 工具列表无回归。
- `undefined` 和 `[]` 语义有独立测试。
- 不存在仅注册成功但请求仍为零工具的静默状态。

### SFR-40：收敛 CLI 与 Profile 配置装配

**目标**

让角色 profile 中的 agent、model、thinking、skills 和工具配置真正作用于对应 Runtime。

**修改位置**

- `packages/cli/src/tui.ts`
- `packages/tui/src/App.tsx`
- `packages/core/src/agent-profile/`
- `packages/core/src/config.ts`

**修改方法**

1. 明确 `.deepreef/agents.json` 与 `role-config.json` 的职责，消除重复或定义清晰优先级。
2. Supervisor Engine 创建时应用 Supervisor profile，而不是仅手工注册六个工具。
3. Worker/Supervisor thinking 必须分别作用于各自 Engine；不能只更新主 Worker Engine。
4. Skill、Plugin、MCP 的角色过滤应通过统一能力视图完成。
5. 用户选择的模型必须保留；不自动替换免费模型。
6. 启动时输出一次无敏感信息的有效角色配置诊断，便于确认模型、thinking、工具数量和场景策略。

**验收**

- 修改 Supervisor thinking 不影响 Worker，反向同理。
- 修改 Supervisor 模型后重启仍生效。
- 角色 profile 与真实请求契约一致。
- CLI 装配测试不需要挂载完整 TUI 才能验证。

### SFR-50：实现三模式统一路由

**目标**

让 `/workflow` 菜单选择真实决定下一条普通输入的执行路径。

**修改位置**

- `packages/tui/src/App.tsx`
- `packages/tui/src/bridge.tsx`
- 建议新增：`packages/tui/src/workflow-mode-router.ts`
- `packages/tui/src/settings.ts`
- Core 提交上下文类型

**修改方法**

1. 实现纯函数模式路由器，禁止直接在 React 回调中散落模式判断。
2. `alone` 输入发送给 `activeRole`，请求上下文标记 `mode: "alone"`，能力策略移除 `AgentTool`。
3. `subagent` 普通任务固定发送给 Supervisor，请求上下文标记 `mode: "subagent"`，Supervisor 获得 `AgentTool`，但不启动 WorkflowCoordinator。
4. `loop` 空闲/终态进入 `awaiting_goal`；下一条非命令输入触发 `start_workflow`。
5. loop running 时普通输入必须作为明确的 workflow instruction、排队或拒绝，不能启动并发 Workflow。
6. 删除 `pendingWorkflowGoal` 布尔状态，改用统一 lifecycle。
7. 修复 React callback 依赖；模式正确性不得依赖 closure 更新时机。
8. 持久化恢复为 `loop` 时进入 `awaiting_goal`。

**验收**

- 三种模式对同一输入的实际调用路径不同且有测试。
- `subagent` 不再只是状态栏标签。
- `loop` goal 收集无陈旧 closure。
- `/talk` 与三模式交互符合 3.1 契约。

### SFR-60：统一 Coordinator 事件、输出与主时间线

**目标**

让 loop 模式的阶段变化、角色输出、工具调用和终态全部可见、可消费。

**修改位置**

- `packages/core/src/workflow-coordinator/coordinator.ts`
- `packages/core/src/workflow-coordinator/types.ts`
- `packages/core/src/dual-agent-runtime/`
- `packages/tui/src/bridge.tsx`
- transcript/timeline adapter

**修改方法**

1. 选择 4.6 中的一种单一事件所有权模型并删除另一条旁路。
2. 每个事件附带 `agentRole`、`workflowMode`、`workflowId`、`workflowPhase`、`iteration`。
3. Bridge 使用与 Direct Chat 相同的事件消费逻辑处理 Workflow 角色输出，不得只检查 `event.type === "phase_change"`。
4. Supervisor analyse、Worker 工具执行、Worker report、Supervisor check 全部进入统一主时间线。
5. phase_change、waiting_user、blocked、completed、failed 同步更新 TUI lifecycle 与 OrchestrationStore。
6. 删除 `event as WorkflowEvent` 这类无法保证协议正确的强制断言。

**验收**

- 用户可看到完整 loop 执行过程和最终结果。
- 状态栏与 Coordinator 当前状态一致。
- 同一事件不重复、不丢失，顺序稳定。

### SFR-70：补全取消、切换、重新开始与恢复

**目标**

消除后台 Workflow、卡死 blocked 状态和模式恢复不一致。

**修改位置**

- `packages/tui/src/App.tsx`
- `packages/tui/src/bridge.tsx`
- `packages/core/src/workflow-coordinator/coordinator.ts`
- Session/checkpoint 相关模块

**修改方法**

1. Bridge cancel 同时中断 Coordinator、当前 Runtime 和待处理 Question/Permission。
2. 从 `loop` 切换到 `alone/subagent` 时执行明确的 interrupt + reset/归档流程。
3. `blocked/completed/failed` 后可以安全开始新 goal。
4. `runWorkflow()` 的 Promise 必须被 await 或显式捕获错误，禁止未处理 rejection。
5. Coordinator interrupt 后不得错误转换为 `Max rounds reached`。
6. 重启时：
   - 仅持久化 `workflowMode: loop`：进入 `awaiting_goal`；
   - 存在有效 checkpoint：恢复真实 phase、iteration、goal 和等待状态；
   - checkpoint 损坏：诊断后降级到 `awaiting_goal`。
7. 模式切换必须清理旧 goal/lifecycle，不得保留隐藏 pending 状态。

**验收**

- 取消后不再产生任何新角色调用。
- 切换模式后后台无旧 Workflow。
- blocked 后可启动新 goal。
- 恢复行为有 checkpoint 和无 checkpoint 两类测试。

### SFR-80：恢复真实 Workflow 状态栏与菜单反馈

**目标**

让 UI 准确表达模式和当前 Workflow 生命周期，而不是只显示标签。

**修改位置**

- `packages/tui/src/components/workflow/WorkflowStatusBar.tsx`
- `packages/tui/src/App.tsx`
- i18n、README 与组件测试

**修改方法**

1. 状态栏同时显示当前模式、loop lifecycle、当前 phase、`iteration/maxRounds`、Supervisor/Worker 状态、goal 和 blocked/waiting_user 原因摘要。
2. `alone/subagent` 不显示伪造的 Workflow phase/goal。
3. 恢复使用现有 `PHASE_DISPLAY` / `buildPhaseChain()`，或删除死代码并实现等价清晰布局。
4. 菜单切换反馈说明真实影响，例如是否中断了正在运行的 Workflow。
5. README 和 `/help` 与实际三模式语义保持一致，删除“并行工作流”等与串行 Coordinator 不符的描述。

**验收**

- 状态栏展示值来自真实 Coordinator/lifecycle，不由 TUI 猜测。
- 窄屏布局可用。
- 组件测试渲染真实组件，不复制内部函数。

### SFR-90：端到端回归与发布门禁

**目标**

证明用户原始场景真正恢复，而不是只通过单元测试。

**必须覆盖的场景**

1. Supervisor Direct Chat 收到“查看当前文件夹项目内容”后，首先调用 `list_dir`、`read_file` 或 `grep`，不能回复“无法访问本地文件系统”。
2. Supervisor 使用 `AgentTool` 派发只读探索任务并消费结果。
3. Supervisor 无法直接调用 `bash`、`edit`、`write_file`。
4. 固定 Workflow 中 Supervisor analyse/check 不调用工程工具，Worker 正常执行。
5. 在不挂载 TUI、不执行 `switchAgent()` 的测试入口中行为仍正确。
6. Worker 和 Supervisor 使用不同模型、thinking、Agent 身份时保持隔离。
7. `alone` 模式不调用另一个 Agent。
8. `subagent` 模式由 Supervisor 接收任务并至少完成一次可观测 Worker 派发。
9. `loop` 模式完整展示 analyse → do → report → check → completed。
10. loop 取消、模式切换、blocked 后重启和 checkpoint 恢复均通过。

**建议测试文件**

- `packages/core/__tests__/supervisor-request-contract.test.ts`
- `packages/core/__tests__/dual-agent-runtime.test.ts`
- `packages/core/__tests__/workflow-coordinator.test.ts`
- `packages/cli/src/__tests__/supervisor-wiring.test.ts`
- 建议新增 `packages/tui/__tests__/workflow-mode-router.test.ts`
- 建议新增 `packages/tui/__tests__/workflow-menu-e2e.test.tsx`
- 可选显式远程 smoke test，默认跳过，不进入稳定 CI 门禁。

**统一验证命令**

```bash
bun run typecheck
bun test packages/core/__tests__/supervisor-request-contract.test.ts
bun test packages/core/__tests__/dual-agent-runtime.test.ts
bun test packages/core/__tests__/workflow-coordinator.test.ts
bun test packages/tui/__tests__/workflow-mode-router.test.ts
bun test packages/tui/__tests__/workflow-menu-e2e.test.tsx
bun test
git diff --check
```

---

## 6. 推荐 Agent 分工

为避免并行修改相同边界，按以下顺序串行领取：

| Agent | 任务 | 允许主要修改范围 | 完成条件 |
|---|---|---|---|
| Agent A (done) | `SFR-00` 请求契约失败测试 | Core/CLI 测试 | 修复前稳定失败并记录根因 |
| Agent B (done) | `SFR-10` 显式角色与场景路由 | dual-runtime、engine、coordinator | 不依赖 TUI 副作用 |
| Agent C (done) | `SFR-20` 提示词组合 | engine、agent、system prompt | cwd 与角色约束同时存在 |
| Agent D (done) | `SFR-30` 工具策略收敛 | engine、capability、agent、CLI | alone 五工具、subagent 六工具、loop Supervisor 零工程工具 |
| Agent E (done) | `SFR-40` Profile/CLI 装配 | CLI、TUI、profile/config | 每角色配置真实生效 |
| Agent F (done) | `SFR-50` 三模式统一路由 | TUI router、App、Bridge、Core submit context | 三模式真实分流 |
| Agent G (done) | `SFR-60` 统一 Workflow 事件流 | coordinator、runtime、Bridge、timeline | 阶段和角色输出不丢失 |
| Agent H (done) | `SFR-70` 生命周期与恢复 | App、Bridge、coordinator、session | 可取消、切换、重启、恢复 |
| Agent I (done) | `SFR-80` 状态栏与文档 | WorkflowStatusBar、i18n、README | UI 显示真实状态 |
| Agent J (done) | `SFR-90` E2E 与发布门禁 | 测试、少量修复 | 三模式完整验收 |

禁止 Agent B、C、D 同时并行修改 `engine.ts`；禁止 Agent F、G、H 同时并行修改 `App.tsx` / `bridge.tsx` / Coordinator。必须按表中顺序串行领取；如必须并行，先由负责人拆分并冻结接口。

---

## 7. Code Review 检查清单

审查者必须逐项回答，不得只看测试全绿：

- 最终 Supervisor Direct Chat 请求是否真的包含预期工具 schema？
- 最终 Supervisor system prompt 是否真的包含当前 cwd？
- Supervisor Workflow 是否真的没有工程工具？
- 工具安全边界是否由运行时执行，而不是只写在提示词中？
- `AgentRuntime.submit()` 是否显式传递角色和场景？
- `currentAgent` 是否仅作为兼容或用户自定义身份，而不是双角色正确性的基础？
- `undefined` 与空工具数组的含义是否明确且有测试？
- 工具被全部过滤时是否有可观测诊断？
- Worker 行为、Skill 注入、MCP、Plugin、Session 恢复是否无回归？
- 是否避免自动替用户更换模型或 Provider？
- `workflowMode` 是否真实进入消息路由和 Core 提交上下文，而不是只用于显示？
- `alone` 是否确实不会自主调用另一个 Agent？
- `subagent` 是否确实由 Supervisor 调度 Worker，而不是等同于 `alone`？
- `loop` 的角色输出、阶段事件、工具事件和终态是否全部进入主时间线？
- 模式切换和取消是否真正中断 Coordinator？
- blocked/completed/failed 后是否能安全开始下一 goal？
- 测试是否执行真实 `/workflow` 菜单流程，而不是复制实现或占位断言？

---

## 8. 完成定义

只有同时满足以下条件，才可宣布 Supervisor 能力退化与 `/workflow` 三模式已完整修复：

1. 用户原始场景在本地端到端测试中触发真实项目读取，而不是能力拒答。
2. Direct Chat 与 Workflow 使用不同且明确的 Supervisor 工具策略。
3. 最终请求的角色、mode、system prompt 和工具列表均有请求契约测试。
4. Supervisor 不能直接获得 mutation/exec 工具。
5. 修复不依赖 TUI `useEffect`、手工 `switchAgent()` 或模型碰巧遵循提示。
6. 全仓 typecheck、测试和 `git diff --check` 通过；若存在预置失败，必须列出并证明与本任务无关。
7. 完成后在 `DONE.md` 记录实际修改、验证命令和仍保留的限制，并从待办文档中移除对应任务。
8. `alone / subagent / loop` 对同一输入产生符合 3.1 契约的不同真实行为。
9. loop 模式完整执行过程与最终结果在 TUI 主时间线可见。
10. 取消、模式切换、blocked 后重启和 checkpoint 恢复不会留下后台任务或矛盾状态。
