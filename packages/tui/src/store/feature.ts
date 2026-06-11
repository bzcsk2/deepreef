/**
 * 是否启用 TranscriptStore 路径（`DEEPCODE_TUI_STORE=1`）。
 * 默认关闭，保留 legacy `TimelineItem[]` 双写兼容。
 */
export function isTranscriptStoreEnabled(): boolean {
  return process.env.DEEPCODE_TUI_STORE === '1';
}

/**
 * 是否拆分 BridgeState 为可订阅子 store（与 TranscriptStore 共用开关）。
 */
export function isBridgeRuntimeSplitEnabled(): boolean {
  return isTranscriptStoreEnabled();
}
