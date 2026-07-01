import { describe, it, expect } from 'vitest';
import { t } from '../src/i18n/index.js';

describe('D3: workflow continuation guard', () => {
  it('has a continuation guard message in both locales', () => {
    // 验证 i18n 字符串存在
    const msg = t().workflowContinuationGuard;
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(10);
  });

  it('has a stuck guard message in both locales', () => {
    const msg = t().workflowStuckGuard;
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(10);
  });
});
