import { describe, expect, it } from 'vitest';
import { getVisibleTimeline } from '../src/DeepiMessages.js';

describe('getVisibleTimeline', () => {
  it('returns full timeline when within window size', () => {
    const timeline = [1, 2, 3];
    const result = getVisibleTimeline(timeline, 5);
    expect(result.visible).toBe(timeline);
    expect(result.hiddenCount).toBe(0);
  });

  it('slices tail when timeline exceeds window size', () => {
    const timeline = [1, 2, 3, 4, 5];
    const result = getVisibleTimeline(timeline, 3);
    expect(result.visible).toEqual([3, 4, 5]);
    expect(result.hiddenCount).toBe(2);
    // reference is different
    expect(result.visible).not.toBe(timeline);
  });

  it('returns empty visible for empty timeline', () => {
    const result = getVisibleTimeline([], 10);
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(0);
  });

  it('handles timeline length equal to window size', () => {
    const timeline = ['a', 'b', 'c'];
    const result = getVisibleTimeline(timeline, 3);
    expect(result.visible).toBe(timeline);
    expect(result.hiddenCount).toBe(0);
  });

  it('works with zero window size', () => {
    const timeline = [1, 2];
    const result = getVisibleTimeline(timeline, 0);
    expect(result.visible).toEqual([]);
    expect(result.hiddenCount).toBe(2);
  });
});
