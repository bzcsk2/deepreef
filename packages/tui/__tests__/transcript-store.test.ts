import { describe, expect, it } from 'vitest';
import { TranscriptStore } from '../src/store/transcript-store.js';
import { TranscriptReader } from '../src/store/transcript-reader.js';
import { transcriptToTimeline } from '../src/store/timeline-adapter.js';

describe('TranscriptStore', () => {
  it('appendPartDelta mutates text in place without replacing order array', () => {
    const store = new TranscriptStore();
    store.ensureTextPart('a1', 'assistant_text', 'round-1', 1000);
    const orderBefore = store.getSnapshot().order;
    store.appendPartDelta('a1', 'hel');
    store.appendPartDelta('a1', 'lo');
    const orderAfter = store.getSnapshot().order;

    expect(orderAfter).toBe(orderBefore);
    expect(store.toTimelineItems()[0]?.kind).toBe('assistant_text');
    if (store.toTimelineItems()[0]?.kind === 'assistant_text') {
      expect(store.toTimelineItems()[0].text).toBe('hello');
      expect(store.toTimelineItems()[0].isStreaming).toBe(true);
    }
  });

  it('finalizePart marks streaming=false', () => {
    const store = new TranscriptStore();
    store.ensureTextPart('r1', 'reasoning', 'round-1', 2000);
    store.appendPartDelta('r1', 'think');
    store.finalizePart('r1');

    const item = store.toTimelineItems()[0];
    expect(item?.kind).toBe('reasoning');
    if (item?.kind === 'reasoning') {
      expect(item.text).toBe('think');
      expect(item.isStreaming).toBe(false);
    }
  });

  it('upsertAssistantText keeps reasoning before assistant in same round', () => {
    const store = new TranscriptStore();
    store.upsertReasoning({
      id: 'reason-1',
      kind: 'reasoning',
      roundId: 'round-1',
      text: 'chain',
      isStreaming: false,
      startTs: 1,
    });
    store.upsertAssistantText({
      id: 'asst-1',
      kind: 'assistant_text',
      roundId: 'round-1',
      text: 'answer',
      isStreaming: false,
      startTs: 2,
    });

    expect(store.getSnapshot().order).toEqual(['reason-1', 'asst-1']);
  });

  it('transcriptToTimeline reuses unchanged item references', () => {
    const store = new TranscriptStore();
    store.appendUser('u1', 'hi');
    store.ensureTextPart('a1', 'assistant_text', 'round-1', 1000);

    const cache = new Map();
    const first = transcriptToTimeline(store, cache);
    store.appendPartDelta('a1', '!');
    const second = transcriptToTimeline(store, cache);

    expect(first[0]).toBe(second[0]);
    expect(first[1]).not.toBe(second[1]);
    if (second[1]?.kind === 'assistant_text') {
      expect(second[1].text).toBe('!');
    }
  });

  it('TranscriptReader returns stable snapshot reference until store changes', () => {
    const store = new TranscriptStore();
    const reader = new TranscriptReader(store);
    store.appendUser('u1', 'hi');

    const first = reader.getSnapshot();
    const second = reader.getSnapshot();
    expect(first).toBe(second);

    store.appendPartDelta('u1', ''); // bump without visible change to user message
    // user message doesn't support delta - use assistant
    store.ensureTextPart('a1', 'assistant_text', 'round-1', 1);
    store.appendPartDelta('a1', 'x');
    const third = reader.getSnapshot();
    expect(third).not.toBe(first);
  });

  it('subscribe notifies listeners on mutation', () => {
    const store = new TranscriptStore();
    let count = 0;
    const unsubscribe = store.subscribe(() => {
      count += 1;
    });
    store.appendUser('u1', 'hello');
    store.appendMessage('m1', { role: 'assistant', content: 'ok' });
    unsubscribe();
    store.appendUser('u2', 'again');

    expect(count).toBe(2);
  });
});
