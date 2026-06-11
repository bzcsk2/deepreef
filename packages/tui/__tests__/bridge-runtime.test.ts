import { describe, expect, it } from 'vitest';
import { BridgeRuntime } from '../src/store/bridge-runtime.js';

describe('BridgeRuntime', () => {
  it('applyPatch updates only the targeted slice', () => {
    const runtime = new BridgeRuntime();
    let statusHits = 0;
    let queueHits = 0;

    runtime.statusUsage.subscribe(() => {
      statusHits += 1;
    });
    runtime.promptQueue.subscribe(() => {
      queueHits += 1;
    });

    runtime.applyPatch({ isLoading: true });
    runtime.applyPatch({ pendingInstructionCount: 2 });

    expect(runtime.statusUsage.getSnapshot().isLoading).toBe(true);
    expect(runtime.promptQueue.getSnapshot().pendingInstructionCount).toBe(2);
    expect(statusHits).toBe(1);
    expect(queueHits).toBe(1);
  });

  it('reset restores initial values', () => {
    const runtime = new BridgeRuntime();
    runtime.applyPatch({ isLoading: true, error: 'boom' });
    runtime.reset();

    expect(runtime.statusUsage.getSnapshot().isLoading).toBe(false);
    expect(runtime.feedback.getSnapshot().error).toBeNull();
  });
});
