// Deepicode TUI — oh-my-pi TUI with ReasonixEngine
import { TUI, Container, Text, Spacer, Input, ProcessTerminal, Loader } from "../../../../oh-my-pi/packages/tui/src/index.ts"
import { loadConfig } from "../../core/src/config.js"
import { ReasonixEngine } from "../../core/src/engine.js"

const SYSTEM_PROMPT = `你是一个高效的编码助手。你简洁、精确，只输出必要的内容。`

async function main() {
  const config = loadConfig()
  const engine = new ReasonixEngine(config)
  engine.setSystemPrompt(SYSTEM_PROMPT)

  const ui = new TUI(new ProcessTerminal())
  const chatContainer = new Container()
  const inputField = new Input("", 1, 0)
  const loader = new Loader(ui, (s) => s, (s) => s, "thinking")
  const statusText = new Text("", 1, 0)

  ui.addChild(chatContainer)
  ui.addChild(statusText)
  ui.addChild(loader)
  ui.addChild(inputField)

  inputField.onEscape = () => { ui.stop(); process.exit(0) }
  inputField.onSubmit = async (value: string) => {
    if (!value.trim()) return
    inputField.setValue("")
    chatContainer.addChild(new Text(`>>> ${value}`, 1, 0))

    loader.start()
    statusText.setText("")

    const assistantComp = new Text("", 1, 0)
    chatContainer.addChild(assistantComp)
    ui.requestRender()

    for await (const event of engine.submit(value)) {
      switch (event.role) {
        case "assistant_delta":
          assistantComp.setText(assistantComp.getText() + (event.content ?? ""))
          ui.requestRender()
          break
        case "tool_start":
          statusText.setText(`[tool] ${event.toolName} ...`)
          ui.requestRender()
          break
        case "tool":
          statusText.setText(`[tool] ${event.toolName} done`)
          ui.requestRender()
          break
        case "done": {
          const s = engine.getState().stats
          statusText.setText(`in ${s.promptTokens} / out ${s.completionTokens}${s.cacheHitTokens ? ` cache+${s.cacheHitTokens}` : ""}`)
          break
        }
        case "error":
          statusText.setText(`error: ${event.content}`)
          ui.requestRender()
          break
      }
    }

    loader.stop()
    chatContainer.addChild(new Spacer(1))
    ui.requestRender()
  }

  ui.setFocus(inputField)
  ui.start()
  ui.requestRender(true)

  process.on("SIGINT", () => { ui.stop(); process.exit(0) })
  process.on("SIGTERM", () => { ui.stop(); process.exit(0) })
}

main().catch((e) => { console.error(e); process.exit(1) })
