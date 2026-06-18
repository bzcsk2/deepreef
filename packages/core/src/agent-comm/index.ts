export type { AgentMessage, AgentRole, MessageKind, DeliveryMode, MailboxReadOptions } from "./types.js"
export { Mailbox } from "./mailbox.js"
export { AgentCommController } from "./controller.js"
export {
  createSendMessageTool,
  createFollowupTaskTool,
  createReadMailboxTool,
  createMailboxTools,
} from "./tools.js"
