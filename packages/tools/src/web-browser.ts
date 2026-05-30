import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileSync, unlinkSync } from "node:fs"
import type { AgentTool } from "../../core/src/interface.js"
import { safeStringify } from "./safe-stringify.js"

export function createWebBrowserTool(): AgentTool {
  return {
    name: "WebBrowser",
    description: "Launch a headless browser to interact with web pages. Can navigate, click, fill forms, take screenshots, and extract content.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["navigate", "click", "fill", "screenshot", "extract"],
          description: "The action to perform.",
        },
        url: { type: "string", description: "The URL to navigate to (required for navigate/screenshot)." },
        selector: { type: "string", description: "CSS selector for click/fill/extract." },
        value: { type: "string", description: "Value to fill (required for fill action)." },
        timeout_ms: { type: "number", description: "Timeout in milliseconds (default 15000)." },
      },
      required: ["action"],
    },
    concurrency: "exclusive",
    approval: "read",
    async execute(args, ctx) {
      const action = args.action as string | undefined
      if (!action || !["navigate", "click", "fill", "screenshot", "extract"].includes(action)) {
        return { content: safeStringify({ error: "action must be one of: navigate, click, fill, screenshot, extract" }), isError: true }
      }

      const timeoutMs = typeof args.timeout_ms === "number" ? Math.max(0, Math.floor(args.timeout_ms)) : 15000

      if (action === "navigate") {
        const url = args.url as string | undefined
        if (!url) return { content: safeStringify({ error: "url is required for navigate action" }), isError: true }

        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), timeoutMs)
          const signal = ctx.signal ? anySignal(ctx.signal, controller.signal) : controller.signal
          const resp = await fetch(url, { signal })
          clearTimeout(timer)

          if (!resp.ok) {
            return { content: safeStringify({ error: `HTTP ${resp.status}: ${resp.statusText}`, code: resp.status }), isError: true }
          }

          const text = await resp.text()
          const contentType = resp.headers.get("content-type") ?? ""
          const isHtml = contentType.includes("text/html")
          const content = isHtml ? htmlToText(text) : text

          return { content: safeStringify({ content, code: resp.status, url }), isError: false }
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") {
            return { content: safeStringify({ error: "Navigation timed out" }), isError: true }
          }
          return { content: safeStringify({ error: `Navigation failed: ${e instanceof Error ? e.message : String(e)}` }), isError: true }
        }
      }

      if (action === "screenshot") {
        const url = args.url as string | undefined
        if (!url) return { content: safeStringify({ error: "url is required for screenshot action" }), isError: true }

        const tmpFile = join(tmpdir(), `deepicode-shot-${Date.now()}.png`)
        const result = spawnSync("npx", ["playwright", "screenshot", url, "--output", tmpFile], { timeout: timeoutMs })

        if (result.error || result.status !== 0) {
          return {
            content: safeStringify({
              error: "Screenshot not available: Playwright is not installed or failed to capture screenshot. Try using the navigate action or WebFetch tool instead.",
            }),
            isError: true,
          }
        }

        try {
          const img = readFileSync(tmpFile)
          const b64 = img.toString("base64")
          return { content: safeStringify({ screenshot: `data:image/png;base64,${b64}`, url }), isError: false }
        } finally {
          try { unlinkSync(tmpFile) } catch { /* ignore */ }
        }
      }

      return {
        content: safeStringify({
          error: `${action} requires Playwright which is not installed. Use navigate to retrieve page content or a different approach.`,
        }),
        isError: true,
      }
    },
  }
}

function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); return controller.signal }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true })
  }
  return controller.signal
}

function htmlToText(html: string): string {
  let text = html
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(/<\/p>/gi, "\n\n")
  text = text.replace(/<\/div>/gi, "\n")
  text = text.replace(/<\/h[1-6]>/gi, "\n")
  text = text.replace(/<\/li>/gi, "\n")
  text = text.replace(/<[^>]+>/g, "")
  text = text.replace(/&amp;/g, "&")
  text = text.replace(/&lt;/g, "<")
  text = text.replace(/&gt;/g, ">")
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, " ")
  text = text.replace(/\n{3,}/g, "\n\n")
  text = text.trim()
  return text
}
