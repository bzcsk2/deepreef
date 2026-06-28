# Eval Remediation Spec

## Goal

把当前 `/eval` 从“能跑但不可信的向导功能”整改为“可复现、可诊断、可实时观察的一级模式”，并解决以下 4 类问题：

1. `sandbox` 评测环境不完整，导致 verifier 找不到 `bun`
2. 官方 `sandbox` 测试池混入了不稳定真实 case，评分失真
3. `/eval` 不是一级模式，交互和 `/loop` 不一致
4. 退出链路缺少可观测性，`SIGTERM` 无法归因

## Scope

本 spec 面向实现 `/eval` 整改的开发 agent。

要求：

- 只处理 eval 相关问题
- 以可复现、可评分、可诊断为优先
- 不顺手做无关重构

不在本次范围内：

- 重写整个 eval 引擎
- 扩展无关 benchmark
- 为了图快放宽 sandbox 边界
- 仅修改 UI 文案而不改底层数据模型

## Work Items

### P0: 修复 Sandbox 基础设施

目标：确保 `sandbox` 评测环境本身可运行，基础二进制缺失不能再被误算成模型失败。

开发要求：

- 在 bwrap provider 中补齐确定性的运行时环境
- 显式保证 `PATH` 可找到：
  - `sh`
  - `node`
  - `bun`
  - `python3`
  - `pytest` 或等价 Python test runner
- 不允许依赖宿主机当前 shell 的隐式 PATH
- 保持现有安全边界，不要为了修 PATH 回退到开放全盘 bind

必须新增 preflight：

- 在正式跑 case 前执行环境预检查
- 输出至少包括：
  - provider id
  - environment id
  - PATH
  - `which node`
  - `which bun`
  - `which python3`
  - 版本信息
- preflight 失败时：
  - 本次 run 标记为 `infra_error`
  - 不计入 case fail
  - 不计入官方评分
  - TUI 必须明确提示是环境故障，不是模型失败

验收标准：

- `sandbox` 下 `tool-use smoke` 不再出现 `sh: 1: bun: not found`
- verifier 二进制缺失时，结果分类为 `infra_error`，不是 `fail`
- 日志和报告中能看到 preflight 结果

### P0: 清理 Sandbox 官方评分池

目标：让 `sandbox` 只承载真正可复现、已验收的官方轻量评测，不再混入当前环境跑不稳的真实 case。

开发要求：

- 重新梳理 `sandbox` 官方评分池
- 当前这类 case 不得直接进入 `sandbox` 官方评分：
  - verifier 依赖历史 Python/Node 版本但未 pin runtime 的 case
  - verifier 是 repo-wide typecheck 或全仓测试，无法只验证目标 bug 的 case
  - 在当前标准 sandbox 下无法稳定复现的 SWE-bench 或 looprig-real case
- 真实 case 可以保留，但必须重新归类到：
  - `container`
  - `localenv`
  - 或明确标为 diagnostic only

规则写死：

- `sandbox` = 官方轻量评测，可复现，可评分
- `container` = 官方强隔离真实评测，可评分，但必须记录镜像和运行时
- `localenv` = 本地诊断，不默认进入官方评分

验收标准：

- `sandbox` 中所有官方 case 都能在干净环境下稳定启动 verifier
- 不再出现“环境不兼容导致官方分数失真”的情况
- 文档明确标出哪些 case 属于官方评分，哪些仅 diagnostic

### P1: 重构 /eval 的数据模型与菜单结构

目标：不要再把 `smoke`、真实任务、环境类型混在一层。

开发要求：

- `/eval` 改为固定流程：
  1. 选择测试大项
  2. 选择测试环境
  3. 选择固定测试集
  4. 启动评测
  5. 输出结果与报告
- 数据模型按三层组织：
  - `category`
  - `environment`
  - `suite`
- 不允许继续采用“native smoke + real categories 直接 merge”的方式
- `smoke` 只能作为 suite 或内部开发集，不应成为用户理解官方评测结构的主入口

建议固定结构：

- 测试大项：
  - Worker 基础编码能力
  - Worker 工具使用能力
  - 弱模型稳定性
  - Supervisor 纠偏能力
  - 长任务持续运行能力
  - 安全边界与权限控制
- 测试环境：
  - `sandbox`
  - `container`
  - `localenv`

验收标准：

- 用户进入 `/eval` 后，不会再出现“同一 category 下既有 3 个 smoke，又有 18 个真实 case”的混乱感
- case 数量、来源、是否官方评分，在 UI 上可直接理解
- `sandbox / container / localenv` 的含义在 TUI 和报告里一致

### P1: 把 /eval 提升为一级模式

目标：`eval` 要和 `alone / subagent / loop` 并列，而不是子菜单里的向导。

开发要求：

- 一级菜单直接提供：
  - `/alone`
  - `/subagent`
  - `/loop`
  - `/eval`
- `/workflow` 不再作为主入口，只保留兼容 alias
- TUI 持久化设置、状态栏、模式路由都要识别 `eval`
- `eval` 模式进入后，不再只是一个 overlay wizard

交互要求：

- `/eval` 运行时必须像 `/loop` 一样，在主时间线实时展示 worker 过程
- 不满足于只显示：
  - case start
  - case end
  - pass/fail 摘要
- 至少要能实时看到：
  - 当前 case
  - 当前 agent 输出流
  - verifier 阶段
  - 中断或取消状态

验收标准：

- `/` 一级菜单能直接选 `eval`
- 状态栏能显示当前模式为 `eval`
- 运行 eval 时，用户能在 TUI 中持续看到 worker 执行过程，而不是等摘要

### P1: 补齐退出与终止可观测性

目标：下次再出现 `SIGTERM`，必须能查到是谁终止、为什么终止。

开发要求：

- 为 eval run 增加结构化生命周期日志
- 至少记录：
  - run start
  - preflight start/done
  - case start/end
  - verifier start/end
  - user cancel
  - timeout
  - provider abort
  - app shutdown
  - parent SIGTERM
- 输出独立诊断文件，建议包括：
  - `preflight.json`
  - `shutdown-reason.json`
  - `provider-env.json`
- 如果进程收到 `SIGTERM`，必须尽量记录最后状态：
  - 当前模式
  - 当前 run id
  - 当前 case id
  - 是否存在 abort controller
  - 谁发起了 cancel

验收标准：

- 再次出现 `SIGTERM` 时，可以从日志中区分：
  - 用户取消
  - case 超时
  - eval 中止
  - TUI 退出
  - 父进程终止
- 不再只剩一句 `Polite quit request` 无法追责

## Recommended Order

按以下顺序开发：

1. 先修 `sandbox` PATH 和 preflight
2. 再清理官方 `sandbox` case 池
3. 再重构 `/eval` 的 `category / environment / suite` 结构
4. 再把 `/eval` 提升为一级模式并接入实时流式显示
5. 最后补终止原因与生命周期日志

## Required Deliverables

开发 agent 最终必须交付：

- 代码改动
- 更新后的 `/eval` 交互
- 一份示例评测报告
- 一份示例 preflight 输出
- 一份示例 shutdown 或 termination 诊断输出
- 验证结果，至少包含：
  - `tool-use sandbox smoke` 可正常跑
  - 一个真实 `sandbox` 官方 case 可正常跑
  - 一个 `container` 或 `localenv` 真实 case 跑通或被正确分类
  - `/eval` 可作为一级模式运行并实时显示 worker 过程

## Definition Of Done

只有当以下条件全部满足时，本整改任务才算完成：

- `sandbox` 不再因缺少 `bun` 等基础二进制导致 case 机械失败
- 官方 `sandbox` 评分池只包含可复现 case
- `/eval` 成为与 `alone / subagent / loop` 并列的一级模式
- eval 运行过程可在 TUI 主时间线中实时观察
- `SIGTERM` 等终止事件可在日志和诊断文件中明确归因
