import type { WorkflowEvent } from "../workflow-coordinator/types.js"
import type { WorkflowCoordinator } from "../workflow-coordinator/coordinator.js"
import { GoalStore } from "./store.js"
import { buildContinuationPrompt, buildBudgetLimitPrompt, buildUsageLimitPrompt } from "./steering.js"

export interface GoalRuntimeConfig {
  maxAutoContinuations: number
  maxConsecutiveTurnErrors: number
}

export const DEFAULT_GOAL_RUNTIME_CONFIG: GoalRuntimeConfig = {
  maxAutoContinuations: 10,
  maxConsecutiveTurnErrors: 3,
}

export class GoalRuntime {
  private goalStore: GoalStore
  private coordinator: WorkflowCoordinator
  private config: GoalRuntimeConfig
  private autoContinuationCount = 0
  private consecutiveTurnErrors = 0

  constructor(
    goalStore: GoalStore,
    coordinator: WorkflowCoordinator,
    config?: Partial<GoalRuntimeConfig>,
  ) {
    this.goalStore = goalStore
    this.coordinator = coordinator
    this.config = { ...DEFAULT_GOAL_RUNTIME_CONFIG, ...config }
  }

  onEngineIdle(threadId: string): boolean {
    const goal = this.goalStore.getGoal(threadId)
    if (!goal) return false

    // Only auto-continue active goals
    if (goal.status !== "active") return false

    // Check max auto-continuations
    if (this.autoContinuationCount >= this.config.maxAutoContinuations) {
      this.goalStore.systemSetStatus(threadId, "usage_limited")
      return false
    }

    // Check token budget
    if (goal.tokenBudget !== undefined && goal.tokensUsed >= goal.tokenBudget) {
      this.goalStore.systemSetStatus(threadId, "budget_limited")
      return false
    }

    return true
  }

  async *continueGoal(threadId: string): AsyncGenerator<WorkflowEvent> {
    const goal = this.goalStore.getGoal(threadId)
    if (!goal) return

    if (goal.status !== "active") return

    if (this.autoContinuationCount >= this.config.maxAutoContinuations) {
      this.goalStore.systemSetStatus(threadId, "usage_limited")
      return
    }

    // Check budget before continuing
    if (goal.tokenBudget !== undefined && goal.tokensUsed >= goal.tokenBudget) {
      this.goalStore.systemSetStatus(threadId, "budget_limited")
      // One final turn with budget limit prompt
      const state = this.coordinator.getState()
      if (state && state.currentPhase !== "completed" && state.currentPhase !== "failed") {
        yield* this.coordinator["runWorkflow"]()
      }
      return
    }

    this.autoContinuationCount++
    this.consecutiveTurnErrors = 0

    // Check if coordinator can continue
    if (!this.coordinator.canContinue()) {
      return
    }

    const state = this.coordinator.getState()
    if (!state) return

    const currentPhase = state.currentPhase
    if (currentPhase === "completed" || currentPhase === "failed") {
      return
    }

    // If the coordinator is at a stopping point, restart it
    if (currentPhase === "blocked" || currentPhase === "idle") {
      this.coordinator.startWorkflow({
        goal: goal.objective,
        workflowId: threadId,
        config: { maxRounds: state.maxRounds },
      })
    }

    // If the coordinator isn't running, start from supervisor_analyse
    if (this.coordinator.getCurrentPhase() === "idle") {
      this.coordinator.transition("supervisor_analyse")
    }

    yield* this.coordinator["runWorkflow"]()
  }

  onTurnError(): void {
    this.consecutiveTurnErrors++
    if (this.consecutiveTurnErrors >= this.config.maxConsecutiveTurnErrors) {
      this.autoContinuationCount = this.config.maxAutoContinuations // effectively stop
    }
  }

  reset(): void {
    this.autoContinuationCount = 0
    this.consecutiveTurnErrors = 0
  }

  getStatus(): {
    autoContinuationCount: number
    maxAutoContinuations: number
    consecutiveTurnErrors: number
  } {
    return {
      autoContinuationCount: this.autoContinuationCount,
      maxAutoContinuations: this.config.maxAutoContinuations,
      consecutiveTurnErrors: this.consecutiveTurnErrors,
    }
  }
}
