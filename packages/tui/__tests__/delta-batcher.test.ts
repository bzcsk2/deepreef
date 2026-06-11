import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DeltaBatcher, resolveDeltaFlushMs } from '../src/delta-batcher.js';

describe('DeltaBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DEEPCODE_DELTA_FLUSH_MS;
  });

  it('merges rapid schedules into a single flush', () => {
    const onFlush = vi.fn();
    const batcher = new DeltaBatcher(16, onFlush);

    batcher.schedule();
    batcher.schedule();
    batcher.schedule();
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('flushNow runs immediately and clears pending timer', () => {
    const onFlush = vi.fn();
    const batcher = new DeltaBatcher(16, onFlush);

    batcher.schedule();
    batcher.flushNow();
    expect(onFlush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(32);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('uses immediate flush when flushMs is 0', () => {
    const onFlush = vi.fn();
    const batcher = new DeltaBatcher(0, onFlush);

    batcher.schedule();
    batcher.schedule();
    expect(onFlush).toHaveBeenCalledTimes(2);
  });
});

describe('resolveDeltaFlushMs', () => {
  afterEach(() => {
    delete process.env.DEEPCODE_DELTA_FLUSH_MS;
  });

  it('defaults to 16ms', () => {
    expect(resolveDeltaFlushMs()).toBe(16);
  });

  it('returns 0 when env disables batching', () => {
    process.env.DEEPCODE_DELTA_FLUSH_MS = '0';
    expect(resolveDeltaFlushMs()).toBe(0);
  });
});
