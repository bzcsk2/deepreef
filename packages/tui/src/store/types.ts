import type { ChatMessage } from '@deepreef/core';

/** 工具调用在 transcript / timeline 中的运行态快照 */
export interface ToolStatus {
  key: string;
  name: string;
  status: 'running' | 'done' | 'error';
  args: Record<string, unknown>;
  output: string;
  startedAt: number;
  elapsedMs?: number;
}

/** 单条 transcript 条目（与 UI `TimelineItem` 同构） */
export type TranscriptEntry =
  | { id: string; kind: 'message'; message: ChatMessage }
  | { id: string; kind: 'assistant_text'; roundId: string; text: string; isStreaming: boolean; startTs: number }
  | { id: string; kind: 'reasoning'; roundId: string; text: string; isStreaming: boolean; startTs: number }
  | { id: string; kind: 'tool'; roundId: string; tool: ToolStatus };

/** @deprecated 与 `TranscriptEntry` 同构，保留以兼容现有 UI 导入 */
export type TimelineItem = TranscriptEntry;

/** 流式 part 指针（messageId + partId） */
export interface PartRef {
  messageId: string;
  partId: string;
}

export interface TranscriptSnapshot {
  order: readonly string[];
  entries: Readonly<Record<string, TranscriptEntry>>;
  version: number;
}
