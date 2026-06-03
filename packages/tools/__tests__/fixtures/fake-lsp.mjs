let buffer = Buffer.alloc(0)
let initialized = false

process.stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk])
  while (true) {
    const boundary = buffer.indexOf("\r\n\r\n")
    if (boundary < 0) return
    const header = buffer.subarray(0, boundary).toString("ascii")
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) process.exit(1)
    const length = Number(match[1])
    const end = boundary + 4 + length
    if (buffer.length < end) return
    const message = JSON.parse(buffer.subarray(boundary + 4, end).toString("utf8"))
    buffer = buffer.subarray(end)
    handleMessage(message)
  }
})

function handleMessage(message) {
  if (message.id == null) {
    // Notification
    if (message.method === "initialized") {
      initialized = true
    }
    return
  }

  let result = {}

  switch (message.method) {
    case "initialize":
      result = {
        capabilities: {
          textDocumentSync: 1,
          hoverProvider: true,
          definitionProvider: true,
          referencesProvider: true,
          completionProvider: { triggerCharacters: ["."] },
          diagnosticProvider: { identifier: "fake" },
        },
      }
      break
    case "shutdown":
      result = null
      break
    case "textDocument/hover":
      result = { contents: "fake hover" }
      break
    case "textDocument/definition":
      result = { uri: "file:///fake/definition.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
      break
    case "textDocument/references":
      result = [
        { uri: "file:///fake/ref1.ts", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } },
        { uri: "file:///fake/ref2.ts", range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } } },
      ]
      break
    case "textDocument/documentSymbol":
      result = [
        { name: "MyClass", kind: 5, location: { uri: "file:///fake/symbols.ts", range: { start: { line: 0, character: 0 } } } },
        { name: "myMethod", kind: 12, location: { uri: "file:///fake/symbols.ts", range: { start: { line: 1, character: 2 } } } },
      ]
      break
    case "textDocument/completion":
      result = {
        items: [
          { label: "completion1", kind: 3, detail: "function" },
          { label: "completion2", kind: 13, detail: "variable" },
        ],
      }
      break
    case "textDocument/signatureHelp":
      result = {
        activeSignature: 0,
        activeParameter: 0,
        signatures: [{ label: "func(a: string, b: number)" }],
      }
      break
    case "textDocument/rename":
      result = {
        changes: { "file:///fake/rename.ts": [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: "newName" }] },
      }
      break
    case "workspace/symbol":
      result = { symbols: [] }
      break
    case "textDocument/declaration":
    case "textDocument/typeDefinition":
    case "textDocument/implementation":
      result = { uri: "file:///fake/other.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }
      break
    default:
      result = null
  }

  send({ jsonrpc: "2.0", id: message.id, result })
}

function send(message) {
  const payload = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`)
}
