/**
 * WF-20: 固定 WorkflowCoordinator 执行器
 *
 * 目标：让 WorkflowCoordinator 真正执行 Workflow
 *
 * 测试内容：
 * 1. 验证 WorkflowCoordinator 可以驱动完整的 Workflow 循环
 * 2. 验证 WorkflowCoordinator 可以处理 ask_user 决策
 * 3. 验证 WorkflowCoordinator 可以处理 blocked 状态
 * 4. 验证 WorkflowCoordinator 可以处理 failed 状态
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { WorkflowCoordinator } from "../src/workflow-coordinator/coordinator.js"
import type { WorkflowSupervisorAdvice, WorkflowDecision } from "../src/workflow-coordinator/types.js"

describe("WF-20: WorkflowCoordinator 执行器测试", () => {
  describe("测试 1: 完整 Workflow 循环", () => {
    it("应该支持 idle → supervisor_analyse → worker_do → worker_report → supervisor_check → supervisor_analyse 循环", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      // 第一轮
      let result = coordinator.transition("supervisor_analyse")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_analyse")
      expect(coordinator.getState()?.iteration).toBe(1)

      result = coordinator.transition("worker_do")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("worker_do")

      result = coordinator.transition("worker_report")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("worker_report")

      result = coordinator.transition("supervisor_check")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_check")

      // 第二轮
      result = coordinator.transition("supervisor_analyse")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_analyse")
      expect(coordinator.getState()?.iteration).toBe(2)
    })

    it("应该在达到最大轮数时停止", () => {
      const coordinator = new WorkflowCoordinator({ config: { maxRounds: 2 } })
      coordinator.startWorkflow({ goal: "test goal" })

      // 第一轮
      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("worker_report")
      coordinator.transition("supervisor_check")

      // 第二轮
      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("worker_report")
      coordinator.transition("supervisor_check")

      // 第三轮应该被阻止
      expect(coordinator.canContinue()).toBe(false)
    })
  })

  describe("测试 2: ask_user 决策处理", () => {
    it("应该支持 ask_user 决策", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      // 进入 supervisor_check
      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("worker_report")
      coordinator.transition("supervisor_check")

      // 创建 ask_user 决策
      const advice: WorkflowSupervisorAdvice = {
        workflowId: coordinator.getState()!.workflowId,
        iteration: coordinator.getState()!.iteration,
        ledgerVersion: coordinator.getState()!.ledgerVersion,
        decision: "ask_user",
        feedback: "需要用户确认",
        timestamp: Date.now(),
        stale: false,
      }

      // 应用建议
      const applied = coordinator.applyAdvice(advice)
      expect(applied).toBe(true)
      expect(coordinator.getState()?.lastDecision).toBe("ask_user")
    })

    it("应该支持 blocked 状态", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      // 进入 supervisor_analyse
      coordinator.transition("supervisor_analyse")

      // 创建 blocked 决策
      const advice: WorkflowSupervisorAdvice = {
        workflowId: coordinator.getState()!.workflowId,
        iteration: coordinator.getState()!.iteration,
        ledgerVersion: coordinator.getState()!.ledgerVersion,
        decision: "blocked",
        feedback: "需要更多信息",
        timestamp: Date.now(),
        stale: false,
      }

      // 应用建议
      const applied = coordinator.applyAdvice(advice)
      expect(applied).toBe(true)
      expect(coordinator.getState()?.lastDecision).toBe("blocked")

      // 转换到 blocked 状态
      const result = coordinator.transition("blocked", "需要用户输入")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("blocked")
      expect(coordinator.getState()?.blockedReason).toBe("需要用户输入")
    })
  })

  describe("测试 3: failed 状态处理", () => {
    it("应该支持从任何状态转换到 failed", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      // 从 idle 转换到 failed
      let result = coordinator.transition("failed", "测试失败")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("failed")
      expect(coordinator.getState()?.blockedReason).toBe("测试失败")

      // 验证 canContinue 返回 false
      expect(coordinator.canContinue()).toBe(false)
      expect(coordinator.isFinished()).toBe(true)
    })

    it("应该支持从 supervisor_analyse 转换到 failed", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      coordinator.transition("supervisor_analyse")
      const result = coordinator.transition("failed", "分析失败")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("failed")
    })
  })

  describe("测试 4: 检查点和恢复", () => {
    it("应该支持保存和恢复检查点", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      // 执行一些转换
      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("worker_report")

      // 保存检查点
      const checkpoint = coordinator.saveCheckpoint()
      expect(checkpoint).toBeDefined()
      expect(checkpoint.state.currentPhase).toBe("worker_report")
      expect(checkpoint.state.iteration).toBe(1)

      // 继续执行
      coordinator.transition("supervisor_check")

      // 恢复检查点
      coordinator.restoreCheckpoint(checkpoint)
      expect(coordinator.getState()?.currentPhase).toBe("worker_report")
      expect(coordinator.getState()?.iteration).toBe(1)
    })
  })

  describe("测试 5: 无效转换处理", () => {
    it("应该拒绝无效转换", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      // 尝试从 idle 转换到 worker_do（无效）
      const result = coordinator.transition("worker_do")
      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid transition")
    })

    it("应该拒绝从 completed 转换", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      coordinator.transition("completed")
      const result = coordinator.transition("supervisor_analyse")
      expect(result.success).toBe(false)
    })

    it("应该拒绝从 failed 转换", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      coordinator.transition("failed")
      const result = coordinator.transition("supervisor_analyse")
      expect(result.success).toBe(false)
    })
  })
})
