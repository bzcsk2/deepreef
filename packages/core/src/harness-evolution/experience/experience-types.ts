import type { EvidenceRef } from "../packets/types";
import type { HarnessSurface } from "../self-harness/patch-schema";

export type ExperienceSourceKind = "task" | "eval" | "manual" | "imported";
export type ExperienceTrust = "trusted" | "untrusted";
export type ExperienceTaskType = "bugfix" | "refactor" | "doc" | "test" | "release" | "eval" | "unknown";

export interface ExperienceRecord {
  id: string;
  signature: string;
  sourceKind: ExperienceSourceKind;
  sourceRef: string;
  trust: ExperienceTrust;
  createdAt: string;
  supersedes?: string[];
  taskType: ExperienceTaskType;
  failureMode?: string;
  successfulRecovery?: string;
  badStrategy?: string;
  recommendedHarnessDelta?: {
    surface: HarnessSurface;
    direction: string;
  };
  evidenceRefs: EvidenceRef[];
  confidence: number;
}

export interface RecallFilter {
  sourceKind?: ExperienceSourceKind[];
  trust?: ExperienceTrust[];
  failureMode?: string;
  maxAgeMs?: number;
  sourceRef?: string;
  taskType?: ExperienceTaskType[];
  minConfidence?: number;
  limit?: number;
}

export interface RecallResult {
  records: ExperienceRecord[];
  total: number;
  appliedFilters: RecallFilter;
}
