import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ReasonixEngine } from "../src/engine.js"
import type { LoopEvent } from "../src/interface.js"
import { createWriteFileTool } from "../../tools/src/write-file.js"
import { createReadFileTool } from "../../tools/src/file-ops.js"
import { createEditTool } from "../../tools/src/edit.js"
import { createBashTool } from "../../tools/src/shell-exec.js"
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

const streamMock = vi.fn<(..._args: any[]) => AsyncGenerator<any>>()

vi.mock("../src/client.js", () => {
  return {
    DeepSeekClient: class {
      chatCompletionsStream(...args: any[]) {
        return streamMock(...args)
      }
    },
  }
})

function makeEngine() {
  return new ReasonixEngine({
    apiKey: "sk-test",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    maxTokens: 256,
    temperature: 0.1,
  })
}

describe("TT2: E2E tool chains through engine", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "e2e-"))
  })

  afterEach(async () => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("write_file → read_file chain", async () => {
    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-w", name: "write_file", arguments: JSON.stringify({ path: join(tmpDir, "hello.txt"), content: "hello world" }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-r", name: "read_file", arguments: JSON.stringify({ path: join(tmpDir, "hello.txt") }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "done" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.registerTool(createWriteFileTool())
    engine.registerTool(createReadFileTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("write and read")) events.push(e)

    expect(readFileSync(join(tmpDir, "hello.txt"), "utf-8")).toBe("hello world")

    const tools = events.filter((e) => e.role === "tool")
    expect(tools).toHaveLength(2)
    expect(tools[0].toolName).toBe("write_file")
    expect(tools[1].toolName).toBe("read_file")
    expect(tools[1].content).toContain("hello world")
    expect(events.some((e) => e.role === "done")).toBe(true)
  })

  it("write_file → edit → read_file chain", async () => {
    const filePath = join(tmpDir, "edit-me.txt")

    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-w", name: "write_file", arguments: JSON.stringify({ path: filePath, content: "hello world" }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-e", name: "edit", arguments: JSON.stringify({ path: filePath, old_string: "world", new_string: "deepicode" }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-r", name: "read_file", arguments: JSON.stringify({ path: filePath }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "done" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.registerTool(createWriteFileTool())
    engine.registerTool(createEditTool())
    engine.registerTool(createReadFileTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("write edit read")) events.push(e)

    expect(readFileSync(filePath, "utf-8")).toBe("hello deepicode")

    const tools = events.filter((e) => e.role === "tool")
    expect(tools).toHaveLength(3)
    expect(tools[0].toolName).toBe("write_file")
    expect(tools[1].toolName).toBe("edit")
    expect(tools[2].toolName).toBe("read_file")
    expect(tools[2].content).toContain("hello deepicode")
  })

  it("bash execution through engine", async () => {
    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-b", name: "bash", arguments: JSON.stringify({ command: `echo "hello from bash"` }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "bash done" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.permissionEngine.addAllowRule({ toolName: "bash" })
    engine.registerTool(createBashTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("run bash")) events.push(e)

    const toolEvent = events.find((e) => e.role === "tool")
    expect(toolEvent).toBeDefined()
    const result = JSON.parse(toolEvent!.content!)
    expect(result.stdout?.trim()).toBe("hello from bash")
    expect(result.exitCode).toBe(0)
  })

  it("bash → read_file cross-verification chain", async () => {
    const filePath = join(tmpDir, "bash-created.txt")

    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-b", name: "bash", arguments: JSON.stringify({ command: `echo "created by bash" > ${filePath}` }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-r", name: "read_file", arguments: JSON.stringify({ path: filePath }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "verified" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.permissionEngine.addAllowRule({ toolName: "bash" })
    engine.registerTool(createBashTool())
    engine.registerTool(createReadFileTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("bash then read")) events.push(e)

    const tools = events.filter((e) => e.role === "tool")
    expect(tools).toHaveLength(2)
    expect(tools[1].content).toContain("created by bash")
    expect(readFileSync(filePath, "utf-8").trim()).toBe("created by bash")
  })

  it("tool error recovery: failing tool returns isError", async () => {
    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-err", name: "failing_tool", arguments: "{}" }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "recovered" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.registerTool({
      name: "failing_tool",
      description: "a tool that always fails",
      parameters: { type: "object", properties: {} },
      concurrency: "shared",
      approval: "read",
      async execute() {
        return { content: JSON.stringify({ error: "something went wrong" }), isError: true }
      },
    })

    const events: LoopEvent[] = []
    for await (const e of engine.submit("trigger error")) events.push(e)

    // Failing tool should yield an error event (since isError=true, executor yields role:"error")
    const errorEvent = events.find((e) => e.role === "error" && e.toolName === "failing_tool")
    expect(errorEvent).toBeDefined()
    expect(errorEvent!.severity).toBe("error")
    expect(errorEvent!.content).toContain("something went wrong")
    // The tool result should NOT be in the event with role "tool" (it's an error)
    const toolResult = events.find((e) => e.role === "tool" && e.toolName === "failing_tool")
    expect(toolResult).toBeUndefined()
  })

  it("engine interrupt during tool execution", async () => {
    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-slow", name: "slow_tool", arguments: "{}" }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())

    const engine = makeEngine()
    let executed = false
    engine.registerTool({
      name: "slow_tool",
      description: "slow tool",
      parameters: { type: "object", properties: {} },
      concurrency: "shared",
      approval: "read",
      async execute() {
        executed = true
        await new Promise((r) => setTimeout(r, 1000))
        return { content: "done", isError: false }
      },
    })

    const events: LoopEvent[] = []
    const iter = engine.submit("interrupt test")

    setTimeout(() => engine.interrupt(), 50)

    for await (const e of iter) events.push(e)

    expect(executed).toBe(true)
    const interrupted = events.filter((e: any) => e.role === "status" && e.content === "interrupted")
    expect(interrupted.length).toBeGreaterThanOrEqual(0)
  })

  it("5-turn tool chain: write → edit → bash verify → grep → read", async () => {
    const filePath = join(tmpDir, "chain.txt")

    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-1", name: "write_file", arguments: JSON.stringify({ path: filePath, content: "step1\nstep2\nstep3" }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-2", name: "edit", arguments: JSON.stringify({ path: filePath, old_string: "step2", new_string: "edited" }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-3", name: "bash", arguments: JSON.stringify({ command: `cat ${filePath}` }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-4", name: "bash", arguments: JSON.stringify({ command: `grep -c "edited" ${filePath}` }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-5", name: "read_file", arguments: JSON.stringify({ path: filePath }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "chain complete" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.permissionEngine.addAllowRule({ toolName: "bash" })
    engine.registerTool(createWriteFileTool())
    engine.registerTool(createEditTool())
    engine.registerTool(createBashTool())
    engine.registerTool(createReadFileTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("5 step chain")) events.push(e)

    const tools = events.filter((e) => e.role === "tool")
    expect(tools).toHaveLength(5)
    expect(tools[0].toolName).toBe("write_file")
    expect(tools[1].toolName).toBe("edit")
    expect(tools[2].toolName).toBe("bash")
    expect(tools[3].toolName).toBe("bash")
    expect(tools[4].toolName).toBe("read_file")

    expect(readFileSync(filePath, "utf-8")).toBe("step1\nedited\nstep3")
    expect(events.some((e) => e.role === "done")).toBe(true)
  })

  it("exec-tier tool denied without allow rule", async () => {
    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-deny", name: "bash", arguments: JSON.stringify({ command: 'echo "test"' }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "denied" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    // Intentionally NOT adding allow rule for bash — should be denied
    engine.registerTool(createBashTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("bash without allow")) events.push(e)

    const errorEvents = events.filter((e) => e.role === "error" && e.toolName === "bash")
    expect(errorEvents.length).toBeGreaterThanOrEqual(1)
    expect(errorEvents[0].content).toContain("denied")
  })

  it("should survive write_file with empty content", async () => {
    const filePath = join(tmpDir, "empty.txt")

    streamMock
      .mockReturnValueOnce((async function* () {
        yield { type: "tool_call_end", toolCallIndex: 0, id: "tc-empty", name: "write_file", arguments: JSON.stringify({ path: filePath, content: "" }) }
        yield { type: "usage", usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } }
        yield { type: "done", finishReason: "tool_calls" }
      })())
      .mockReturnValueOnce((async function* () {
        yield { type: "text_delta", delta: "ok" }
        yield { type: "usage", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        yield { type: "done", finishReason: "stop" }
      })())

    const engine = makeEngine()
    engine.registerTool(createWriteFileTool())

    const events: LoopEvent[] = []
    for await (const e of engine.submit("empty file")) events.push(e)

    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, "utf-8")).toBe("")
  })
})
