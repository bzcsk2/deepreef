/**
 * Question types — adapted from OpenCode (MIT License).
 * Source: packages/opencode/src/question/index.ts
 */

export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionInfo {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface QuestionRequest {
  id: string
  sessionId: string
  questions: QuestionInfo[]
  tool?: { toolCallId: string; toolName: string }
  parentSessionId?: string
}

export type QuestionAnswer = string[]

export interface QuestionReply {
  requestId: string
  answers: QuestionAnswer[]
}

export interface QuestionReject {
  requestId: string
}
