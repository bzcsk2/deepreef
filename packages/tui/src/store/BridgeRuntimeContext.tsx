import React, { createContext, useContext, useSyncExternalStore } from 'react';
import type { BridgeRuntime, BridgeFeedbackState, PermissionQuestionState, PromptQueueState, StatusUsageState } from './bridge-runtime.js';
import {
  createInitialBridgeFeedback,
  createInitialPermissionQuestion,
  createInitialPromptQueue,
  createInitialStatusUsage,
} from './bridge-runtime.js';

const BridgeRuntimeContext = createContext<BridgeRuntime | null>(null);

/** runtime 未启用时 useSyncExternalStore 的稳定 fallback 快照 */
const FALLBACK_STATUS_USAGE = createInitialStatusUsage();
const FALLBACK_PROMPT_QUEUE = createInitialPromptQueue();
const FALLBACK_PERMISSION_QUESTION = createInitialPermissionQuestion();
const FALLBACK_BRIDGE_FEEDBACK = createInitialBridgeFeedback();

interface BridgeRuntimeProviderProps {
  runtime: BridgeRuntime | null;
  children: React.ReactNode;
}

/**
 * 向子树提供拆分后的 bridge 运行时 store。
 */
export function BridgeRuntimeProvider({ runtime, children }: BridgeRuntimeProviderProps): React.ReactElement {
  return (
    <BridgeRuntimeContext.Provider value={runtime}>
      {children}
    </BridgeRuntimeContext.Provider>
  );
}

function useBridgeRuntime(): BridgeRuntime | null {
  return useContext(BridgeRuntimeContext);
}

function useStoreSlice<T>(
  runtime: BridgeRuntime | null,
  subscribe: (runtime: BridgeRuntime, listener: () => void) => () => void,
  getSnapshot: (runtime: BridgeRuntime) => T,
  serverSnapshot: T,
): T {
  return useSyncExternalStore(
    listener => (runtime ? subscribe(runtime, listener) : () => () => {}),
    () => (runtime ? getSnapshot(runtime) : serverSnapshot),
    () => serverSnapshot,
  );
}

/**
 * 订阅 tokens / loading / reasoning 等状态栏相关字段。
 */
export function useStatusUsage(): StatusUsageState {
  const runtime = useBridgeRuntime();
  return useStoreSlice(
    runtime,
    (rt, listener) => rt.statusUsage.subscribe(listener),
    rt => rt.statusUsage.getSnapshot(),
    FALLBACK_STATUS_USAGE,
  );
}

/**
 * 订阅输入队列与 pending instruction 计数。
 */
export function usePromptQueue(): PromptQueueState {
  const runtime = useBridgeRuntime();
  return useStoreSlice(
    runtime,
    (rt, listener) => rt.promptQueue.subscribe(listener),
    rt => rt.promptQueue.getSnapshot(),
    FALLBACK_PROMPT_QUEUE,
  );
}

/**
 * 订阅权限与追问弹窗状态。
 */
export function usePermissionQuestion(): PermissionQuestionState {
  const runtime = useBridgeRuntime();
  return useStoreSlice(
    runtime,
    (rt, listener) => rt.permissionQuestion.subscribe(listener),
    rt => rt.permissionQuestion.getSnapshot(),
    FALLBACK_PERMISSION_QUESTION,
  );
}

/**
 * 订阅 warnings / error。
 */
export function useBridgeFeedback(): BridgeFeedbackState {
  const runtime = useBridgeRuntime();
  return useStoreSlice(
    runtime,
    (rt, listener) => rt.feedback.subscribe(listener),
    rt => rt.feedback.getSnapshot(),
    FALLBACK_BRIDGE_FEEDBACK,
  );
}
