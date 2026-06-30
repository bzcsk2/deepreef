import type { HarnessSurface } from "./patch-schema";

export interface HarnessValidationResult {
  patchId: string;
  heldIn: { beforePass: number; afterPass: number; total: number; delta: number };
  heldOut: { beforePass: number; afterPass: number; total: number; delta: number };
  accepted: boolean;
  regressions: string[];
  infraFailuresDoNotIncrease: boolean;
  policyViolationsDoNotIncrease: boolean;
}

export function evaluatePromotion(input: Omit<HarnessValidationResult, "accepted">): boolean {
  const accepted =
    input.heldIn.delta >= 0 &&
    input.heldOut.delta >= 0 &&
    Math.max(input.heldIn.delta, input.heldOut.delta) > 0 &&
    input.policyViolationsDoNotIncrease &&
    input.infraFailuresDoNotIncrease &&
    input.regressions.length === 0;
  return accepted;
}

export function validateSurfaceAutoPromotion(surface: HarnessSurface): boolean {
  const surfacesRequiringHuman: HarnessSurface[] = [
    "runtime-guard-policy",
    "tool-use-policy",
    "eval-gate-policy",
    "memory-recall-policy",
  ];
  return !surfacesRequiringHuman.includes(surface);
}

export function buildValidationResult(params: {
  patchId: string;
  beforeHeldIn: { pass: number; total: number };
  afterHeldIn: { pass: number; total: number };
  beforeHeldOut: { pass: number; total: number };
  afterHeldOut: { pass: number; total: number };
  regressions: string[];
  beforeInfraFailures: number;
  afterInfraFailures: number;
  beforePolicyViolations: number;
  afterPolicyViolations: number;
}): HarnessValidationResult {
  const result: HarnessValidationResult = {
    patchId: params.patchId,
    heldIn: {
      beforePass: params.beforeHeldIn.pass,
      afterPass: params.afterHeldIn.pass,
      total: params.beforeHeldIn.total,
      delta: params.afterHeldIn.pass - params.beforeHeldIn.pass,
    },
    heldOut: {
      beforePass: params.beforeHeldOut.pass,
      afterPass: params.afterHeldOut.pass,
      total: params.beforeHeldOut.total,
      delta: params.afterHeldOut.pass - params.beforeHeldOut.pass,
    },
    accepted: false,
    regressions: params.regressions,
    infraFailuresDoNotIncrease: params.afterInfraFailures <= params.beforeInfraFailures,
    policyViolationsDoNotIncrease: params.afterPolicyViolations <= params.beforePolicyViolations,
  };
  result.accepted = evaluatePromotion(result);
  return result;
}
