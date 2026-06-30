import { describe, test, expect } from "bun:test";
import {
  anyGateFailed,
  hasVerifierFailure,
  constrainVerdictWithGates,
  gateFailuresSummary,
} from "../src/harness-evolution/loop/deterministic-gates";
import type { DeterministicGateResult } from "../src/harness-evolution/loop/deterministic-gates";

function passGate(id: string): DeterministicGateResult {
  return { gateId: id, passed: true, durationMs: 10 };
}

function failGate(id: string, failureClass?: string): DeterministicGateResult {
  return { gateId: id, passed: false, durationMs: 10, failureClass, exitCode: 1 };
}

describe("DeterministicGates", () => {
  test("anyGateFailed returns false when all pass", () => {
    expect(anyGateFailed([passGate("a"), passGate("b")])).toBe(false);
  });

  test("anyGateFailed returns true when any fails", () => {
    expect(anyGateFailed([passGate("a"), failGate("b")])).toBe(true);
  });

  test("hasVerifierFailure detects verifier failure", () => {
    const gates = [passGate("policy"), failGate("verifier", "verifier_failure")];
    expect(hasVerifierFailure(gates)).toBe(true);
  });

  test("hasVerifierFailure returns false for non-verifier failures", () => {
    const gates = [failGate("policy", "policy_gate_failure")];
    expect(hasVerifierFailure(gates)).toBe(false);
  });

  test("constrainVerdictWithGates keeps ACCEPTED when all gates pass", () => {
    expect(constrainVerdictWithGates("ACCEPTED", [passGate("a")])).toBe("ACCEPTED");
  });

  test("constrainVerdictWithGates downgrades ACCEPTED to NEEDS_FIX when gate fails", () => {
    expect(constrainVerdictWithGates("ACCEPTED", [failGate("verifier")])).toBe("NEEDS_FIX");
  });

  test("constrainVerdictWithGates leaves NEEDS_FIX unchanged", () => {
    expect(constrainVerdictWithGates("NEEDS_FIX", [passGate("a")])).toBe("NEEDS_FIX");
  });

  test("gateFailuresSummary lists failed gates", () => {
    const gates = [passGate("ok"), failGate("bad1", "policy_gate_failure"), failGate("bad2")];
    const summary = gateFailuresSummary(gates);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toContain("bad1");
  });
});
