// ReasonixEngine — implements CoreEngine interface
// Wraps our three-region context partitioning + oh-my-pi streamSimple

import { streamSimple } from "./vendor/pi.js"
import type { Model, SimpleStreamOptions } from "./vendor/pi.js"
import type { DeepicodeConfig } from "./config.js"
import { buildPiModel } from "./config.js"
import { ContextManager } from "./context/manager.js"
import type { AgentEvent, ChatMessage, ToolCall, ToolSpec } from "./types.js"
import type { CoreEngine, AgentConfig, AgentTool, LoopEvent, AgentState, ToolContext, SessionStats } from "./interface.js"

let sessionCounter = 0

export class ReasonixEngine implements CoreEngine {
  private config: DeepicodeConfig
  private model: Model
  private ctx: ContextManager
  private tools: Map<string, AgentTool> = new Map()
  private _interrupted = false
  private sessionId: string
  private stats: SessionStats = {
    promptTokens: 0, completionTokens: 0,
    cacheHitTokens: 0, cacheMissTokens: 0,
    apiCalls: 0, toolCalls: 0, totalCost: 0,
  }

  constructor(config: DeepicodeConfig) {
    this.config = config
    this.model = buildPiModel(config)
    this.ctx = new ContextManager()
    this.sessionId = `session-${++sessionCounter}-${Date.now()}`
  }

  setSystemPrompt(prompt: string): void {
    this.ctx.prefix.build(prompt)
  }

  getContextManager(): ContextManager {
    return this.ctx
  }

  registerTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  interrupt(): void {
    this._interrupted = true
  }

  switchAgent(_agentName: string): void {}
  resolveTierDecision(_tier: string): void {}

  getState(): AgentState {
    return {
      sessionId: this.sessionId,
      messages: [...this.ctx.buildMessages()],
      isStreaming: false,
      streamingMessage: "",
      pendingToolCalls: [],
      currentAgent: "build",
      stats: { ...this.stats },
    }
  }

  async *submit(userInput: string, _agentConfig?: AgentConfig): AsyncGenerator<LoopEvent> {
    this._interrupted = false
    this.ctx.startTurn()
    this.ctx.log.append({ role: "user", content: userInput })

    const toolSpecs: ToolSpec[] = []
    for (const tool of this.tools.values()) {
      toolSpecs.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })
    }

    let turnCount = 0
    const maxTurns = 10

    while (turnCount < maxTurns) {
      turnCount++
      if (this._interrupted) {
        yield { role: "status", content: "interrupted" }
        return
      }

      const { systemPrompt, messages, ompTools } = buildOmpContext(this.ctx, toolSpecs)

      const options: SimpleStreamOptions = {
        apiKey: this.config.apiKey,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }

      const stream = streamSimple(
        this.model,
        { systemPrompt, messages, tools: ompTools },
        options,
      )

      let fullContent = ""
      let fullReasoning = ""
      const toolCalls: ToolCall[] = []

      for await (const event of stream) {
        if (this._interrupted) {
          yield { role: "status", content: "interrupted" }
          return
        }

        if (event.type === "text_delta") {
          fullContent += event.delta
          yield { role: "assistant_delta", content: event.delta }
        } else if (event.type === "thinking_delta") {
          fullReasoning += event.delta
          yield { role: "reasoning_delta", content: event.delta }
        } else if (event.type === "toolcall_end") {
          const tc: ToolCall = {
            id: event.toolCall.id,
            type: "function",
            function: {
              name: event.toolCall.name,
              arguments: JSON.stringify(event.toolCall.arguments),
            },
          }
          toolCalls.push(tc)
          yield {
            role: "tool_call_delta",
            toolName: event.toolCall.name,
            content: JSON.stringify(event.toolCall.arguments),
          }
        } else if (event.type === "done") {
          if (event.message.usage) {
            const u = event.message.usage
            this.stats.promptTokens += u.input
            this.stats.completionTokens += u.output
            this.stats.cacheHitTokens += u.cacheRead
            this.stats.cacheMissTokens += u.cacheWrite
            this.stats.apiCalls++
          }

          if (event.reason === "toolUse") {
            this.ctx.log.append({
              role: "assistant",
              content: fullContent || fullReasoning || null,
              tool_calls: toolCalls,
            })

            for (const tc of toolCalls) {
              this.stats.toolCalls++
              yield { role: "tool_start", toolName: tc.function.name, toolCallIndex: 0 }

              try {
                const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
                const handler = this.tools.get(tc.function.name)
                const toolCtx: ToolContext = { cwd: process.cwd(), sessionId: this.sessionId }
                if (handler) {
                  const result = await handler.execute(args, toolCtx)
                  this.ctx.log.append({
                    role: "tool", tool_call_id: tc.id,
                    content: result, name: tc.function.name,
                  })
                  yield { role: "tool", toolName: tc.function.name, content: result }
                } else {
                  const err = JSON.stringify({ error: `Unknown tool: ${tc.function.name}` })
                  this.ctx.log.append({ role: "tool", tool_call_id: tc.id, content: err, name: tc.function.name })
                  yield { role: "error", content: err, severity: "error" }
                }
              } catch (e) {
                const err = JSON.stringify({ error: String(e) })
                this.ctx.log.append({ role: "tool", tool_call_id: tc.id, content: err, name: tc.function.name })
                yield { role: "error", content: err, severity: "error" }
              }
            }
          } else {
            this.ctx.log.append({ role: "assistant", content: fullContent })
          }

          yield { role: "done", metadata: { reason: event.reason } as Record<string, unknown> }
          if (event.reason !== "toolUse") return
          break
        } else if (event.type === "error") {
          yield { role: "error", content: event.error.errorMessage || "Unknown error", severity: "error" }
          return
        }
      }
    }
  }
}

function buildOmpContext(
  ctx: ContextManager,
  toolSpecs: ToolSpec[],
): { systemPrompt: string[] | undefined; messages: unknown[]; ompTools: unknown[] | undefined } {
  const raw = ctx.buildMessages()
  const systemPrompt: string[] = []
  const messages: unknown[] = []
  const now = Date.now()

  for (const m of raw) {
    switch (m.role) {
      case "system":
        if (m.content) systemPrompt.push(m.content)
        break
      case "user":
        messages.push({ role: "user", content: m.content ?? "", timestamp: now })
        break
      case "assistant": {
        const content: unknown[] = []
        if (m.content) content.push({ type: "text", text: m.content })
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            content.push({
              type: "toolCall",
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments),
            })
          }
        }
        messages.push({
          role: "assistant",
          content,
          api: "opencode",
          provider: "opencode",
          model: "",
          usage: { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop",
          timestamp: now,
        })
        break
      }
      case "tool":
        messages.push({
          role: "toolResult",
          toolCallId: m.tool_call_id ?? "",
          toolName: m.name ?? "",
          content: [{ type: "text", text: m.content ?? "" }],
          isError: false,
          timestamp: now,
        })
        break
    }
  }

  const ompTools = toolSpecs.length > 0
    ? toolSpecs.map((s) => ({
        name: s.function.name,
        description: s.function.description,
        parameters: s.function.parameters,
      }))
    : undefined

  return {
    systemPrompt: systemPrompt.length > 0 ? systemPrompt : undefined,
    messages,
    ompTools,
  }
}
