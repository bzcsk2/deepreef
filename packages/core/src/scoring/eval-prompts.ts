/**
 * Eval prompt builders for Worker and Supervisor evaluation.
 */

import type { AgentBenchmarkCase } from "./types.js"

export interface EvalPromptOptions {
  objective: string
  maxRounds?: number
  tokenBudget?: number
}

/**
 * Build a prompt for Worker evaluation that instructs the worker to complete a benchmark case
 * and return a structured JSON report.
 */
export function buildWorkerEvalPrompt(
  benchmarkCase: AgentBenchmarkCase,
  options: EvalPromptOptions = { objective: "" }
): string {
  const objective = options.objective || benchmarkCase.prompt
  const maxRounds = options.maxRounds ?? 10
  const tokenBudget = options.tokenBudget ?? 0

  const parts: string[] = [
    `You are being evaluated as a coding Worker.`,
    ``,
    `## Case`,
    `ID: ${benchmarkCase.id}`,
    `Title: ${benchmarkCase.title}`,
    `Type: ${benchmarkCase.taskType}`,
    `Difficulty: ${benchmarkCase.difficulty}`,
    ``,
    `## Task`,
    ``,
    objective,
    ``,
  ]

  if (benchmarkCase.repository) {
    parts.push(`### Repository`)
    parts.push(``)
    parts.push(benchmarkCase.repository)
    parts.push(``)
  }

  if (tokenBudget > 0) {
    parts.push(`### Constraints`)
    parts.push(``)
    parts.push(`Token budget: ${tokenBudget}`)
    parts.push(``)
  }

  if (benchmarkCase.verification && benchmarkCase.verification.length > 0) {
    parts.push(`### Verification Required`)
    for (const v of benchmarkCase.verification) {
      parts.push(`- ${v}`)
    }
    parts.push(``)
  }

  parts.push(`### Instructions`)
  parts.push(``)
  parts.push(`Complete the objective above. Use the available tools to read, write, and edit files.`)
  if (maxRounds > 0) {
    parts.push(`Maximum rounds: ${maxRounds}`)
  }
  parts.push(``)
  parts.push(`When done, return a structured JSON report in a code block:`)
  parts.push(`\`\`\`json`)
  parts.push(`{`)
  parts.push(`  "summary": "brief summary of what was accomplished",`)
  parts.push(`  "completedSteps": ["step1", "step2"],`)
  parts.push(`  "changedFiles": ["path/to/file1", "path/to/file2"],`)
  parts.push(`  "verification": {`)
  parts.push(`    "passed": true,`)
  parts.push(`    "commands": ["command1", "command2"],`)
  parts.push(`    "summary": "verification result summary"`)
  parts.push(`  },`)
  parts.push(`  "blockers": []`)
  parts.push(`}`)
  parts.push(`\`\`\``)

  return parts.join("\n")
}

/**
 * Build a prompt for Supervisor evaluation that instructs the supervisor to assess
 * a worker's completion and return a structured SupervisorRunAssessment.
 */
export function buildSupervisorEvalPrompt(
  benchmarkCase: AgentBenchmarkCase,
  workerReport: string,
  options: EvalPromptOptions = { objective: "" }
): string {
  const objective = options.objective || benchmarkCase.prompt

  const parts: string[] = [
    `## Supervisor Assessment`,
    ``,
    `You are evaluating a coding Worker. Do NOT execute tools or repeat the work.`,
    `Read the task, the Worker report, and provide a structured assessment.`,
    ``,
    `### Original Objective`,
    objective,
    ``,
  ]

  if (benchmarkCase.repository) {
    parts.push(`### Repository`)
    parts.push(``)
    parts.push(benchmarkCase.repository)
    parts.push(``)
  }

  parts.push(`### Worker Report`)
  parts.push(workerReport || "(no report provided)")
  parts.push(``)

  if (benchmarkCase.verification && benchmarkCase.verification.length > 0) {
    parts.push(`### Verification Criteria`)
    for (const criterion of benchmarkCase.verification) {
      parts.push(`- ${criterion}`)
    }
    parts.push(``)
  }

  parts.push(`### Assessment Instructions`)
  parts.push(``)
  parts.push(`Evaluate whether the Worker successfully completed the objective.`)
  parts.push(`Consider:`)
  parts.push(`- Did the Worker complete all required steps?`)
  parts.push(`- Were all verification criteria met? Are the verification results credible?`)
  parts.push(`- Does the implementation match the objective requirements?`)
  parts.push(`- Are there any critical issues, gaps, or blockers?`)
  parts.push(``)
  parts.push(`Return a structured JSON assessment in a code block:`)
  parts.push(`\`\`\`json`)
  parts.push(`{`)
  parts.push(`  "summary": "overall assessment of the Worker's performance",`)
  parts.push(`  "completed": true,`)
  parts.push(`  "verificationPassed": true,`)
  parts.push(`  "dimensions": {`)
  parts.push(`    "taskCompletion": 80,`)
  parts.push(`    "verification": 75,`)
  parts.push(`    "toolUse": 70,`)
  parts.push(`    "efficiency": 70,`)
  parts.push(`    "autonomy": 80,`)
  parts.push(`    "instructionFollowing": 80,`)
  parts.push(`    "recovery": 70,`)
  parts.push(`    "communication": 75,`)
  parts.push(`    "safety": 90`)
  parts.push(`  },`)
  parts.push(`  "promptStrategies": []`)
  parts.push(`}`)
  parts.push(`\`\`\``)
  parts.push(``)
  parts.push(`Each dimension is scored 0-100. Higher is better.`)

  return parts.join("\n")
}
