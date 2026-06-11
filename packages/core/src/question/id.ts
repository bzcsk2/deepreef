/**
 * Question ID generation — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/question/schema.ts
 */

let counter = 0

export function createQuestionId(): string {
  const now = Date.now().toString(36).padStart(9, "0")
  counter = (counter + 1) % 1000
  const seq = counter.toString().padStart(3, "0")
  return `que${now}${seq}`
}
