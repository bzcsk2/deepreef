import type { ThreadGoal } from "./types.js"

export function buildContinuationPrompt(goal: ThreadGoal, iteration: number): string {
  return `Continue working toward the current goal.

## Current Goal
- Objective: ${goal.objective}
- Status: ${goal.status}
- Tokens Used: ${goal.tokensUsed}${goal.tokenBudget ? ` / Budget: ${goal.tokenBudget}` : ""}
- Time Used: ${goal.timeUsedSeconds}s
- Current Iteration: ${iteration}

## Rules
1. The goal persists across turns. Do not narrow or change the objective.
2. Base your work on current evidence and worktree state.
3. Before marking the goal as complete, perform a requirement-by-requirement audit.
4. If you encounter the same blocker for 3 consecutive turns and cannot make progress, mark the goal as blocked.
5. Do not start new unrelated work. Stay focused on the goal.`
}

export function buildBudgetLimitPrompt(goal: ThreadGoal): string {
  return `## Budget Limit Reached

The current goal has reached its token budget (${goal.tokenBudget} tokens, used ${goal.tokensUsed}).

You must wrap up immediately:
- Finish any in-progress work.
- Do NOT start new substantial work.
- Summarize what was accomplished.
- Mark the goal as complete if achievable, or blocked if not.`
}

export function buildUsageLimitPrompt(): string {
  return `## Usage Limit Reached

Maximum auto-continuations reached. The workflow will stop after this turn.
- Wrap up current work.
- Summarize what was accomplished and what remains.`
}
