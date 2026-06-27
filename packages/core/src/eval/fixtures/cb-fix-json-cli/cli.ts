// A simple CLI tool that parses JSON from stdin and transforms it
// BUG: transformValue returns "[object Object]" for objects instead of proper key-value pairs

export function parseInput(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function transformValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) {
    return "[" + value.map((v) => transformValue(v)).join(", ") + "]";
  }
  // BUG: For objects, this returns "[object Object]" instead of proper key-value pairs
  if (typeof value === "object") {
    return String(value);
  }
  return String(value);
}

export function processInput(input: string): string {
  const parsed = parseInput(input);
  if (parsed === null) {
    return "Error: Invalid JSON";
  }
  return transformValue(parsed);
}

// When run directly from CLI
if (process.argv[1]?.endsWith("cli.ts")) {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  process.stdin.on("end", () => {
    const input = Buffer.concat(chunks).toString().trim();
    console.log(processInput(input));
  });
}
