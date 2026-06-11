import React, { createContext, useContext } from 'react';
import { useSyncExternalStore } from 'react';
import type { TimelineItem } from '../bridge.js';
import type { TranscriptReader } from './transcript-reader.js';

const TranscriptContext = createContext<TranscriptReader | null>(null);

const emptySubscribe = () => () => {};
/** useSyncExternalStore 要求 getSnapshot 返回稳定引用，不可每次 new [] */
const EMPTY_TIMELINE: TimelineItem[] = [];
const emptySnapshot = (): TimelineItem[] => EMPTY_TIMELINE;

interface TranscriptProviderProps {
  reader: TranscriptReader | null;
  children: React.ReactNode;
}

/**
 * 向子树提供 TranscriptReader（仅 `DEEPCODE_TUI_STORE=1` 时有值）。
 */
export function TranscriptProvider({ reader, children }: TranscriptProviderProps): React.ReactElement {
  return (
    <TranscriptContext.Provider value={reader}>
      {children}
    </TranscriptContext.Provider>
  );
}

/**
 * @returns 当前 reader，无 store 时为 null
 */
export function useTranscriptReader(): TranscriptReader | null {
  return useContext(TranscriptContext);
}

/**
 * 通过 useSyncExternalStore 订阅 transcript timeline。
 * Store 未启用时返回空数组（由 props fallback 接管）。
 */
export function useTranscriptTimeline(): TimelineItem[] {
  const reader = useTranscriptReader();
  return useSyncExternalStore(
    reader ? reader.subscribe.bind(reader) : emptySubscribe,
    reader ? reader.getSnapshot.bind(reader) : emptySnapshot,
    emptySnapshot,
  );
}

/**
 * 订阅 timeline 条目数量（用于欢迎屏等轻量判断）。
 */
export function useTranscriptEntryCount(): number {
  const reader = useTranscriptReader();
  return useSyncExternalStore(
    reader ? reader.subscribe.bind(reader) : emptySubscribe,
    reader ? () => reader.getEntryCount() : () => 0,
    () => 0,
  );
}
