# DeepReef `/model` 分组菜单重构实施计划

## 目标

将 `/model` 改为单页分组菜单。用户可以直接选择 Free / Local 模型；需要 API Key 的 provider 初始显示 `Your-ApiKey`，填写后在一级菜单内展开该 provider 的模型。

目标菜单顺序：

```text
Free
  deepseek-v4-flash-free
  mimo-v2.5-free
  step-3.7-flash-free
  nemotron-3-super-120b-a12b-free
  laguna-xs.2-free

Local
  qwen3.6-35B-A3B-mtp
  gemma-4-26B-A4B-it
  OpenAI-Compatible  -> 保留现有 Base URL + Model 二级配置

Deepseek
  Your-ApiKey        -> 填写后在一级菜单展开模型
Qwen
  Your-ApiKey        -> 填写后在一级菜单展开模型
Kimi
  Your-ApiKey        -> 填写后在一级菜单展开模型
ZAI
  Your-ApiKey        -> 填写后在一级菜单展开模型
Stepfun
  Your-ApiKey        -> 填写后在一级菜单展开模型
Nvidia
  Your-ApiKey        -> 填写后在一级菜单展开模型
OpenAI
  Your-ApiKey        -> 填写后在一级菜单展开模型
```

菜单分组仅是 UI 概念。实际请求继续使用：

```ts
{ provider, baseUrl, model, apiKey }
```

## 已确认的现状与必须修正的问题

1. `packages/tui/src/ModelPicker.tsx` 当前是 `provider -> key -> model` 三步向导，不支持单页分组、展开和长列表滚动。
2. `packages/core/src/config.ts` 已支持 `zen`、`deepseek`、`mimo`、`kilo`、`openai-compatible`、`nvidia`，但缺少 `qwen`、`kimi`、`zai`、`stepfun`、`openai`。
3. Free 模型并不属于同一个真实 provider：
   - Zen: `deepseek-v4-flash-free`、`mimo-v2.5-free`、`step-3.7-flash-free`
   - Kilo: Nemotron、Laguna 的真实 model ID
4. 项目已经支持并 `.gitignore` 了根目录 `api-key` 敏感文件。不要再新增 `.deepreef/api-keys.json`，避免出现两套 Key 来源和未忽略的明文凭据。
5. 当前 `loadApiKeyFromProjectFile()` 是私有函数，并且 TUI 只能检查环境变量，无法知道 `api-key` 中哪些 provider 已配置。
6. 当前 `role-config.json` 只保存 `{ provider, model, baseUrl }`，这是正确的，禁止把 API Key 写入该文件。
7. CLI 重启时创建双角色 runtime，会把全局 `config.apiKey` 同时用于 Worker 和 Supervisor。若两个角色使用不同 provider，会拿错 Key。必须在本次一起修复。
8. Local 的两个快捷模型没有独立 provider。它们应映射为 `openai-compatible`，使用统一的本地 Base URL。
9. provider 模型 ID、endpoint 和 context window 可能变化。实现前必须按官方文档核对，不能仅照抄本文件中的示例值。

## 产品行为定义

### 一级菜单

- 分组标题不可选中。
- `Up/Down` 跨分组移动，只停留在可操作行。
- 当前选中的真实目标使用 `provider + model + baseUrl` 判断并显示 `(current)`。
- 列表必须支持可视窗口滚动，选中项始终可见；不能依赖终端自然溢出。
- provider 有可用 Key 时，默认展开其模型行。
- provider 无可用 Key 时，只显示 `Your-ApiKey`。
- 已配置 provider 的标题或入口要显示 `configured`，但绝不显示 Key 内容。

### Provider 行

- 未配置：Enter 进入 Key 输入页。
- 已配置：Enter 切换展开/折叠。
- 已配置时必须提供明确的“更新 Key”操作，建议按 `e`。
- 已配置时必须提供“删除已保存 Key”操作，建议按 `d` 并二次确认。
- 环境变量提供的 Key 不可由菜单删除；UI 应标注来源为 `env`，更新时写入 `api-key` 但不修改环境变量。

### Key 输入页

- 保留现有粘贴能力。
- 屏幕上必须掩码显示，例如 `sk-****abcd`，禁止明文回显。
- Enter 保存并返回一级菜单，自动展开该 provider。
- Esc 返回一级菜单且不修改已有 Key。
- 空 Key 不允许提交。

### Local

两个快捷模型映射为：

```ts
{
  provider: 'openai-compatible',
  model: 'qwen3.6-35B-A3B-mtp' | 'gemma-4-26B-A4B-it',
  apiKey: '',
  baseUrl: resolveLocalBaseUrl()
}
```

`resolveLocalBaseUrl()` 优先级：

1. `OPENAI_COMPATIBLE_BASE_URL`
2. 最近一次 `openai-compatible` 配置的 Base URL
3. `http://localhost:8000/v1`

`OpenAI-Compatible` 保留现有二级配置：依次填写 Base URL 和 Model name，确认后选择。

### Esc / Ctrl+C

| 状态 | Esc | Ctrl+C |
| --- | --- | --- |
| 一级菜单 | 关闭菜单 | 关闭菜单 |
| Key 输入 | 返回一级菜单 | 关闭菜单 |
| OpenAI-Compatible 配置 | 返回一级菜单 | 关闭菜单 |
| 删除确认 | 返回一级菜单 | 关闭菜单 |

## 数据结构设计

### 1. Provider 注册表

继续以 `packages/core/src/config.ts` 的 `PROVIDERS` 为实际 provider 注册表，不在 `ModelPicker` 复制 endpoint、模型 ID 或 context window。

新增 provider：

- `qwen`
- `kimi`
- `zai`
- `stepfun`
- `openai`

保留：

- `zen`，新增 `step-3.7-flash-free`
- `kilo`，继续承载 Nemotron / Laguna Free 的真实 ID
- `deepseek`
- `nvidia`
- `openai-compatible`
- `mimo` provider 仍可保留在后台兼容旧配置，但不作为本次一级菜单分组

每个新增 provider 必须定义：

```ts
interface ProviderInfo {
  baseUrl: string
  model: string
  requiresKey: boolean
  label: string
  models: ProviderModel[]
  contextWindow?: number
}
```

实施前建立一张核对表，记录每个 provider 的官方 endpoint、model ID、context window 和核对来源。未经核对的模型不要加入默认注册表。

### 2. UI 菜单定义

新增独立模块，建议：

```text
packages/tui/src/model-menu.ts
```

该模块只负责把注册表、Key 状态和当前选择转换为纯数据行，便于测试。

```ts
type ModelMenuRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'model'; id: string; group: string; label: string; target: ModelSelection }
  | { kind: 'provider'; id: string; provider: string; label: string; configured: boolean; expanded: boolean; keySource?: ApiKeySource }
  | { kind: 'custom'; id: string; label: string; provider: 'openai-compatible' }

interface ModelSelection {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
}
```

Free 展示名与真实 target 显式映射：

```ts
const FREE_MODEL_TARGETS = [
  { label: 'deepseek-v4-flash-free', provider: 'zen', model: 'deepseek-v4-flash-free' },
  { label: 'mimo-v2.5-free', provider: 'zen', model: 'mimo-v2.5-free' },
  { label: 'step-3.7-flash-free', provider: 'zen', model: 'step-3.7-flash-free' },
  { label: 'nemotron-3-super-120b-a12b-free', provider: 'kilo', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  { label: 'laguna-xs.2-free', provider: 'kilo', model: 'poolside/laguna-xs.2:free' },
]
```

禁止通过字符串后缀 `-free` 猜 provider。

## API Key 方案

### 唯一持久化文件

复用项目根目录已有的：

```text
api-key
```

格式继续兼容现有读取逻辑：

```bash
DEEPSEEK_API_KEY="..."
QWEN_API_KEY="..."
KIMI_API_KEY="..."
ZAI_API_KEY="..."
STEPFUN_API_KEY="..."
NVIDIA_API_KEY="..."
OPENAI_API_KEY="..."
```

要求：

- 文件已由 `.gitignore` 忽略。
- 创建或更新后尽力设置权限为 `0600`。
- 写入使用临时文件 + rename，避免中途损坏。
- 更新单个 provider 时保留其他 provider 的条目。
- 不记录、不输出、不进入 session transcript。
- 不将 Key 写入 `last-config.json`、`role-config.json` 或日志。

### Core API

重构私有 `loadApiKeyFromProjectFile()`，新增并导出：

```ts
type ApiKeySource = 'env' | 'project-file' | 'default' | 'none'

resolveApiKey(provider: string): { value: string; source: ApiKeySource }
listConfiguredApiKeys(): Record<string, ApiKeySource>
saveProjectApiKey(provider: string, value: string): void
deleteProjectApiKey(provider: string): void
```

`resolveApiKey()` 优先级：

1. `${PROVIDER}_API_KEY` 环境变量
2. `api-key` 中对应 provider 条目
3. provider `defaultKey`
4. 空值

`keyless` provider 始终返回空 Key，不能被错误地标记为需要 Key。

## 实施步骤

### 阶段 A：Core provider 与凭据解析

修改：

- `packages/core/src/config.ts`
- `packages/core/src/schemas/config.ts`，仅在确有新持久化结构时修改
- `packages/core/src/index.ts`
- `packages/core/__tests__/config.test.ts`

任务：

1. 核对并新增 provider 注册信息。
2. 向 Zen 添加 `step-3.7-flash-free`。
3. 实现并导出凭据解析、列举、保存和删除 API。
4. `loadConfig()` 统一调用 `resolveApiKey()`，移除重复优先级逻辑。
5. 保持旧的 bare-key `api-key` 格式兼容，但 bare key 只能作为当前 provider 的 fallback，不能用于判断多个 provider 均已配置。
6. 对 provider ID 做白名单校验，禁止通过 provider 名注入任意环境变量名或文件内容。

### 阶段 B：修复双角色重启后的 Key 解析

修改：

- `packages/cli/src/tui.ts`
- 对应 CLI / dual-runtime 测试

任务：

1. Worker 和 Supervisor 根据各自最终 provider 分别调用 `resolveApiKey()`。
2. 构造 `workerConfig` 和 `supervisorConfig` 时分别传入正确 Key。
3. `role-config.json` 仍不保存 Key。
4. 覆盖“Worker=Qwen、Supervisor=Deepseek，重启后分别获得正确 Key”的测试。

这是本功能的发布阻断项。只改菜单、不修此链路，功能视为未完成。

### 阶段 C：提取纯函数菜单模型

新增：

- `packages/tui/src/model-menu.ts`
- `packages/tui/__tests__/model-menu.test.ts`

任务：

1. 定义分组顺序和 Free / Local 映射。
2. 根据 `listConfiguredApiKeys()` 和展开状态生成扁平行列表。
3. 提供“下一个/上一个可选行”与“保持选中行可见”的纯函数。
4. Header 永远不可选。
5. 使用稳定 `id`，不要使用数组索引作为 React key 或长期选择标识。

### 阶段 D：重构 `ModelPicker`

修改：

- `packages/tui/src/ModelPicker.tsx`
- `packages/tui/src/i18n/strings.ts`
- `packages/tui/src/i18n/en.ts`
- `packages/tui/src/i18n/zh-CN.ts`

将步骤简化为：

```ts
type Step = 'main' | 'key' | 'custom' | 'delete-confirm'
```

任务：

1. 一级菜单渲染扁平分组行。
2. 实现可视窗口滚动，建议固定显示 18 至 24 行。
3. provider Key 保存后刷新 Key 状态并自动展开。
4. 模型选择时通过 `resolveApiKey(provider)` 获取 Key，不在组件中重新实现优先级。
5. Key 输入掩码显示。
6. 支持更新和删除项目文件中的 Key。
7. 保留剪贴板粘贴和现有 `onSelect` / `onCancel` 签名。
8. Local 快捷模型与 OpenAI-Compatible 自定义入口按前述规则实现。

### 阶段 E：App 与持久化检查

修改范围应尽量小，但不能预先假定 `App.tsx` 完全无需修改。

检查：

1. `handleModelSelect` 是否正确更新当前 `activeRole` 的 engine。
2. `saveRoleConfig()` 和 `saveLastConfig()` 是否保存真实 provider/model/baseUrl。
3. Worker 与 Supervisor 切换后重新打开 `/model`，`current` 标记是否对应当前角色。
4. 关闭菜单后消息滚动位置是否恢复到最新消息。

## 测试要求

### Core

- 所有新增 provider 的配置字段和模型 ID。
- Free 展示 target 对应真实 provider/model。
- Key 优先级：env > project file > default > none。
- 保存单个 Key 不覆盖其他 provider。
- 删除单个 Key 不影响其他 provider。
- 损坏、空文件安全回退。
- 文件权限尽力设置为 `0600`。
- Key 不出现在 `last-config.json` 和 `role-config.json`。

### TUI

- 分组顺序严格符合产品定义。
- Header 不可选。
- 未配置 provider 只显示 `Your-ApiKey`。
- 配置后模型立即在一级菜单出现并展开。
- 重开菜单后已配置 provider 自动展开。
- 更新和删除 Key 行为正确。
- Key 输入不明文回显。
- 长列表导航时选中项始终可见。
- Free、Local、自定义 OpenAI-Compatible 选择返回正确四元组。
- Esc / Ctrl+C 行为符合状态表。
- Worker / Supervisor 分别显示各自当前模型。

### 必跑命令

```bash
bun test packages/core/__tests__/config.test.ts
bun test packages/tui
bun test packages/core packages/cli packages/tui
bun run typecheck
git diff --check
```

## 手动验收

1. 清空相关环境变量和 `api-key`，打开 `/model`，确认所有付费 provider 仅显示 `Your-ApiKey`。
2. 给 Qwen 填写 Key，确认 Key 被掩码、Qwen 模型立即在一级菜单展开。
3. 关闭并重启 DeepReef，确认 Qwen 仍显示已配置且可正常请求。
4. Worker 选择 Qwen，Supervisor 选择 Deepseek，重启后分别发起请求，确认没有串 Key。
5. 选择全部五个 Free 模型，确认 Zen/Kilo 路由正确且 Kilo 不发送 Authorization。
6. 选择两个 Local 快捷模型，确认使用解析后的本地 Base URL。
7. 使用 OpenAI-Compatible 自定义 URL/模型，确认现有二级流程未退化。
8. 在窄终端中遍历整个菜单，确认列表不溢出且选中项始终可见。
9. 删除项目文件中的 Key，确认 provider 恢复为 `Your-ApiKey`；环境变量 Key 不被删除。

## 完成定义

以下条件全部满足才可标记完成：

- 菜单视觉和交互符合目标分组。
- 所有模型选择返回正确的真实四元组。
- Key 不泄露到 UI、日志、session 或普通配置文件。
- 不同角色、不同 provider 在重启后仍使用各自正确的 Key。
- 自动化测试、类型检查和手动验收全部通过。
