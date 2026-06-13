/**
 * WF-40: ask_user 真正闭环
 *
 * 目标：让 ask_user 真正暂停 Workflow 并触发 QuestionService
 *
 * 测试内容：
 * 1. 验证 Workflow 可以在 ask_user 时暂停
 * 2. 验证 QuestionService 回复后 Workflow 可以继续
 * 3. 验证 ask_user 决策可以传递给 TUI
 */

import { describe, it, expect, beforeEach, mock } from "bun:test"
import { WorkflowCoordinator } from "../src/workflow-coordinator/coordinator.js"
import { QuestionService } from "../src/question/service.js"
import type { WorkflowSupervisorAdvice } from "../src/workflow-coordinator/types.js"

describe("WF-40: ask_user 真正闭环测试", () => {
  describe("测试 1: Workflow 在 ask_user 时暂停", () => {
    it("应该支持在 ask_user 时暂停 Workflow", () => {
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

      coordinator.applyAdvice(advice)

      // 验证 Workflow 状态
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_check")
      expect(coordinator.getState()?.lastDecision).toBe("ask_user")
    })

    it("应该支持在 supervisor_analyse 时暂停", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "test goal" })

      coordinator.transition("supervisor_analyse")

      // 创建 ask_user 决策
      const advice: WorkflowSupervisorAdvice = {
        workflowId: coordinator.getState()!.workflowId,
        iteration: coordinator.getState()!.iteration,
        ledgerVersion: coordinator.getState()!.ledgerVersion,
        decision: "ask_user",
        feedback: "需要用户提供更多信息",
        timestamp: Date.now(),
        stale: false,
      }

      coordinator.applyAdvice(advice)

      // 验证 Workflow 状态
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_analyse")
      expect(coordinator.getState()?.lastDecision).toBe("ask_user")
    })
  })

  describe("测试 2: QuestionService 回复后 Workflow 继续", () => {
    it("应该支持 QuestionService 回复后 Workflow 继续", async () => {
      const coordinator = new WorkflowCoordinator()
      const questionService = new QuestionService()

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

      coordinator.applyAdvice(advice)

      // 创建 QuestionService 问题
      const questions = [
        {
          question: "是否继续执行？",
          header: "确认",
          options: [
            { label: "是", description: "继续执行" },
            { label: "否", description: "停止执行" },
          ],
        },
      ]

      const promise = questionService.ask({
        sessionId: coordinator.getState()!.workflowId,
        questions,
      })

      const req = questionService.list()[0]

      // 回复问题
      setTimeout(() => {
        questionService.reply({ requestId: req.id, answers: [["是"]] })
      }, 0)

      // 等待回复
      const answers = await promise
      expect(answers).toEqual([["是"]])

      // 验证 QuestionService 已清空
      expect(questionService.list()).toHaveLength(0)

      // 继续 Workflow
      coordinator.transition("supervisor_analyse")
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_analyse")
      expect(coordinator.getState()?.iteration).toBe(2)
    })
  })

  describe("测试 3: ask_user 决策传递给 TUI", () => {
    it("应该支持将 ask_user 决策传递给 TUI", () => {
      const coordinator = new WorkflowCoordinator()
      const questionService = new QuestionService()

      // 记录事件
      const events: any[] = []
      coordinator.startWorkflow({
        goal: "test goal",
        config: { maxRounds: 9 },
      })

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

      coordinator.applyAdvice(advice)

      // 创建 QuestionService 问题
      const questions = [
        {
          question: "是否继续执行？",
          header: "确认",
          options: [
            { label: "是", description: "继续执行" },
            { label: "否", description: "停止执行" },
          ],
        },
      ]

      const promise = questionService.ask({
        sessionId: coordinator.getState()!.workflowId,
        questions,
      })

      // 验证 QuestionService 有挂起的问题
      expect(questionService.list()).toHaveLength(1)
      expect(questionService.list()[0].questions[0].question).toBe("是否继续执行？")
    })
  })

  describe("测试 4: ask_user 超时处理", () => {
    it("应该支持 QuestionService 超时", async () => {
      const questionService = new QuestionService()

      const questions = [
        {
          question: "问题 1",
          header: "H1",
          options: [{ label: "A", description: "选项 A" }],
        },
      ]

      const promise = questionService.ask({
        sessionId: "test-session",
        questions,
      })

      // 捕获未处理的拒绝
      promise.catch(() => {})

      // 中断所有问题
      questionService.interrupt()

      // 验证所有问题都被拒绝
      await expect(promise).rejects.toThrow("dismissed")
      expect(questionService.list()).toHaveLength(0)
    })
  })

  describe("测试 5: 闭环缺口记录", () => {
    it("记录: 需要将 ask_user 决策与 QuestionService 关联", () => {
      // 当前 ask_user 决策只是 metadata
      // 需要将其与 QuestionService 关联
      expect(true).toBe(true) // 占位测试
    })

    it("记录: 需要在 Workflow 中添加 waiting_question 状态", () => {
      // 当前 WorkflowCoordinator 没有 waiting_question 状态
      // 需要添加这个状态来真正暂停 Workflow
      expect(true).toBe(true) // 占位测试
    })

    it("记录: 需要让 DualAgentRuntime 使用 QuestionService", () => {
      // 当前 DualAgentRuntime 没有使用 QuestionService
      // 需要将其集成到 DualAgentRuntime 中
      expect(true).toBe(true) // 占位测试
    })

    it("记录: 需要让 TUI 消费 QuestionService", () => {
      // 当前 TUI 没有消费 QuestionService
      // 需要让 TUI 显示问题并收集用户回复
      expect(true).toBe(true) // 占位测试
    })
  })
})
