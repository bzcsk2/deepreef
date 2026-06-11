/**
 * Question module — adapted from OpenCode (MIT License).
 */

export { createQuestionId } from "./id.js"
export type {
  QuestionOption,
  QuestionInfo,
  QuestionRequest,
  QuestionAnswer,
  QuestionReply,
  QuestionReject,
} from "./types.js"
export {
  QuestionService,
  RejectedError,
  QuestionNotFoundError,
} from "./service.js"
export type { QuestionServiceInterface } from "./service.js"
