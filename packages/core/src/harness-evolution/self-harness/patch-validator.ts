import type { HarnessPatchPacket, HarnessSurface } from "./patch-schema";
import type { SurfaceStore } from "../surfaces/surface-store";
import {
  evaluatePromotion,
  validateSurfaceAutoPromotion,
  type HarnessValidationResult,
} from "./promotion-gate";

/**
 * Validates a harness patch against surface content and promotion rules.
 */
export class PatchValidator {
  private surfaceStore: SurfaceStore;

  constructor(surfaceStore: SurfaceStore) {
    this.surfaceStore = surfaceStore;
  }

  /**
   * Validate a patch before considering promotion.
   * Checks:
   * - Surface exists and is known
   * - beforeHash matches current surface
   * - Safety surfaces are not auto-promoted
   */
  async validatePatchIntegrity(patch: HarnessPatchPacket): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check surface is valid
    try {
      await this.surfaceStore.get(patch.surface);
    } catch {
      errors.push(`Unknown surface: ${patch.surface}`);
      return { valid: false, errors, warnings };
    }

    // Check beforeHash matches current surface
    const currentHash = await this.surfaceStore.getHash(patch.surface);
    if (patch.beforeHash !== currentHash) {
      errors.push(
        `beforeHash mismatch for "${patch.surface}": expected "${currentHash}", got "${patch.beforeHash}". ` +
        `The surface has changed since this patch was generated.`,
      );
    }

    // Warn about safety surface auto-promotion
    if (!validateSurfaceAutoPromotion(patch.surface)) {
      warnings.push(
        `Surface "${patch.surface}" is a safety surface and requires human promotion. ` +
        `Auto-promotion will be blocked.`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Run held-in/held-out validation for a patch.
   * Uses buildValidationResult from promotion-gate.ts.
   *
   * In a real scenario, the before/after numbers come from running eval
   * with the current vs patched surface. This method accepts the params
   * directly rather than running evals (which is the caller's responsibility).
   */
  async runValidation(params: {
    patch: HarnessPatchPacket;
    beforeHeldIn: { pass: number; total: number };
    afterHeldIn: { pass: number; total: number };
    beforeHeldOut: { pass: number; total: number };
    afterHeldOut: { pass: number; total: number };
    regressions: string[];
    beforeInfraFailures: number;
    afterInfraFailures: number;
    beforePolicyViolations: number;
    afterPolicyViolations: number;
  }): Promise<HarnessValidationResult> {
    const integrityCheck = await this.validatePatchIntegrity(params.patch);
    if (!integrityCheck.valid) {
      return {
        patchId: params.patch.patchId,
        heldIn: { beforePass: 0, afterPass: 0, total: 0, delta: 0 },
        heldOut: { beforePass: 0, afterPass: 0, total: 0, delta: 0 },
        accepted: false,
        regressions: params.regressions,
        infraFailuresDoNotIncrease: params.afterInfraFailures <= params.beforeInfraFailures,
        policyViolationsDoNotIncrease: params.afterPolicyViolations <= params.beforePolicyViolations,
      };
    }

    const { buildValidationResult } = await import("./promotion-gate");

    return buildValidationResult({
      patchId: params.patch.patchId,
      beforeHeldIn: params.beforeHeldIn,
      afterHeldIn: params.afterHeldIn,
      beforeHeldOut: params.beforeHeldOut,
      afterHeldOut: params.afterHeldOut,
      regressions: params.regressions,
      beforeInfraFailures: params.beforeInfraFailures,
      afterInfraFailures: params.afterInfraFailures,
      beforePolicyViolations: params.beforePolicyViolations,
      afterPolicyViolations: params.afterPolicyViolations,
    });
  }

  /**
   * Check if a patch can be auto-promoted.
   * Safety surfaces always require human promotion.
   * Non-safety surfaces can auto-promote if validation passes.
   */
  canAutoPromote(surface: HarnessSurface, validationResult: HarnessValidationResult): boolean {
    if (!validateSurfaceAutoPromotion(surface)) return false;
    return validationResult.accepted;
  }
}
