import { describe, it, expect } from "vitest"
import {
  parseSupervisorDecision,
  parseSupervisorPlan,
  parseWorkerReport,
} from "../src/workflow-coordinator/structured-protocol.js"

describe("Structured protocol", () => {
  describe("parseSupervisorDecision", () => {
    it("parses fenced JSON block", () => {
      const text = `Some prose before.

\`\`\`json
{
  "version": 1,
  "workflowId": "wf-1",
  "iteration": 1,
  "basedOnLedgerVersion": 0,
  "decision": "approve",
  "diagnosis": "All requirements met",
  "nextActions": [],
  "constraints": [],
  "verification": []
}
\`\`\`

Some prose after.`
      const result = parseSupervisorDecision(text)
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe("high")
      expect(result!.decision.decision).toBe("approve")
      expect(result!.decision.diagnosis).toBe("All requirements met")
    })

    it("parses first JSON object when no fence", () => {
      const text = `Based on my review, I recommend:
{"version": 1, "workflowId": "wf-1", "iteration": 1, "basedOnLedgerVersion": 0, "decision": "continue", "diagnosis": "Partial progress", "nextActions": ["fix test"], "constraints": [], "verification": []}`
      const result = parseSupervisorDecision(text)
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe("high")
      expect(result!.decision.decision).toBe("continue")
    })

    it("returns null for invalid JSON", () => {
      const result = parseSupervisorDecision("I approve this work. All tasks completed.")
      expect(result).toBeNull()
    })

    it("returns null for JSON that fails zod validation", () => {
      const text = `{"version": 1, "workflowId": "wf-1", "iteration": "not-a-number", "basedOnLedgerVersion": 0, "decision": "approve", "diagnosis": "", "nextActions": [], "constraints": [], "verification": []}`
      const result = parseSupervisorDecision(text)
      expect(result).toBeNull()
    })

    it("parses fenced block without json tag", () => {
      const text = "```\n{\"version\": 1, \"workflowId\": \"wf-1\", \"iteration\": 1, \"basedOnLedgerVersion\": 0, \"decision\": \"blocked\", \"diagnosis\": \"Blocked on dependency\", \"nextActions\": [], \"constraints\": [], \"verification\": []}\n```"
      const result = parseSupervisorDecision(text)
      expect(result).not.toBeNull()
      expect(result!.decision.decision).toBe("blocked")
    })

    it("parses all decision types", () => {
      const base = {
        version: 1,
        workflowId: "wf-1",
        iteration: 1,
        basedOnLedgerVersion: 0,
        diagnosis: "test",
        nextActions: [],
        constraints: [],
        verification: [],
      }

      for (const decision of ["continue", "revise", "approve", "blocked", "ask_user"] as const) {
        const json = JSON.stringify({ ...base, decision })
        const result = parseSupervisorDecision(`\`\`\`json\n${json}\n\`\`\``)
        expect(result).not.toBeNull()
        expect(result!.decision.decision).toBe(decision)
      }
    })
  })

  describe("parseSupervisorPlan", () => {
    it("parses valid supervisor plan", () => {
      const text = `\`\`\`json
{
  "version": 1,
  "workflowId": "wf-1",
  "iteration": 1,
  "goal": "Fix all bugs",
  "summary": "Analyze and fix bugs",
  "steps": [
    { "id": "s1", "description": "Analyze codebase" }
  ],
  "constraints": [],
  "risks": []
}
\`\`\``
      const result = parseSupervisorPlan(text)
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe("high")
      expect(result!.plan.goal).toBe("Fix all bugs")
      expect(result!.plan.steps).toHaveLength(1)
      expect(result!.plan.steps[0].id).toBe("s1")
    })

    it("returns null for invalid plan", () => {
      const result = parseSupervisorPlan("I plan to fix all bugs.")
      expect(result).toBeNull()
    })
  })

  describe("parseWorkerReport", () => {
    it("parses valid worker report", () => {
      const text = `\`\`\`json
{
  "version": 1,
  "workflowId": "wf-1",
  "iteration": 1,
  "basedOnLedgerVersion": 0,
  "summary": "Fixed all bugs",
  "completedSteps": ["s1"],
  "changedFiles": ["src/main.ts"],
  "verification": { "passed": true, "commands": ["npm test"], "summary": "All pass" },
  "blockers": [],
  "requestsSupervisor": false
}
\`\`\``
      const result = parseWorkerReport(text)
      expect(result).not.toBeNull()
      expect(result!.confidence).toBe("high")
      expect(result!.report.summary).toBe("Fixed all bugs")
      expect(result!.report.verification.passed).toBe(true)
    })

    it("returns null for invalid report", () => {
      const result = parseWorkerReport("Done.")
      expect(result).toBeNull()
    })
  })
})
