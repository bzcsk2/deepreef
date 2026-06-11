export type ThinkingMode = "off" | "open" | "high"

export interface ThinkingModeMapping {
  thinking?: { type: "enabled" | "disabled" }
  reasoningEffort?: "low" | "medium" | "high" | "max"
}

export interface ProviderThinkingCapabilities {
  supportedModes: ThinkingMode[]
  mapMode(mode: ThinkingMode): ThinkingModeMapping | null
}

export function createDeepSeekCapabilities(provider?: string): ProviderThinkingCapabilities {
  const supportsReasoningEffort = provider === "deepseek"
  return {
    supportedModes: ["off", "open", "high"],
    mapMode(mode) {
      if (mode === "off") return { thinking: { type: "disabled" } }
      const result: ThinkingModeMapping = { thinking: { type: "enabled" } }
      if (mode === "high" && supportsReasoningEffort) result.reasoningEffort = "high"
      return result
    },
  }
}
