import { describe, test, expect } from "bun:test";
import { evaluatePromotion, buildValidationResult, validateSurfaceAutoPromotion } from "../src/harness-evolution/self-harness/promotion-gate";

describe("PromotionGate", () => {
  test("accepts when both held-in and held-out improve", () => {
    const r = buildValidationResult({
      patchId: "p1",
      beforeHeldIn: { pass: 5, total: 10 },
      afterHeldIn: { pass: 8, total: 10 },
      beforeHeldOut: { pass: 3, total: 5 },
      afterHeldOut: { pass: 4, total: 5 },
      regressions: [],
      beforeInfraFailures: 0,
      afterInfraFailures: 0,
      beforePolicyViolations: 0,
      afterPolicyViolations: 0,
    });
    expect(r.accepted).toBe(true);
  });

  test("rejects when held-in regresses", () => {
    const r = buildValidationResult({
      patchId: "p2",
      beforeHeldIn: { pass: 8, total: 10 },
      afterHeldIn: { pass: 5, total: 10 },
      beforeHeldOut: { pass: 3, total: 5 },
      afterHeldOut: { pass: 4, total: 5 },
      regressions: [],
      beforeInfraFailures: 0,
      afterInfraFailures: 0,
      beforePolicyViolations: 0,
      afterPolicyViolations: 0,
    });
    expect(r.accepted).toBe(false);
  });

  test("rejects when held-out regresses", () => {
    const r = buildValidationResult({
      patchId: "p3",
      beforeHeldIn: { pass: 5, total: 10 },
      afterHeldIn: { pass: 6, total: 10 },
      beforeHeldOut: { pass: 4, total: 5 },
      afterHeldOut: { pass: 2, total: 5 },
      regressions: [],
      beforeInfraFailures: 0,
      afterInfraFailures: 0,
      beforePolicyViolations: 0,
      afterPolicyViolations: 0,
    });
    expect(r.accepted).toBe(false);
  });

  test("rejects when no improvement (delta=0)", () => {
    const r = buildValidationResult({
      patchId: "p4",
      beforeHeldIn: { pass: 5, total: 10 },
      afterHeldIn: { pass: 5, total: 10 },
      beforeHeldOut: { pass: 3, total: 5 },
      afterHeldOut: { pass: 3, total: 5 },
      regressions: [],
      beforeInfraFailures: 0,
      afterInfraFailures: 0,
      beforePolicyViolations: 0,
      afterPolicyViolations: 0,
    });
    expect(r.accepted).toBe(false);
  });

  test("rejects when policy violations increase", () => {
    const r = buildValidationResult({
      patchId: "p5",
      beforeHeldIn: { pass: 5, total: 10 },
      afterHeldIn: { pass: 8, total: 10 },
      beforeHeldOut: { pass: 3, total: 5 },
      afterHeldOut: { pass: 4, total: 5 },
      regressions: [],
      beforeInfraFailures: 0,
      afterInfraFailures: 0,
      beforePolicyViolations: 1,
      afterPolicyViolations: 3,
    });
    expect(r.accepted).toBe(false);
  });

  test("rejects when regressions exist", () => {
    const r = buildValidationResult({
      patchId: "p6",
      beforeHeldIn: { pass: 5, total: 10 },
      afterHeldIn: { pass: 8, total: 10 },
      beforeHeldOut: { pass: 3, total: 5 },
      afterHeldOut: { pass: 4, total: 5 },
      regressions: ["case-001"],
      beforeInfraFailures: 0,
      afterInfraFailures: 0,
      beforePolicyViolations: 0,
      afterPolicyViolations: 0,
    });
    expect(r.accepted).toBe(false);
  });

  test("validateSurfaceAutoPromotion allows non-safety surfaces", () => {
    expect(validateSurfaceAutoPromotion("supervisor-system-prompt")).toBe(true);
  });

  test("validateSurfaceAutoPromotion blocks safety surfaces", () => {
    expect(validateSurfaceAutoPromotion("runtime-guard-policy")).toBe(false);
    expect(validateSurfaceAutoPromotion("tool-use-policy")).toBe(false);
    expect(validateSurfaceAutoPromotion("eval-gate-policy")).toBe(false);
    expect(validateSurfaceAutoPromotion("memory-recall-policy")).toBe(false);
  });

  test("evaluatePromotion works with standalone call", () => {
    const accepted = evaluatePromotion({
      patchId: "p7",
      heldIn: { beforePass: 5, afterPass: 8, total: 10, delta: 3 },
      heldOut: { beforePass: 3, afterPass: 4, total: 5, delta: 1 },
      accepted: false,
      regressions: [],
      infraFailuresDoNotIncrease: true,
      policyViolationsDoNotIncrease: true,
    });
    expect(accepted).toBe(true);
  });
});
