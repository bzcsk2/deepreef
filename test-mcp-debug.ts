import { McpHost } from "./packages/mcp/src/host.js"
import { resolve } from "node:path"

const host = new McpHost({
  isEnabled: () => true,
  debug: (event: string, data?: Record<string, unknown>) => console.log("[DEBUG]", event, data),
  info: (event: string, data?: Record<string, unknown>) => console.log("[INFO]", event, data),
  warn: (event: string, data?: Record<string, unknown>) => console.log("[WARN]", event, data),
  error: (event: string, error?: unknown, data?: Record<string, unknown>) => console.log("[ERROR]", event, error, data),
})

const summary = await host.loadConfig(resolve(process.cwd(), ".deepreef/mcp.json"))
console.log("Summary:", JSON.stringify(summary, null, 2))
await host.disconnectAll()
