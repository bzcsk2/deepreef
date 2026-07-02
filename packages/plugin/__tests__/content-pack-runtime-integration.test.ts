import { describe, test, expect } from "bun:test"
import { PluginRuntime } from "../src/runtime.js"

describe("Content Pack Runtime Integration", () => {
  test("PluginRuntime creates with no options", () => {
    const runtime = new PluginRuntime()
    expect(runtime).toBeDefined()
  })

  test("getStatus returns initialized=false before init", () => {
    const runtime = new PluginRuntime()
    const status = runtime.getStatus()
    expect(status.initialized).toBe(false)
    expect(status.contentPacks).toEqual([])
  })

  test("getContentPacks returns empty before init", () => {
    const runtime = new PluginRuntime()
    expect(runtime.getContentPacks()).toEqual([])
  })

  test("getSkillDirs returns empty before init", () => {
    const runtime = new PluginRuntime()
    expect(runtime.getSkillDirs()).toEqual([])
  })

  test("loadAgents returns empty before init", () => {
    const runtime = new PluginRuntime()
    expect(runtime.loadAgents()).toEqual([])
  })

  test("compileRules returns empty before init", () => {
    const runtime = new PluginRuntime()
    const result = runtime.compileRules()
    expect(result.systemPrompt).toBe("")
    expect(result.count).toBe(0)
  })

  test("loadCommandSkills returns empty before init", () => {
    const runtime = new PluginRuntime()
    expect(runtime.loadCommandSkills()).toEqual([])
  })

  test("dispose cleans up correctly", async () => {
    const runtime = new PluginRuntime()
    await runtime.dispose()
    const status = runtime.getStatus()
    expect(status.initialized).toBe(false)
    expect(status.loadedPlugins).toEqual([])
  })
})
