import { describe, it, expect, vi } from "vitest"
import { WorkflowCoordinator } from "../src/workflow-coordinator/coordinator.js"
import type { WorkflowSupervisorAdvice } from "../src/workflow-coordinator/types.js"

describe("WorkflowCoordinator", () => {
  it("resumes a user-interrupted workflow with the user's instruction", async () => {
    const supervisorInputs: string[] = []
    let supervisorMessage = ""
    let supervisorCalls = 0
    let coordinator: WorkflowCoordinator
    const runtime = {
      getSupervisor: () => ({
        submit: async function* (input: string) {
          supervisorInputs.push(input)
          supervisorCalls++
          supervisorMessage = supervisorCalls === 1 ? "Initial plan" : supervisorCalls === 2 ? "Resumed plan" : "approve"
          yield { role: "assistant_final", content: supervisorMessage }
          if (supervisorCalls === 1) coordinator.interrupt()
        },
        getState: () => ({ messages: [{ role: "assistant", content: supervisorMessage }] }),
      }),
      getWorker: () => ({
        submit: async function* () {
          yield { role: "assistant_final", content: "done" }
        },
        getState: () => ({ messages: [{ role: "assistant", content: "done" }] }),
      }),
    }

    coordinator = new WorkflowCoordinator({ runtime: runtime as any })
    coordinator.startWorkflow({ goal: "fix interrupt recovery" })
    for await (const _event of coordinator.runWorkflow()) { /* consume */ }

    expect(coordinator.getState()?.currentPhase).toBe("blocked")
    expect(coordinator.getState()?.blockedReason).toBe("Interrupted by user")

    coordinator.resumeInterruptedWorkflow("continue from the latest state")
    for await (const _event of coordinator.runWorkflow()) { /* consume */ }

    expect(supervisorInputs[1]).toContain("User instruction after interrupt:\ncontinue from the latest state")
    expect(supervisorInputs[1]).toContain("Previous Plan:\nInitial plan")
    expect(coordinator.getState()?.iteration).toBe(1)
    expect(coordinator.getState()?.currentPhase).toBe("completed")
  })

  it("does not resume a workflow blocked for a non-interrupt reason", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "test" })
    coordinator.transition("blocked", "Max rounds reached")

    expect(() => coordinator.resumeInterruptedWorkflow("continue")).toThrow(
      "Only a workflow interrupted by the user can be resumed",
    )
  })

  it("carries Supervisor review into a real second workflow iteration", async () => {
    const supervisorInputs: string[] = []
    const workerInputs: string[] = []
    let supervisorCalls = 0
    let workerCalls = 0
    let supervisorMessage = ""
    let workerMessage = ""

    const runtime = {
      getSupervisor: () => ({
        submit: async function* (input: string) {
          supervisorInputs.push(input)
          supervisorCalls++
          supervisorMessage = supervisorCalls === 1
            ? "Plan iteration one"
            : supervisorCalls === 2
              ? "continue: inspect the remaining rendering path"
              : supervisorCalls === 3
                ? "Plan iteration two using the previous report"
                : "approve"
          yield { role: "assistant_final", content: supervisorMessage }
        },
        getState: () => ({ messages: [{ role: "assistant", content: supervisorMessage }] }),
      }),
      getWorker: () => ({
        submit: async function* (input: string) {
          workerInputs.push(input)
          workerCalls++
          workerMessage = workerCalls % 2 === 0
            ? `Report ${workerCalls / 2}`
            : `Work ${Math.ceil(workerCalls / 2)}`
          yield { role: "assistant_final", content: workerMessage }
        },
        getState: () => ({ messages: [{ role: "assistant", content: workerMessage }] }),
      }),
    }

    const coordinator = new WorkflowCoordinator({ runtime: runtime as any, config: { maxRounds: 3 } })
    coordinator.startWorkflow({ goal: "fix rendering" })
    for await (const _event of coordinator.runWorkflow()) { /* consume */ }

    expect(coordinator.getState()?.currentPhase).toBe("completed")
    expect(coordinator.getState()?.iteration).toBe(2)
    expect(supervisorInputs[2]).toContain("iteration 2")
    expect(supervisorInputs[2]).toContain("Previous Worker Report:\nReport 1")
    expect(supervisorInputs[2]).toContain("Your Previous Review:\ncontinue: inspect the remaining rendering path")
    expect(workerInputs[2]).toContain("Plan iteration two using the previous report")
    expect(workerInputs[2]).toContain("Supervisor feedback from the previous iteration")
  })

  it("blocks at max rounds without emitting a phantom next iteration", async () => {
    let supervisorMessage = ""
    let workerMessage = ""
    let supervisorCalls = 0
    const runtime = {
      getSupervisor: () => ({
        submit: async function* () {
          supervisorCalls++
          supervisorMessage = supervisorCalls === 1 ? "Plan one" : "continue"
          yield { role: "assistant_final", content: supervisorMessage }
        },
        getState: () => ({ messages: [{ role: "assistant", content: supervisorMessage }] }),
      }),
      getWorker: () => ({
        submit: async function* () {
          workerMessage = "done"
          yield { role: "assistant_final", content: workerMessage }
        },
        getState: () => ({ messages: [{ role: "assistant", content: workerMessage }] }),
      }),
    }
    const coordinator = new WorkflowCoordinator({ runtime: runtime as any, config: { maxRounds: 1 } })
    coordinator.startWorkflow({ goal: "test" })
    const events: any[] = []
    for await (const event of coordinator.runWorkflow()) events.push(event)

    expect(coordinator.getState()?.iteration).toBe(1)
    expect(coordinator.getState()?.blockedReason).toBe("Max rounds reached")
    expect(events.some(event => event.type === "iteration_change" && event.iteration === 2)).toBe(false)
  })

  it("yields phase events before role output so consumers can label each role", async () => {
    const roleEvent = { role: "assistant_final", content: "plan" } as const
    const runtime = {
      getSupervisor: () => ({
        submit: async function* () { yield roleEvent },
        getState: () => ({ messages: [{ role: "assistant", content: "approve" }] }),
      }),
      getWorker: () => ({
        submit: async function* () { yield { role: "assistant_final", content: "done" } },
        getState: () => ({ messages: [{ role: "assistant", content: "done" }] }),
      }),
    }
    const coordinator = new WorkflowCoordinator({ runtime: runtime as any })
    coordinator.startWorkflow({ goal: "test" })

    const events: any[] = []
    for await (const event of coordinator.runWorkflow()) events.push(event)

    const supervisorPhase = events.findIndex(event => event.type === "phase_change" && event.phase === "supervisor_analyse")
    const supervisorOutput = events.findIndex(event => event.role === "assistant_final" && event.content === "plan")
    const workerPhase = events.findIndex(event => event.type === "phase_change" && event.phase === "worker_do")
    const workerOutput = events.findIndex(event => event.role === "assistant_final" && event.content === "done")

    expect(supervisorPhase).toBeGreaterThanOrEqual(0)
    expect(supervisorOutput).toBeGreaterThan(supervisorPhase)
    expect(workerPhase).toBeGreaterThan(supervisorOutput)
    expect(workerOutput).toBeGreaterThan(workerPhase)
  })

  it("blocks instead of starting Worker when Supervisor analysis fails", async () => {
    let workerCalls = 0
    const runtime = {
      getSupervisor: () => ({
        submit: async function* () { yield { role: "error", content: "HTTP 400" } },
        getState: () => ({ messages: [] }),
      }),
      getWorker: () => ({
        submit: async function* () { workerCalls++ },
        getState: () => ({ messages: [] }),
      }),
    }
    const coordinator = new WorkflowCoordinator({ runtime: runtime as any })
    coordinator.startWorkflow({ goal: "test" })

    const events: any[] = []
    for await (const event of coordinator.runWorkflow()) events.push(event)

    expect(workerCalls).toBe(0)
    expect(coordinator.getState()?.currentPhase).toBe("blocked")
    expect(events).toContainEqual(expect.objectContaining({ type: "blocked", reason: "HTTP 400" }))
  })

  it("blocks instead of starting Worker when Supervisor returns no plan", async () => {
    let workerCalls = 0
    const runtime = {
      getSupervisor: () => ({
        submit: async function* () { yield { role: "done" } },
        getState: () => ({ messages: [{ role: "assistant", content: "" }] }),
      }),
      getWorker: () => ({
        submit: async function* () { workerCalls++ },
        getState: () => ({ messages: [] }),
      }),
    }
    const coordinator = new WorkflowCoordinator({ runtime: runtime as any })
    coordinator.startWorkflow({ goal: "test" })

    for await (const _event of coordinator.runWorkflow()) { /* consume */ }

    expect(workerCalls).toBe(0)
    expect(coordinator.getState()?.blockedReason).toBe("Supervisor did not produce a plan")
  })

  it("should create coordinator with default config", () => {
    const coordinator = new WorkflowCoordinator()
    const config = coordinator.getConfig()

    expect(config.maxRounds).toBe(9)
    expect(config.requireSupervisorPlan).toBe(true)
    expect(config.requireVerificationGate).toBe(true)
  })

  it("should create coordinator with custom config", () => {
    const coordinator = new WorkflowCoordinator({
      config: { maxRounds: 5, requireSupervisorPlan: false },
    })
    const config = coordinator.getConfig()

    expect(config.maxRounds).toBe(5)
    expect(config.requireSupervisorPlan).toBe(false)
    expect(config.requireVerificationGate).toBe(true)
  })

  it("should start workflow", () => {
    const coordinator = new WorkflowCoordinator()
    const state = coordinator.startWorkflow({ goal: "Fix all bugs" })

    expect(state.workflowId).toBeDefined()
    expect(state.goal).toBe("Fix all bugs")
    expect(state.iteration).toBe(0)
    expect(state.currentPhase).toBe("idle")
    expect(state.maxRounds).toBe(9)
  })

  it("should not start workflow if already in progress", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    expect(() => coordinator.startWorkflow({ goal: "New goal" })).toThrow("Workflow already in progress")
  })

  it("should transition between phases", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    coordinator.transition("supervisor_analyse")
    expect(coordinator.getState()?.currentPhase).toBe("supervisor_analyse")
    expect(coordinator.getState()?.iteration).toBe(1)

    coordinator.transition("worker_do")
    expect(coordinator.getState()?.currentPhase).toBe("worker_do")
    expect(coordinator.getState()?.iteration).toBe(1)

    coordinator.transition("worker_report")
    expect(coordinator.getState()?.currentPhase).toBe("worker_report")

    coordinator.transition("supervisor_check")
    expect(coordinator.getState()?.currentPhase).toBe("supervisor_check")
  })

  it("should track phase history", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    coordinator.transition("supervisor_analyse")
    coordinator.transition("worker_do")
    coordinator.transition("worker_report")

    const state = coordinator.getState()
    expect(state?.phaseHistory).toEqual(["idle", "supervisor_analyse", "worker_do"])
  })

  it("should set supervisor plan", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    coordinator.setSupervisorPlan("1. Analyze code\n2. Fix bugs\n3. Test")
    expect(coordinator.getState()?.supervisorPlan).toBe("1. Analyze code\n2. Fix bugs\n3. Test")
  })

  it("should set worker report", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    coordinator.setWorkerReport("Fixed 5 bugs, all tests pass")
    expect(coordinator.getState()?.workerReport).toBe("Fixed 5 bugs, all tests pass")
  })

  it("should apply valid advice", () => {
    const coordinator = new WorkflowCoordinator()
    const state = coordinator.startWorkflow({ goal: "Fix all bugs" })

    coordinator.transition("supervisor_analyse")

    const advice: WorkflowSupervisorAdvice = {
      workflowId: state.workflowId,
      iteration: 1,
      ledgerVersion: 0,
      decision: "continue",
      feedback: "Good progress",
      timestamp: Date.now(),
      stale: false,
    }

    const applied = coordinator.applyAdvice(advice)
    expect(applied).toBe(true)
    expect(coordinator.getState()?.lastDecision).toBe("continue")
  })

  it("should reject advice with wrong workflowId", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")

    const advice: WorkflowSupervisorAdvice = {
      workflowId: "wrong-id",
      iteration: 1,
      ledgerVersion: 0,
      decision: "continue",
      timestamp: Date.now(),
      stale: false,
    }

    const applied = coordinator.applyAdvice(advice)
    expect(applied).toBe(false)
  })

  it("should reject advice with wrong iteration", () => {
    const coordinator = new WorkflowCoordinator()
    const state = coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")

    const advice: WorkflowSupervisorAdvice = {
      workflowId: state.workflowId,
      iteration: 2,
      ledgerVersion: 0,
      decision: "continue",
      timestamp: Date.now(),
      stale: false,
    }

    const applied = coordinator.applyAdvice(advice)
    expect(applied).toBe(false)
  })

  it("should reject stale advice", () => {
    const coordinator = new WorkflowCoordinator()
    const state = coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")

    const advice: WorkflowSupervisorAdvice = {
      workflowId: state.workflowId,
      iteration: 1,
      ledgerVersion: 0,
      decision: "continue",
      timestamp: Date.now(),
      stale: true,
    }

    const applied = coordinator.applyAdvice(advice)
    expect(applied).toBe(false)
  })

  it("should mark advice as stale if ledgerVersion mismatch", () => {
    const coordinator = new WorkflowCoordinator()
    const state = coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")

    const advice: WorkflowSupervisorAdvice = {
      workflowId: state.workflowId,
      iteration: 1,
      ledgerVersion: 5,
      decision: "continue",
      timestamp: Date.now(),
      stale: false,
    }

    const applied = coordinator.applyAdvice(advice)
    expect(applied).toBe(false)
    expect(advice.stale).toBe(true)
  })

  it("should apply revise advice and update goal", () => {
    const coordinator = new WorkflowCoordinator()
    const state = coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")

    const advice: WorkflowSupervisorAdvice = {
      workflowId: state.workflowId,
      iteration: 1,
      ledgerVersion: 0,
      decision: "revise",
      revisedGoal: "Fix critical bugs only",
      timestamp: Date.now(),
      stale: false,
    }

    const applied = coordinator.applyAdvice(advice)
    expect(applied).toBe(true)
    expect(coordinator.getState()?.goal).toBe("Fix critical bugs only")
  })

  it("should check if workflow can continue", () => {
    const coordinator = new WorkflowCoordinator({ config: { maxRounds: 2 } })
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    expect(coordinator.canContinue()).toBe(true)

    coordinator.transition("supervisor_analyse")
    coordinator.transition("worker_do")
    coordinator.transition("worker_report")
    coordinator.transition("supervisor_check")

    coordinator.transition("supervisor_analyse")
    coordinator.transition("worker_do")
    coordinator.transition("worker_report")
    coordinator.transition("supervisor_check")

    expect(coordinator.canContinue()).toBe(false)
  })

  it("should check if workflow is finished", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })

    expect(coordinator.isFinished()).toBe(false)

    coordinator.transition("completed")
    expect(coordinator.isFinished()).toBe(true)
  })

  it("should save and restore checkpoint", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")
    coordinator.setSupervisorPlan("Test plan")

    const checkpoint = coordinator.saveCheckpoint()
    expect(checkpoint.state.goal).toBe("Fix all bugs")
    expect(checkpoint.state.currentPhase).toBe("supervisor_analyse")
    expect(checkpoint.state.supervisorPlan).toBe("Test plan")

    const newCoordinator = new WorkflowCoordinator()
    newCoordinator.restoreCheckpoint(checkpoint)

    expect(newCoordinator.getState()?.goal).toBe("Fix all bugs")
    expect(newCoordinator.getState()?.currentPhase).toBe("supervisor_analyse")
    expect(newCoordinator.getState()?.supervisorPlan).toBe("Test plan")
  })

  it("should reset workflow", () => {
    const coordinator = new WorkflowCoordinator()
    coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")

    coordinator.reset()
    expect(coordinator.getState()).toBeNull()
  })

  it("should emit events", () => {
    const events: any[] = []
    const coordinator = new WorkflowCoordinator({
      onEvent: (event) => events.push(event),
    })

    coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("supervisor_analyse")
    coordinator.transition("worker_do")

    expect(events).toHaveLength(4)
    expect(events[0].type).toBe("phase_change")
    expect(events[0].phase).toBe("idle")
    expect(events[1].type).toBe("iteration_change")
    expect(events[1].iteration).toBe(1)
    expect(events[2].type).toBe("phase_change")
    expect(events[2].phase).toBe("supervisor_analyse")
    expect(events[3].type).toBe("phase_change")
    expect(events[3].phase).toBe("worker_do")
  })

  it("should emit blocked event", () => {
    const events: any[] = []
    const coordinator = new WorkflowCoordinator({
      onEvent: (event) => events.push(event),
    })

    coordinator.startWorkflow({ goal: "Fix all bugs" })
    coordinator.transition("blocked", "Max rounds reached")

    const blockedEvent = events.find((e) => e.type === "blocked")
    expect(blockedEvent).toBeDefined()
    expect(blockedEvent.reason).toBe("Max rounds reached")
  })

  it("should not transition if no workflow in progress", () => {
    const coordinator = new WorkflowCoordinator()
    const result = coordinator.transition("supervisor_analyse")
    expect(result.success).toBe(false)
    expect(result.error).toBe("No workflow in progress")
  })

  describe("supervisor_intervene 中途干预", () => {
    it("should transition to supervisor_intervene from worker_do", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "Fix all bugs" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")

      const result = coordinator.transition("supervisor_intervene")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_intervene")
    })

    it("should emit supervisor_intervene event", () => {
      const events: any[] = []
      const coordinator = new WorkflowCoordinator({
        onEvent: (event) => events.push(event),
      })

      coordinator.startWorkflow({ goal: "Fix all bugs" })
      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("supervisor_intervene")

      const interveneEvent = events.find((e) => e.type === "supervisor_intervene")
      expect(interveneEvent).toBeDefined()
      expect(interveneEvent.workflowId).toBeDefined()
    })

    it("should transition from supervisor_intervene back to worker_do", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "Fix all bugs" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("supervisor_intervene")

      const result = coordinator.transition("worker_do")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("worker_do")
    })

    it("should transition from supervisor_intervene to supervisor_check", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "Fix all bugs" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("supervisor_intervene")

      const result = coordinator.transition("supervisor_check")
      expect(result.success).toBe(true)
      expect(coordinator.getState()?.currentPhase).toBe("supervisor_check")
    })

    it("should track intervention count", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "Fix all bugs" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("supervisor_intervene")
      coordinator.transition("worker_do")
      coordinator.transition("supervisor_intervene")

      expect(coordinator.getState()?.interventionCount).toBe(2)
    })

    it("should not transition to supervisor_intervene from supervisor_check", () => {
      const coordinator = new WorkflowCoordinator()
      coordinator.startWorkflow({ goal: "Fix all bugs" })

      coordinator.transition("supervisor_analyse")
      coordinator.transition("worker_do")
      coordinator.transition("worker_report")
      coordinator.transition("supervisor_check")

      const result = coordinator.transition("supervisor_intervene")
      expect(result.success).toBe(false)
    })
  })
})
