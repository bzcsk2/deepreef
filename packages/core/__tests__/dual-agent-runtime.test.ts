import { describe, it, expect, vi } from "vitest"
import { AgentRuntime } from "../src/dual-agent-runtime/runtime.js"
import { DualAgentRuntime } from "../src/dual-agent-runtime/dual-runtime.js"
import type { ChatClient } from "../src/interface.js"
import type { DeepSeekStreamEvent } from "../src/client.js"

function createMockClient(responses: string[] = ["Hello"]): ChatClient {
  return {
    chatCompletionsStream: vi.fn(async function* (): AsyncGenerator<DeepSeekStreamEvent> {
      for (const response of responses) {
        yield { type: "text_delta", delta: response }
        yield { type: "done", finishReason: null }
      }
    }) as unknown as ChatClient["chatCompletionsStream"],
  }
}

describe("AgentRuntime", () => {
  it("should create runtime with correct role", () => {
    const client = createMockClient()
    const runtime = new AgentRuntime({
      role: "worker",
      client,
      systemPrompt: "You are a worker",
      contextWindow: 128_000,
      maxContextRounds: 20,
      config: {
        apiKey: "test-key",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 8192,
        temperature: 0.3,
      },
    })

    expect(runtime.getRole()).toBe("worker")
    expect(runtime.getStatus()).toBe("idle")
    expect(runtime.getSystemPrompt()).toBe("You are a worker")
  })

  it("should get initial state", () => {
    const client = createMockClient()
    const runtime = new AgentRuntime({
      role: "worker",
      client,
      systemPrompt: "You are a worker",
      contextWindow: 128_000,
      maxContextRounds: 20,
      config: {
        apiKey: "test-key",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 8192,
        temperature: 0.3,
      },
    })

    const state = runtime.getState()
    expect(state.role).toBe("worker")
    expect(state.status).toBe("idle")
    // Messages include system prompt from prefix
    expect(state.messages.length).toBeGreaterThan(0)
    expect(state.messages[0].role).toBe("system")
    expect(state.elapsedMs).toBe(0)
  })

  it("should update system prompt", () => {
    const client = createMockClient()
    const runtime = new AgentRuntime({
      role: "worker",
      client,
      systemPrompt: "You are a worker",
      contextWindow: 128_000,
      maxContextRounds: 20,
      config: {
        apiKey: "test-key",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 8192,
        temperature: 0.3,
      },
    })

    runtime.setSystemPrompt("Updated prompt")
    expect(runtime.getSystemPrompt()).toBe("Updated prompt")
  })

  it("should reset runtime", () => {
    const client = createMockClient()
    const runtime = new AgentRuntime({
      role: "worker",
      client,
      systemPrompt: "You are a worker",
      contextWindow: 128_000,
      maxContextRounds: 20,
      config: {
        apiKey: "test-key",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 8192,
        temperature: 0.3,
      },
    })

    runtime.reset()
    expect(runtime.getStatus()).toBe("idle")
    // After reset, messages still include system prompt from prefix
    expect(runtime.getState().messages.length).toBeGreaterThan(0)
  })

  it("should interrupt runtime", () => {
    const client = createMockClient()
    const runtime = new AgentRuntime({
      role: "worker",
      client,
      systemPrompt: "You are a worker",
      contextWindow: 128_000,
      maxContextRounds: 20,
      config: {
        apiKey: "test-key",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 8192,
        temperature: 0.3,
      },
    })

    runtime.interrupt()
    expect(runtime.getStatus()).toBe("idle")
  })

  it("should have getEngine method", () => {
    const client = createMockClient()
    const runtime = new AgentRuntime({
      role: "worker",
      client,
      systemPrompt: "You are a worker",
      contextWindow: 128_000,
      maxContextRounds: 20,
      config: {
        apiKey: "test-key",
        baseUrl: "https://test.com",
        model: "test-model",
        maxTokens: 8192,
        temperature: 0.3,
      },
    })

    expect(runtime.getEngine()).toBeDefined()
  })
})

describe("DualAgentRuntime", () => {
  const defaultWorkerConfig = {
    apiKey: "test-key",
    baseUrl: "https://test.com",
    model: "test-model",
    maxTokens: 8192,
    temperature: 0.3,
  }

  const defaultSupervisorConfig = {
    apiKey: "test-key",
    baseUrl: "https://test.com",
    model: "test-model",
    maxTokens: 8192,
    temperature: 0.3,
  }

  it("should create dual runtime with worker and supervisor", () => {
    const workerClient = createMockClient(["Worker response"])
    const supervisorClient = createMockClient(["Supervisor response"])

    const runtime = new DualAgentRuntime({
      workerClient,
      supervisorClient,
      workerSystemPrompt: "You are a worker",
      supervisorSystemPrompt: "You are a supervisor",
      config: {
        workerModelTarget: "zen/mimo-v2.5-free",
        supervisorModelTarget: "zen/mimo-v2.5-free",
        workerThinking: "high",
        supervisorThinking: "off",
        maxWorkflowRounds: 9,
      },
      workerConfig: defaultWorkerConfig,
      supervisorConfig: defaultSupervisorConfig,
    })

    expect(runtime.getWorker().getRole()).toBe("worker")
    expect(runtime.getSupervisor().getRole()).toBe("supervisor")
    expect(runtime.getActiveRole()).toBe("worker")
  })

  it("should get state for specific role", () => {
    const workerClient = createMockClient()
    const supervisorClient = createMockClient()

    const runtime = new DualAgentRuntime({
      workerClient,
      supervisorClient,
      workerSystemPrompt: "You are a worker",
      supervisorSystemPrompt: "You are a supervisor",
      config: {
        workerModelTarget: "zen/mimo-v2.5-free",
        supervisorModelTarget: "zen/mimo-v2.5-free",
        workerThinking: "high",
        supervisorThinking: "off",
        maxWorkflowRounds: 9,
      },
      workerConfig: defaultWorkerConfig,
      supervisorConfig: defaultSupervisorConfig,
    })

    const workerState = runtime.getState("worker")
    const supervisorState = runtime.getState("supervisor")

    expect(workerState.role).toBe("worker")
    expect(supervisorState.role).toBe("supervisor")
  })

  it("should interrupt role", () => {
    const workerClient = createMockClient()
    const supervisorClient = createMockClient()

    const runtime = new DualAgentRuntime({
      workerClient,
      supervisorClient,
      workerSystemPrompt: "You are a worker",
      supervisorSystemPrompt: "You are a supervisor",
      config: {
        workerModelTarget: "zen/mimo-v2.5-free",
        supervisorModelTarget: "zen/mimo-v2.5-free",
        workerThinking: "high",
        supervisorThinking: "off",
        maxWorkflowRounds: 9,
      },
      workerConfig: defaultWorkerConfig,
      supervisorConfig: defaultSupervisorConfig,
    })

    runtime.interruptRole({ role: "worker", reason: "Test interrupt" })
    expect(runtime.getWorker().getStatus()).toBe("idle")
  })

  it("should reset runtime", () => {
    const workerClient = createMockClient()
    const supervisorClient = createMockClient()

    const runtime = new DualAgentRuntime({
      workerClient,
      supervisorClient,
      workerSystemPrompt: "You are a worker",
      supervisorSystemPrompt: "You are a supervisor",
      config: {
        workerModelTarget: "zen/mimo-v2.5-free",
        supervisorModelTarget: "zen/mimo-v2.5-free",
        workerThinking: "high",
        supervisorThinking: "off",
        maxWorkflowRounds: 9,
      },
      workerConfig: defaultWorkerConfig,
      supervisorConfig: defaultSupervisorConfig,
    })

    runtime.reset()

    expect(runtime.getActiveRole()).toBe("worker")
  })

  it("should not have duplicate workflow state", () => {
    const workerClient = createMockClient()
    const supervisorClient = createMockClient()

    const runtime = new DualAgentRuntime({
      workerClient,
      supervisorClient,
      workerSystemPrompt: "You are a worker",
      supervisorSystemPrompt: "You are a supervisor",
      config: {
        workerModelTarget: "zen/mimo-v2.5-free",
        supervisorModelTarget: "zen/mimo-v2.5-free",
        workerThinking: "high",
        supervisorThinking: "off",
        maxWorkflowRounds: 9,
      },
      workerConfig: defaultWorkerConfig,
      supervisorConfig: defaultSupervisorConfig,
    })

    // 新架构中，DualAgentRuntime 不再管理 workflow 状态
    // workflow 状态由 WorkflowCoordinator 管理
    expect((runtime as any).workflow).toBeUndefined()
    expect(typeof (runtime as any).transitionWorkflow).toBe("undefined")
    expect(typeof (runtime as any).canContinue).toBe("undefined")
  })
})
