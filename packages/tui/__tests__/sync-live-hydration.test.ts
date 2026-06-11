import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../src/bridge.js';
import { mergeTimelineEntries, shouldKeepLocalTextPart } from '../src/store/hydration-merge.js';
import { TranscriptStore } from '../src/store/transcript-store.js';

const assistantPart = (
  id: string,
  text: string,
  isStreaming = false,
): Extract<TimelineItem, { kind: 'assistant_text' }> => ({
  id,
  kind: 'assistant_text',
  roundId: 'round-1',
  text,
  isStreaming,
  startTs: 1000,
});

describe('sync-live-hydration', () => {
  it('stale hydration does not overwrite live message parts', () => {
    const store = new TranscriptStore();
    store.ensureTextPart('asst-1', 'assistant_text', 'round-1', 1000);
    store.appendPartDelta('asst-1', 'visible live content');

    const staleHydration = [assistantPart('asst-1', '')];
    store.mergeHydration(staleHydration);

    const item = store.toTimelineItems().find(entry => entry.id === 'asst-1');
    expect(item?.kind).toBe('assistant_text');
    if (item?.kind === 'assistant_text') {
      expect(item.text).toBe('visible live content');
    }
  });

  it('hydration applies when no live activity touched the part', () => {
    const store = new TranscriptStore();
    const hydrated = [assistantPart('asst-1', 'hydrated')];

    store.mergeHydration(hydrated);

    const item = store.toTimelineItems()[0];
    expect(item?.kind).toBe('assistant_text');
    if (item?.kind === 'assistant_text') {
      expect(item.text).toBe('hydrated');
    }
  });

  it('hydration does not clear text streamed before hydration starts', () => {
    const local = [assistantPart('asst-1', 'visible streamed content', true)];
    const incoming = [assistantPart('asst-1', '')];
    const liveTouched = new Set(['asst-1']);

    const merged = mergeTimelineEntries(local, incoming, liveTouched);
    expect(merged[0]?.kind).toBe('assistant_text');
    if (merged[0]?.kind === 'assistant_text') {
      expect(merged[0].text).toBe('visible streamed content');
    }
  });

  it('live-only entries are retained when missing from hydration payload', () => {
    const store = new TranscriptStore();
    store.appendUser('user-live', 'new question');
    store.ensureTextPart('asst-live', 'assistant_text', 'round-live', 2000);
    store.appendPartDelta('asst-live', 'streaming now');

    store.mergeHydration([
      assistantPart('asst-old', 'history only'),
    ]);

    const ids = store.toTimelineItems().map(item => item.id);
    expect(ids).toContain('user-live');
    expect(ids).toContain('asst-live');
    expect(ids).toContain('asst-old');
  });

  it('shouldKeepLocalTextPart guards empty incoming over non-empty local', () => {
    expect(shouldKeepLocalTextPart(
      assistantPart('a', 'live'),
      assistantPart('a', ''),
    )).toBe(true);
    expect(shouldKeepLocalTextPart(
      assistantPart('a', ''),
      assistantPart('a', 'remote'),
    )).toBe(false);
  });

  it('live revision increases monotonically on delta append', () => {
    const store = new TranscriptStore();
    store.ensureTextPart('asst-1', 'assistant_text', 'round-1', 1000);
    expect(store.getPartRevision('asst-1')).toBe(1);

    store.appendPartDelta('asst-1', 'a');
    store.appendPartDelta('asst-1', 'b');
    expect(store.getPartRevision('asst-1')).toBe(3);
  });
});
