import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { existsSync, rmSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { randomUUID } from "node:crypto"
import { GoalStore } from "../src/goal/store.js"
import { createGetGoalTool, createUpdateGoalTool } from "../src/goal/tools.js"

const TEST_DIR = resolve(process.cwd(), ".deepreef-test-goal-tools")
const MOCK_CTX = { cwd: "/tmp", sessionId: "test" } as any

function makeStore(): GoalStore {
  return new GoalStore(TEST_DIR)
}

describe("Goal tools", () => {
  let store: GoalStore
  let threadId: string

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
    store = makeStore()
    threadId = randomUUID()
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  describe("get_goal", () => {
    it("returns error when threadId is missing", async () => {
      const tool = createGetGoalTool(store)
      const result = await tool.execute({}, MOCK_CTX)
      expect(result.isError).toBe(true)
      expect(result.content).toContain("threadId is required")
    })

    it("returns 'No goal' when no goal exists", async () => {
      const tool = createGetGoalTool(store)
      const result = await tool.execute({ threadId: "nonexistent" }, MOCK_CTX)
      expect(result.isError).toBe(false)
      expect(result.content).toBe("No goal set for this thread.")
    })

    it("returns goal when one exists", async () => {
      const created = store.createGoal(threadId, "Test goal")
      const tool = createGetGoalTool(store)
      const result = await tool.execute({ threadId }, MOCK_CTX)
      expect(result.isError).toBe(false)
      const parsed = JSON.parse(result.content)
      expect(parsed.objective).toBe("Test goal")
      expect(parsed.goalId).toBe(created.goalId)
      expect(parsed.status).toBe("active")
    })
  })

  describe("update_goal", () => {
    it("returns error when threadId is missing", async () => {
      const tool = createUpdateGoalTool(store)
      const result = await tool.execute({ status: "complete" }, MOCK_CTX)
      expect(result.isError).toBe(true)
      expect(result.content).toContain("threadId and status are required")
    })

    it("returns error for invalid status", async () => {
      const tool = createUpdateGoalTool(store)
      const result = await tool.execute({ threadId, status: "active" }, MOCK_CTX)
      expect(result.isError).toBe(true)
      expect(result.content).toContain('status must be "complete" or "blocked"')
    })

    it("marks goal as complete", async () => {
      store.createGoal(threadId, "Test")
      const tool = createUpdateGoalTool(store)
      const result = await tool.execute({ threadId, status: "complete" }, MOCK_CTX)
      expect(result.isError).toBe(false)
      const parsed = JSON.parse(result.content)
      expect(parsed.status).toBe("complete")
    })

    it("marks goal as blocked", async () => {
      store.createGoal(threadId, "Test")
      const tool = createUpdateGoalTool(store)
      const result = await tool.execute({ threadId, status: "blocked" }, MOCK_CTX)
      expect(result.isError).toBe(false)
      const parsed = JSON.parse(result.content)
      expect(parsed.status).toBe("blocked")
    })

    it("rejects expectedGoalId mismatch", async () => {
      store.createGoal(threadId, "Test")
      const tool = createUpdateGoalTool(store)
      const result = await tool.execute({ threadId, status: "complete", expectedGoalId: "wrong-id" }, MOCK_CTX)
      expect(result.isError).toBe(true)
      expect(result.content).toContain("expectedGoalId mismatch")
    })

    it("returns error when no goal exists", async () => {
      const tool = createUpdateGoalTool(store)
      const result = await tool.execute({ threadId: "nonexistent", status: "complete" }, MOCK_CTX)
      expect(result.isError).toBe(true)
      expect(result.content).toContain("No goal found")
    })
  })
})
