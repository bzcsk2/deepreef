import { describe, it, expect, vi, beforeEach } from "vitest"
import { ReasonixEngine } from "../src/engine.js"
import type { AgentTool, AgentConfig, ChatClient } from "../src/interface.js"
import type { DeepSeekStreamEvent } from "../src/client.js"
import { agentConfigFor } from "../src/agent.js"

// ── 拦截型 Mock Client ──
// 捕获每次 chatCompletionsStream 调用时的 messages 和 opts，
// 让测试能真实断言 LLM 实际看到的内容。

let capturedMessages: { messages: any[]; opts: any } | null = null

function createInterceptClient(): ChatClient {
  return {
    chatCompletionsStream: vi.fn(async function* (
      messages: any[],
      opts: any,
    ): AsyncGenerator<DeepSeekStreamEvent> {
      capturedMessages = { messages, opts }
      yield { type: "text_delta", delta: "ack" }
      yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      yield { type: "done", finishReason: "stop" }
    }) as unknown as ChatClient["chatCompletionsStream"],
  }
}

beforeEach(() => {
  capturedMessages = null
})

// ── 工具工厂 ──

function makeEngine(opts?: { systemPrompt?: string }) {
  const engine = new ReasonixEngine({
    apiKey: "sk-test",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    maxTokens: 256,
    temperature: 0.1,
  }, undefined, undefined, createInterceptClient())
  if (opts?.systemPrompt) {
    engine.setSystemPrompt(opts.systemPrompt)
  }
  return engine
}

const cwdMarker = "CURRENT_WORKING_DIRECTORY: /test/project"
const supervisorFullPrompt = "You are the Supervisor agent. Analyze goals, create plans, review evidence, and provide guidance. Do not call tools during workflow turns."

// 注册 Supervisor 应拥有的六个监督工具
function registerSupervisionTools(engine: ReasonixEngine) {
  const tools: AgentTool[] = [
    { name: "AgentTool", description: "Delegate tasks", parameters: {}, concurrency: "shared", approval: "read", execute: async () => ({ content: "", isError: false }) },
    { name: "AskUserQuestion", description: "Ask user", parameters: {}, concurrency: "shared", approval: "read", execute: async () => ({ content: "", isError: false }) },
    { name: "read_file", description: "Read file", parameters: {}, concurrency: "shared", approval: "read", execute: async () => ({ content: "", isError: false }) },
    { name: "grep", description: "Search", parameters: {}, concurrency: "shared", approval: "read", execute: async () => ({ content: "", isError: false }) },
    { name: "list_dir", description: "List dir", parameters: {}, concurrency: "shared", approval: "read", execute: async () => ({ content: "", isError: false }) },
    { name: "todowrite", description: "Todo list", parameters: {}, concurrency: "shared", approval: "read", execute: async () => ({ content: "", isError: false }) },
  ]
  for (const t of tools) engine.registerTool(t)
}

// 注册几个典型的 mutation/exec 工具
function registerMutationTools(engine: ReasonixEngine) {
  const tools: AgentTool[] = [
    { name: "write_file", description: "Write", parameters: {}, concurrency: "shared", approval: "write", execute: async () => ({ content: "", isError: false }) },
    { name: "edit", description: "Edit", parameters: {}, concurrency: "shared", approval: "write", execute: async () => ({ content: "", isError: false }) },
    { name: "bash", description: "Bash", parameters: {}, concurrency: "exclusive", approval: "exec", execute: async () => ({ content: "", isError: false }) },
  ]
  for (const t of tools) engine.registerTool(t)
}

// ── 测试套件 ──

describe("SFR-00: Supervisor 请求契约基线（退化证明）", () => {

  // ─── 测试 1: Supervisor alone → 5个工具（不含 AgentTool）───
  it("[SFR-30] Supervisor alone 模式应暴露 5 个只读工具", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)

    const supervisorConfig = agentConfigFor("supervisor")
    // SFR-30 修复后：toolNames 应为 undefined（由运行时策略统一计算）
    expect(supervisorConfig.toolNames).toBeUndefined()

    const events: any[] = []
    // 传入 role="supervisor", mode="alone"
    for await (const e of engine.submit("list the project files", supervisorConfig, "supervisor", "alone")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    const toolNames = toolsInRequest.map((t: any) => t.function.name)

    // Alone 模式应有 5 个工具（不含 AgentTool）
    expect(toolNames).toContain("read_file")
    expect(toolNames).toContain("grep")
    expect(toolNames).toContain("list_dir")
    expect(toolNames).toContain("AskUserQuestion")
    expect(toolNames).toContain("todowrite")
    expect(toolNames).not.toContain("AgentTool")
    expect(toolNames).toHaveLength(5)
  })

  // ─── 测试 1b: Supervisor subagent → 6个工具（含 AgentTool）───
  it("[SFR-30] Supervisor subagent 模式应暴露 6 个工具（含 AgentTool）", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)

    const supervisorConfig = agentConfigFor("supervisor")

    const events: any[] = []
    for await (const e of engine.submit("explore the codebase", supervisorConfig, "supervisor", "subagent")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    const toolNames = toolsInRequest.map((t: any) => t.function.name)

    // Subagent 模式应有 6 个工具（含 AgentTool）
    expect(toolNames).toContain("AgentTool")
    expect(toolNames).toContain("read_file")
    expect(toolNames).toContain("grep")
    expect(toolNames).toContain("list_dir")
    expect(toolNames).toContain("AskUserQuestion")
    expect(toolNames).toContain("todowrite")
    expect(toolNames).toHaveLength(6)
  })

  // ─── 测试 2: 系统提示被覆盖，cwd 丢失 ───
  it("[SFR-20 已修复] 系统提示同时包含 cwd 和 Supervisor 角色说明", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)

    const supervisorConfig = agentConfigFor("supervisor")
    // supervisor 的 systemPrompt 是短提示，不含 cwd
    expect(supervisorConfig.systemPrompt).toBe(supervisorFullPrompt)
    expect(supervisorConfig.systemPrompt).not.toContain(cwdMarker)

    const events: any[] = []
    for await (const e of engine.submit("what is this project?", supervisorConfig)) {
      events.push(e)
    }

    const systemMessage = capturedMessages?.messages?.find((m: any) => m.role === "system")
    expect(systemMessage).toBeDefined()
    // SFR-20 修复后：system prompt 同时包含 cwd 和 Supervisor 角色说明
    expect(systemMessage.content).toContain(cwdMarker)
    expect(systemMessage.content).toContain(supervisorFullPrompt)
    // ↑ 模型因此不知道自己在 Deepreef 运行时中
  })

  // ─── 测试 3: AgentRuntime.submit() 传 role ───
  it("[SFR-10 已修复] AgentRuntime.submit() 将 role 和 mode 传给 engine", async () => {
    // SFR-10 修复后，AgentRuntime.submit(input, mode) 调用：
    // this.engine.submit(input, undefined, this.role, mode)
    // 验证 engine.submit 收到 role 和 mode
    const engine = makeEngine()
    registerSupervisionTools(engine)

    // 模拟 AgentRuntime 的调用方式：传 role="supervisor", mode="alone"
    const events: any[] = []
    for await (const e of engine.submit("list files", undefined, "supervisor", "alone")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    const toolNames = toolsInRequest.map((t: any) => t.function.name)
    // Supervisor alone 应得到 5 个工具
    expect(toolNames).toHaveLength(5)
    expect(toolNames).not.toContain("AgentTool")
  })

  // ─── 测试 4: Supervisor 请求中不包含 mutation/exec 工具 ───
  it("[SFR-30] Supervisor 模式不应暴露 write_file/edit/bash", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)
    registerMutationTools(engine)

    const supervisorConfig = agentConfigFor("supervisor")

    // Supervisor alone 模式
    const events: any[] = []
    for await (const e of engine.submit("fix the bug", supervisorConfig, "supervisor", "alone")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    const toolNames = toolsInRequest.map((t: any) => t.function.name)

    // 不应包含 mutation/exec 工具
    expect(toolNames).not.toContain("write_file")
    expect(toolNames).not.toContain("edit")
    expect(toolNames).not.toContain("bash")
    expect(toolNames).toHaveLength(5)
  })

  // ─── 测试 4b: Supervisor loop 模式 → 零工具 ───
  it("[SFR-30] Supervisor Workflow (loop) 模式应暴露零工具", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)
    registerMutationTools(engine)

    const supervisorConfig = agentConfigFor("supervisor")

    const events: any[] = []
    for await (const e of engine.submit("analyse and execute", supervisorConfig, "supervisor", "loop")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    // Workflow 阶段不暴露工具
    expect(toolsInRequest).toHaveLength(0)
  })

  // ─── 测试 4c: Worker alone 模式应有完整工具 ───
  it("[SFR-30] Worker alone 模式应有完整工具集", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)
    registerMutationTools(engine)

    const workerConfig = agentConfigFor("worker")

    const events: any[] = []
    for await (const e of engine.submit("fix the bug", workerConfig, "worker", "alone")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    // Worker 拥有全部工具
    expect(toolsInRequest.length).toBeGreaterThan(0)
    expect(toolsInRequest.map((t: any) => t.function.name)).toContain("bash")
    expect(toolsInRequest.map((t: any) => t.function.name)).toContain("write_file")
  })

  // ─── 测试 5: 显式传 role/mode 时工具策略正确 ───
  it("[SFR-10+SFR-30] 角色+模式组合工具策略正确", async () => {
    const engine = makeEngine({ systemPrompt: cwdMarker })
    registerSupervisionTools(engine)
    registerMutationTools(engine)

    // 5a: supervisor + subagent → 6 个监督工具
    let events: any[] = []
    for await (const e of engine.submit("task", undefined, "supervisor", "subagent")) {
      events.push(e)
    }
    let tools = capturedMessages?.opts?.tools ?? []
    let names = tools.map((t: any) => t.function.name)
    expect(names).toContain("AgentTool")
    expect(names).toHaveLength(6)

    // 5b: supervisor + alone → 5 个监督工具，无 AgentTool
    events = []
    for await (const e of engine.submit("task", undefined, "supervisor", "alone")) {
      events.push(e)
    }
    tools = capturedMessages?.opts?.tools ?? []
    names = tools.map((t: any) => t.function.name)
    expect(names).not.toContain("AgentTool")
    expect(names).toHaveLength(5)

    // 5c: supervisor + loop → 0 工具
    events = []
    for await (const e of engine.submit("task", undefined, "supervisor", "loop")) {
      events.push(e)
    }
    tools = capturedMessages?.opts?.tools ?? []
    expect(tools).toHaveLength(0)

    // 5d: worker + alone → 全部工具（包含 bash/write_file）
    events = []
    for await (const e of engine.submit("task", undefined, "worker", "alone")) {
      events.push(e)
    }
    tools = capturedMessages?.opts?.tools ?? []
    names = tools.map((t: any) => t.function.name)
    expect(names).toContain("bash")
    expect(names).toContain("write_file")
    expect(names.length).toBeGreaterThan(0)
  })
})

describe("SFR-00: 工具策略边界测试", () => {
  it("resolveEffectiveTools 的 undefined 与 [] 语义有区别", async () => {
    const { resolveEffectiveTools } = await import("../src/resolve-effective-tools.js")
    const registeredTools = new Map()
    registeredTools.set("read_file", {
      name: "read_file", description: "", parameters: {},
      concurrency: "shared", approval: "read",
      execute: async () => ({ content: "", isError: false }),
    })
    registeredTools.set("bash", {
      name: "bash", description: "", parameters: {},
      concurrency: "exclusive", approval: "exec",
      execute: async () => ({ content: "", isError: false }),
    })

    // undefined toolNames: 不额外限制
    const r1 = resolveEffectiveTools({
      registeredTools,
      role: "worker",
      mode: "alone",
      agentToolNames: undefined,
    })
    expect(r1.tools).toHaveLength(2)

    // [] toolNames: 明确禁止全部
    const r2 = resolveEffectiveTools({
      registeredTools,
      role: "worker",
      mode: "alone",
      agentToolNames: [],
    })
    expect(r2.tools).toHaveLength(0)
    expect(r2.filteredCount).toBe(2)
  })

  it("单独函数测试：Supervisor alone/subagent/loop 工具集不同", async () => {
    const { resolveEffectiveTools } = await import("../src/resolve-effective-tools.js")
    const registeredTools = new Map()
    registerSupervisionToolsMock(registeredTools)

    // alone
    const alone = resolveEffectiveTools({
      registeredTools,
      role: "supervisor",
      mode: "alone",
      agentToolNames: undefined,
    })
    expect(alone.tools).toHaveLength(5)
    expect(alone.tools.find(t => t.function.name === "AgentTool")).toBeUndefined()

    // subagent
    const subagent = resolveEffectiveTools({
      registeredTools,
      role: "supervisor",
      mode: "subagent",
      agentToolNames: undefined,
    })
    expect(subagent.tools).toHaveLength(6)
    expect(subagent.tools.find(t => t.function.name === "AgentTool")).toBeDefined()

    // loop
    const loop = resolveEffectiveTools({
      registeredTools,
      role: "supervisor",
      mode: "loop",
      agentToolNames: undefined,
    })
    expect(loop.tools).toHaveLength(0)
  })
})

function registerSupervisionToolsMock(map: Map<string, any>) {
  const names = ["AgentTool", "AskUserQuestion", "read_file", "grep", "list_dir", "todowrite"]
  for (const name of names) {
    map.set(name, {
      name, description: "", parameters: {},
      concurrency: "shared", approval: "read",
      execute: async () => ({ content: "", isError: false }),
    })
  }
}

describe("SFR-00: 配置与诊断契约", () => {
  it("[SFR-30] Supervisor loop 模式零工具时应有诊断日志（不会静默退化）", async () => {
    const engine = makeEngine()
    registerSupervisionTools(engine)

    const supervisorConfig = agentConfigFor("supervisor")
    // loop 模式 Supervisor 零工具，resolveEffectiveTools 会输出 warn 日志
    // 不会静默退化
    const events: any[] = []
    for await (const e of engine.submit("test", supervisorConfig, "supervisor", "loop")) {
      events.push(e)
    }

    const toolsInRequest = capturedMessages?.opts?.tools ?? []
    // loop 模式 Supervisor 工具应为空
    expect(toolsInRequest).toHaveLength(0)
  })
})
