import type { ExperienceRecord, RecallFilter } from "./experience-types";

export interface RecallPolicyConfig {
  /** Default: only trusted */
  trustFilter: ("trusted" | "untrusted")[];
  /** Max age of records to recall, in ms (default: 30 days) */
  maxAgeMs: number;
  /** Max records to inject (default: 3) */
  maxRecall: number;
  /** Min confidence to inject (default: 0.3) */
  minConfidence: number;
  /** Include metadata in prompt, not just body (default: true) */
  includeMetadata: boolean;
}

export const DEFAULT_RECALL_POLICY: RecallPolicyConfig = {
  trustFilter: ["trusted"],
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  maxRecall: 3,
  minConfidence: 0.3,
  includeMetadata: true,
};

export function buildRecallFilter(config: Partial<RecallPolicyConfig> = {}): RecallFilter {
  const merged = { ...DEFAULT_RECALL_POLICY, ...config };
  return {
    trust: merged.trustFilter,
    maxAgeMs: merged.maxAgeMs,
    limit: merged.maxRecall,
    minConfidence: merged.minConfidence,
  };
}

export function formatExperienceForPrompt(records: ExperienceRecord[], includeMetadata: boolean = true): string {
  if (records.length === 0) return "";
  const parts = records.map((r, i) => {
    const meta = includeMetadata
      ? ` [${r.trust}, ${r.sourceKind}, confidence: ${r.confidence.toFixed(2)}]`
      : "";
    const failure = r.failureMode ? `\n  Failure: ${r.failureMode}` : "";
    const recovery = r.successfulRecovery ? `\n  Recovery: ${r.successfulRecovery}` : "";
    const bad = r.badStrategy ? `\n  Avoid: ${r.badStrategy}` : "";
    return `Experience ${i + 1}${meta}:${failure}${recovery}${bad}`;
  });
  return "## Relevant Experiences\n" + parts.join("\n\n") + "\n";
}
