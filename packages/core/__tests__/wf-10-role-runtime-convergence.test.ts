/**
 * WF-10: 收敛角色运行内核
 *
 * 目标：统一 AgentRuntime 和 DualAgentRuntime 的边界
 *
 * 测试内容：
 * 1. 验证 WorkflowCoordinator 是唯一调度者
 * 2. 验证 AgentRuntime 委托给 ReasonixEngine
 * 3. 验证 DualAgentRuntime 管理两个 Runtime
 * 4. 验证 WorkflowPhase 定义包含 waiting_user
 */

import { describe, it, expect, mock } from "bun:test"
import { AgentRuntime } from "../src/dual-agent-runtime/runtime.js"
import { DualAgentRuntime } from "../src/dual-agent-runtime/dual-runtime.js"
import { WorkflowCoordinator } from "../src/workflow-coordinator/coordinator.js"
import type { WorkflowPhase } from "../src/workflow-coordinator/types.js"
import type { ChatClient } from "../src/interface.js"

function createMockClient(): ChatClient {
  return {
    chatCompletionsStream: mock(() => (async function* () {})()),
  }
}

function createDualRuntime() {
  return new DualAgentRuntime({
    workerClient: createMockClient(),
    supervisorClient: createMockClient(),
    workerSystemPrompt: "You are a worker",
    supervisorSystemPrompt: "You are a supervisor",
    config: {
      workerModelTarget: "deepseek-chat",
      supervisorModelTarget: "deepseek-reasoner",
      workerThinking: "high",
      supervisorThinking: "off",
      maxWorkflowRounds: 9,
    },
    workerConfig: {
      apiKey: "worker-key",
      baseUrl: "https://api.worker.com",
      model: "worker-model",
      maxTokens: 4096,
      temperature: 0.7,
    },
    supervisorConfig: {
      apiKey: "supervisor-key",
      baseUrl: "https://api.supervisor.com",
      model: "supervisor-model",
      maxTokens: 8192,
      temperature: 0.3,
    },
  })
}

describe("WF-10: 角色运行内核收敛测试", () => {
  describe("测试 1: WorkflowCoordinator 是唯一调度者", () => {
    it("WorkflowCoordinator 应该有 startWorkflow 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.startWorkflow).toBe("function")
    })

    it("WorkflowCoordinator 应该有 transition 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.transition).toBe("function")
    })

    it("WorkflowCoordinator 应该有 canContinue 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.canContinue).toBe("function")
    })

    it("WorkflowCoordinator 应该有 isFinished 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.isFinished).toBe("function")
    })

    it("WorkflowCoordinator 应该有 saveCheckpoint 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.saveCheckpoint).toBe("function")
    })

    it("WorkflowCoordinator 应该有 restoreCheckpoint 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.restoreCheckpoint).toBe("function")
    })

    it("WorkflowCoordinator 应该有 runWorkflow 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.runWorkflow).toBe("function")
    })

    it("WorkflowCoordinator 应该有 setRuntime 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.setRuntime).toBe("function")
    })

    it("WorkflowCoordinator 应该有 setQuestionService 方法", () => {
      const coordinator = new WorkflowCoordinator()
      expect(typeof coordinator.setQuestionService).toBe("function")
    })
  })

  describe("测试 2: AgentRuntime 委托给 ReasonixEngine", () => {
    it("AgentRuntime 应该接收 config 并创建 ReasonixEngine", () => {
      const runtime = new AgentRuntime({
        role: "worker",
        client: createMockClient(),
        systemPrompt: "You are a worker",
        contextWindow: 128_000,
        maxContextRounds: 20,
        config: {
          apiKey: "test-key",
          baseUrl: "https://api.test.com",
          model: "test-model",
          maxTokens: 4096,
          temperature: 0.7,
        },
      })

      expect(runtime.getRole()).toBe("worker")
      expect(runtime.getStatus()).toBe("idle")
      expect(runtime.getEngine()).toBeDefined()
    })

    it("AgentRuntime 应该有 reset 方法", () => {
      const runtime = new AgentRuntime({
        role: "worker",
        client: createMockClient(),
        systemPrompt: "You are a worker",
        contextWindow: 128_000,
        maxContextRounds: 20,
        config: {
          apiKey: "test-key",
          baseUrl: "https://api.test.com",
          model: "test-model",
          maxTokens: 4096,
          temperature: 0.7,
        },
      })

      expect(typeof runtime.reset).toBe("function")
    })

    it("AgentRuntime 应该有 interrupt 方法", () => {
      const runtime = new AgentRuntime({
        role: "worker",
        client: createMockClient(),
        systemPrompt: "You are a worker",
        contextWindow: 128_000,
        maxContextRounds: 20,
        config: {
          apiKey: "test-key",
          baseUrl: "https://api.test.com",
          model: "test-model",
          maxTokens: 4096,
          temperature: 0.7,
        },
      })

      expect(typeof runtime.interrupt).toBe("function")
    })

    it("AgentRuntime 应该有 submit 方法", () => {
      const runtime = new AgentRuntime({
        role: "worker",
        client: createMockClient(),
        systemPrompt: "You are a worker",
        contextWindow: 128_000,
        maxContextRounds: 20,
        config: {
          apiKey: "test-key",
          baseUrl: "https://api.test.com",
          model: "test-model",
          maxTokens: 4096,
          temperature: 0.7,
        },
      })

      expect(typeof runtime.submit).toBe("function")
    })
  })

  describe("测试 3: DualAgentRuntime 管理两个 Runtime", () => {
    it("DualAgentRuntime 应该接收 worker 和 supervisor 的 config", () => {
      const dualRuntime = createDualRuntime()

      expect(dualRuntime.getWorker()).toBeDefined()
      expect(dualRuntime.getSupervisor()).toBeDefined()
    })

    it("DualAgentRuntime 应该有 sendDirect 方法", () => {
      const dualRuntime = createDualRuntime()
      expect(typeof dualRuntime.sendDirect).toBe("function")
    })

    it("DualAgentRuntime 应该有 interruptRole 方法", () => {
      const dualRuntime = createDualRuntime()
      expect(typeof dualRuntime.interruptRole).toBe("function")
    })

    it("DualAgentRuntime 应该有 reset 方法", () => {
      const dualRuntime = createDualRuntime()
      expect(typeof dualRuntime.reset).toBe("function")
    })

    it("DualAgentRuntime 应该有 getState 方法", () => {
      const dualRuntime = createDualRuntime()
      expect(typeof dualRuntime.getState).toBe("function")
    })

    it("DualAgentRuntime 应该获取特定角色的状态", () => {
      const dualRuntime = createDualRuntime()

      const workerState = dualRuntime.getState("worker")
      expect(workerState).toBeDefined()
      expect(workerState.role).toBe("worker")

      const supervisorState = dualRuntime.getState("supervisor")
      expect(supervisorState).toBeDefined()
      expect(supervisorState.role).toBe("supervisor")
    })

    it("DualAgentRuntime 不应该有重复的 workflow 状态", () => {
      const dualRuntime = createDualRuntime()

      // 新架构中，DualAgentRuntime 不再管理 workflow 状态
      // workflow 状态由 WorkflowCoordinator 管理
      expect((dualRuntime as any).workflow).toBeUndefined()
      expect(typeof (dualRuntime as any).transitionWorkflow).toBe("undefined")
      expect(typeof (dualRuntime as any).canContinue).toBe("undefined")
    })
  })

  describe("测试 4: WorkflowPhase 定义收敛", () => {
    it("WorkflowPhase 应该包含 waiting_user 阶段", () => {
      const requiredPhases: WorkflowPhase[] = [
        "idle",
        "supervisor_analyse",
        "worker_do",
        "worker_report",
        "supervisor_check",
        "waiting_user",
        "blocked",
        "completed",
        "failed",
      ]

      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test" })

      const state = coordinator.getState()
      expect(state).not.toBeNull()
      expect(requiredPhases).toContain(state!.currentPhase)
    })

    it("WorkflowCoordinator 应该支持 waiting_user 转换", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test" })

      // 从 idle 转换到 supervisor_analyse
      coordinator.transition("supervisor_analyse")

      // 从 supervisor_analyse 转换到 waiting_user
      const result = coordinator.transition("waiting_user")
      expect(result.success).toBe(true)

      const state = coordinator.getState()
      expect(state!.currentPhase).toBe("waiting_user")
    })
  })

  describe("测试 5: Workflow 状态管理", () => {
    it("WorkflowCoordinator 应该从 waiting_user 恢复到 supervisor_analyse", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("waiting_user")

      // 从 waiting_user 恢复到 supervisor_analyse
      const result = coordinator.transition("supervisor_analyse")
      expect(result.success).toBe(true)

      const state = coordinator.getState()
      expect(state!.currentPhase).toBe("supervisor_analyse")
    })

    it("WorkflowCoordinator 应该支持 checkpoint 保存和恢复", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")

      const checkpoint = coordinator.saveCheckpoint()
      expect(checkpoint).toBeDefined()
      expect(checkpoint.state.currentPhase).toBe("worker_do")

      const newCoordinator = new WorkflowCoordinator()
      newCoordinator.restoreCheckpoint(checkpoint)

      const restoredState = newCoordinator.getState()
      expect(restoredState!.currentPhase).toBe("worker_do")
      expect(restoredState!.goal).toBe("test")
    })
  })
})
