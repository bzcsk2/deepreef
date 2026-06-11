import React from 'react';
import { useBridgeFeedback, useStatusUsage } from './store/BridgeRuntimeContext.js';
import { useTranscriptEntryCount, useTranscriptReader } from './store/TranscriptContext.js';
import { isBridgeRuntimeSplitEnabled } from './store/feature.js';

interface WelcomeWhenEmptyProps {
  /** Legacy 路径：bridgeState.timeline.length === 0 */
  legacyEmpty: boolean;
  /** Legacy 路径由 App 传入 */
  isLoading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

/**
 * 在 transcript 为空时渲染欢迎屏；Store 路径订阅 entry count，避免依赖 App 级 timeline state。
 */
export function WelcomeWhenEmpty({
  legacyEmpty,
  isLoading,
  error,
  children,
}: WelcomeWhenEmptyProps): React.ReactElement | null {
  const entryCount = useTranscriptEntryCount();
  const reader = useTranscriptReader();
  const status = useStatusUsage();
  const feedback = useBridgeFeedback();
  const split = isBridgeRuntimeSplitEnabled();

  const isEmpty = reader ? entryCount === 0 : legacyEmpty;
  const loading = split ? status.isLoading : (isLoading ?? false);
  const activeError = split ? feedback.error : (error ?? null);

  if (!isEmpty || loading || activeError) {
    return null;
  }

  return <>{children}</>;
}
