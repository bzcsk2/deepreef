# Eval Gate Policy

## Acceptance Criteria

A patch is accepted for promotion only when ALL conditions are met:

```text
heldIn.delta >= 0
heldOut.delta >= 0
Math.max(heldIn.delta, heldOut.delta) > 0
policyViolationsDoNotIncrease
infraFailuresDoNotIncrease
regressions.length === 0
```

## Gate Metrics

- **Held-in pass rate**: Must not decrease (cases matching mined weakness)
- **Held-out pass rate**: Must not decrease (fixed smoke/safety/regression cases)
- **Policy violations**: Must not increase
- **Infra failures**: Must not increase
- **Regressions**: Must be zero

## Recommended Additional Gates

- Success rate not lower than before
- Average repair rounds not higher by more than 1
- Out-of-bounds writes not higher
- Worker empty output not higher
- Cost not higher by more than configured threshold

## Validation Rules

- Held-in and held-out totals must be identical before/after
- Infra failures make validation inconclusive (not accepted)
- `sandbox.benchmark` is required for official promotion
- `sandbox.local` may produce diagnostics but cannot auto-promote
