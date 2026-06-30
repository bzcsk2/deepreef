import type { HarnessSurface } from "../self-harness/patch-schema";
import type { IncidentPacket } from "../packets/incident-packet";
import type { ReviewPacket } from "../packets/review-packet";
import type { EvidenceRef } from "../packets/types";
import { ExperienceStore } from "./experience-store";
import type { ExperienceRecord } from "./experience-types";

export interface Weakness {
  id: string;
  signature: string;
  affectedSurface: HarnessSurface;
  evidenceCount: number;
  examples: EvidenceRef[];
  proposedDirection: string;
  confidence: number;
}

const BUILTIN_SIGNATURES: Record<string, { surface: HarnessSurface; direction: string }> = {
  worker_skips_reading_project_instructions: {
    surface: "worker-system-prompt",
    direction: "Add instruction to read AGENTS.md and project config before first tool call",
  },
  worker_uses_wrong_package_manager: {
    surface: "worker-system-prompt",
    direction: "Add package manager detection step before install commands",
  },
  worker_claims_done_without_verification: {
    surface: "worker-system-prompt",
    direction: "Require explicit verification command after changes",
  },
  worker_modifies_tests_to_pass: {
    surface: "worker-system-prompt",
    direction: "Warn against modifying test expectations to make tests pass",
  },
  supervisor_accepts_failed_verifier: {
    surface: "supervisor-system-prompt",
    direction: "Require verifier pass before ACCEPTED verdict",
  },
  supervisor_review_without_evidence: {
    surface: "review-rubric",
    direction: "Require file/line evidence for every finding",
  },
  context_digest_missing_lockfile: {
    surface: "task-digest-template",
    direction: "Add lockfile detection to context collection",
  },
  recovery_repeats_failed_strategy: {
    surface: "recovery-playbook",
    direction: "Check incident signature against previous recovery before proposing same fix",
  },
  runtime_guard_too_permissive: {
    surface: "runtime-guard-policy",
    direction: "Add regex pattern for the missed destructive action",
  },
  eval_case_contract_incomplete: {
    surface: "eval-gate-policy",
    direction: "Add missing contract field to eval case manifest validation",
  },
};

export function mineFromIncidents(incidents: IncidentPacket[]): Weakness[] {
  const weaknesses: Weakness[] = [];
  const signatureGroups = new Map<string, { count: number; examples: EvidenceRef[] }>();

  for (const pkt of incidents) {
    for (const inc of pkt.incidents) {
      let sig: string | null = null;
      switch (inc.kind) {
        case "missing_output":
          sig = "worker_claims_done_without_verification";
          break;
        case "policy_violation":
          sig = "supervisor_accepts_failed_verifier";
          break;
        case "tooling_error":
          sig = "eval_case_contract_incomplete";
          break;
        case "verification_failure":
          sig = "worker_modifies_tests_to_pass";
          break;
        case "context_provenance":
          sig = "context_digest_missing_lockfile";
          break;
      }
      if (sig) {
        const group = signatureGroups.get(sig) ?? { count: 0, examples: [] };
        group.count++;
        if (inc.evidence.length > 0) group.examples.push(...inc.evidence);
        signatureGroups.set(sig, group);
      }
    }
  }

  for (const [signature, group] of signatureGroups) {
    const meta = BUILTIN_SIGNATURES[signature];
    if (!meta) continue;
    weaknesses.push({
      id: `weak:${signature}`,
      signature,
      affectedSurface: meta.surface,
      evidenceCount: group.count,
      examples: group.examples.slice(0, 3),
      proposedDirection: meta.direction,
      confidence: Math.min(1, group.count / 5),
    });
  }

  return weaknesses;
}

export function mineFromReview(reviews: ReviewPacket[]): Weakness[] {
  const weaknesses: Weakness[] = [];
  const noEvidenceFindings = reviews.filter(r =>
    r.findings.some(f => f.evidence.length === 0),
  );
  if (noEvidenceFindings.length >= 2) {
    weaknesses.push({
      id: "weak:supervisor_review_without_evidence",
      signature: "supervisor_review_without_evidence",
      affectedSurface: "review-rubric",
      evidenceCount: noEvidenceFindings.length,
      examples: noEvidenceFindings.flatMap(r =>
        r.findings.filter(f => f.evidence.length === 0).map(f => ({
          file: r.packetId,
          excerpt: f.summary,
        })),
      ).slice(0, 3),
      proposedDirection: "Require file/line evidence for every finding",
      confidence: Math.min(1, noEvidenceFindings.length / 3),
    });
  }
  return weaknesses;
}

export function storeWeaknesses(store: ExperienceStore, weaknesses: Weakness[]): Promise<void> {
  const records: ExperienceRecord[] = weaknesses.map(w => ({
    id: w.id,
    signature: w.signature,
    sourceKind: "eval",
    sourceRef: "weakness-miner",
    trust: "untrusted",
    createdAt: new Date().toISOString(),
    taskType: "eval",
    failureMode: w.signature,
    successfulRecovery: w.proposedDirection,
    evidenceRefs: w.examples,
    confidence: w.confidence,
  }));
  return store.appendMany(records);
}

export function formatWeaknesses(weaknesses: Weakness[]): string {
  if (weaknesses.length === 0) return "";
  const parts = weaknesses.map(w =>
    `- ${w.signature} (x${w.evidenceCount}, confidence: ${w.confidence.toFixed(2)})\n  Surface: ${w.affectedSurface}\n  Direction: ${w.proposedDirection}`,
  );
  return "## Mined Weaknesses\n" + parts.join("\n") + "\n";
}
