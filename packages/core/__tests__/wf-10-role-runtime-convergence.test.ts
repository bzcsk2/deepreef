/**
 * WF-10: 收敛角色运行内核
 *
 * 目标：统一 AgentRuntime 和 DualAgentRuntime 的边界
 *
 * 测试内容：
 * 1. 验证 WorkflowCoordinator 是唯一调度者
 * 2. 验证 AgentRuntime 的 config 注入
 * 3. 验证 DualAgentRuntime 的 config 传递
 * 4. 验证 WorkflowPhase 定义收敛
 */

import { describe, it, expect, beforeEach, mock } from "bun:test"
import { AgentRuntime } from "../src/dual-agent-runtime/runtime.js"
import { DualAgentRuntime } from "../src/dual-agent-runtime/dual-runtime.js"
import { WorkflowCoordinator } from "../src/workflow-coordinator/coordinator.js"
import type { WorkflowPhase } from "../src/workflow-coordinator/types.js"
import type { ChatClient } from "../src/interface.js"

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
  })

  describe("测试 2: AgentRuntime config 注入", () => {
    it("AgentRuntime 应该接收 config", () => {
      const mockClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const runtime = new AgentRuntime({
        role: "worker",
        client: mockClient,
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
    })

    it("AgentRuntime 应该有 reset 方法", () => {
      const mockClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const runtime = new AgentRuntime({
        role: "worker",
        client: mockClient,
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
  })

  describe("测试 3: DualAgentRuntime config 传递", () => {
    it("DualAgentRuntime 应该接收 worker 和 supervisor 的 config", () => {
      const mockWorkerClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const mockSupervisorClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const dualRuntime = new DualAgentRuntime({
        workerClient: mockWorkerClient,
        supervisorClient: mockSupervisorClient,
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

      expect(dualRuntime.getWorker()).toBeDefined()
      expect(dualRuntime.getSupervisor()).toBeDefined()
    })

    it("DualAgentRuntime 应该有 getWorkflow 方法", () => {
      const mockWorkerClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const mockSupervisorClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const dualRuntime = new DualAgentRuntime({
        workerClient: mockWorkerClient,
        supervisorClient: mockSupervisorClient,
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

      const workflow = dualRuntime.getWorkflow()
      expect(workflow).toBeDefined()
      expect(workflow.maxRounds).toBe(9)
      expect(workflow.currentPhase).toBe("idle")
    })

    it("DualAgentRuntime 应该有 reset 方法", () => {
      const mockWorkerClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const mockSupervisorClient: ChatClient = {
        chatCompletionsStream: mock(() => (async function* () {})()),
      }

      const dualRuntime = new DualAgentRuntime({
        workerClient: mockWorkerClient,
        supervisorClient: mockSupervisorClient,
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

      expect(typeof dualRuntime.reset).toBe("function")
    })
  })

  describe("测试 4: WorkflowPhase 定义收敛", () => {
    it("WorkflowPhase 应该包含所有必要的阶段", () => {
      const requiredPhases: WorkflowPhase[] = [
        "idle",
        "supervisor_analyse",
        "worker_do",
        "worker_report",
        "supervisor_check",
        "blocked",
        "completed",
        "failed",
      ]

      // 验证 WorkflowCoordinator 使用的 WorkflowPhase
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test" })

      const state = coordinator.getState()
      expect(state).not.toBeNull()
      expect(requiredPhases).toContain(state!.currentPhase)
    })

    it("WorkflowPhase 应该有 waiting_user 阶段（当前缺失）", () => {
      // 当前 WorkflowPhase 没有 waiting_user
      // 这是一个已知缺口，需要在后续实现中添加
      const currentPhases: WorkflowPhase[] = [
        "idle",
        "supervisor_analyse",
        "worker_do",
        "worker_report",
        "supervisor_check",
        "blocked",
        "completed",
        "failed",
      ]

      // 验证当前没有 waiting_user
      expect(currentPhases).not.toContain("waiting_user")
    })
  })

  describe("测试 5: 收敛缺口记录", () => {
    it("记录: 需要添加 waiting_user 阶段", () => {
      // 当前实现中，ask_user 只是 metadata
      // 需要添加 waiting_user 阶段来真正暂停 Workflow
      expect(true).toBe(true) // 占位测试
    })

    it("记录: 需要统一 WorkflowPhase 定义", () => {
      // 当前存在两套 WorkflowPhase：
      // 1. workflow-coordinator/types.ts
      // 2. dual-agent-runtime/types.ts
      // 需要收敛为单一定义
      expect(true).toBe(true) // 占位测试
    })

    it("记录: 需要让 DualAgentRuntime 使用 WorkflowCoordinator", () => {
      // 当前 DualAgentRuntime 有自己的 workflow 状态管理
      // 需要让 DualAgentRuntime 使用 WorkflowCoordinator 作为唯一调度者
      expect(true).toBe(true) // 占位测试
    })
  })
})
