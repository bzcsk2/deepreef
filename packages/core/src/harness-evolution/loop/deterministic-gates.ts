import type { ReviewVerdict } from "../packets/types";

export interface DeterministicGateResult {
  gateId: string;
  command?: string;
  passed: boolean;
  exitCode?: number | null;
  stdoutSnippet?: string;
  stderrSnippet?: string;
  durationMs: number;
  failureClass?: string;
}

export function anyGateFailed(gates: DeterministicGateResult[]): boolean {
  return gates.some(g => !g.passed);
}

export function hasVerifierFailure(gates: DeterministicGateResult[]): boolean {
  return gates.some(g => g.failureClass === "verifier_failure" && !g.passed);
}

/** Gate failure prevents ACCEPTED. Returns the constrained verdict. */
export function constrainVerdictWithGates(
  verdict: ReviewVerdict,
  gates: DeterministicGateResult[],
): ReviewVerdict {
  if (verdict === "ACCEPTED" && anyGateFailed(gates)) {
    return "NEEDS_FIX";
  }
  return verdict;
}

export function gateFailuresSummary(gates: DeterministicGateResult[]): string[] {
  return gates.filter(g => !g.passed).map(g =>
    g.failureClass
      ? `${g.gateId}: ${g.failureClass}${g.command ? ` (${g.command})` : ""}`
      : `${g.gateId}${g.command ? ` (${g.command})` : ""}`,
  );
}
