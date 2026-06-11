import type { TimelineItem } from '../bridge.js';
import type { TranscriptStore } from './transcript-store.js';
import { transcriptToTimeline } from './timeline-adapter.js';

/**
 * TranscriptStore 的 React 订阅层：缓存投影 timeline，保证 getSnapshot 引用稳定。
 */
export class TranscriptReader {
  private cachedTimeline: TimelineItem[] = [];
  private cachedVersion = -1;
  private readonly itemCache = new Map<string, TimelineItem>();

  /**
   * @param store - 规范化 transcript store
   */
  constructor(private readonly store: TranscriptStore) {}

  /**
   * useSyncExternalStore 订阅函数。
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * useSyncExternalStore 快照：版本未变时返回同一数组引用。
   */
  getSnapshot(): TimelineItem[] {
    const version = this.store.getVersion();
    if (version === this.cachedVersion) {
      return this.cachedTimeline;
    }
    this.cachedTimeline = transcriptToTimeline(this.store, this.itemCache);
    this.cachedVersion = version;
    return this.cachedTimeline;
  }

  /**
   * @returns 当前 timeline 条目数
   */
  getEntryCount(): number {
    return this.store.getEntryCount();
  }

  /**
   * 全量替换后清空投影缓存。
   */
  invalidate(): void {
    this.cachedVersion = -1;
    this.cachedTimeline = [];
    this.itemCache.clear();
  }
}
