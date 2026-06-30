# Recovery Playbook

## Recovery Phases

Each recovery follows four phases in order:
1. **Containment** — Stop the damage, isolate the failure
2. **Repair** — Fix the root cause
3. **Validation** — Verify the fix works
4. **Learning** — Record what went wrong for future prevention

## Recovery by Incident Kind

### verification_failure
- Containment: Revert any test modifications
- Repair: Fix code to pass existing tests (do not modify tests)
- Validation: Re-run failing tests

### missing_output
- Containment: Request worker to show output
- Repair: Add explicit output/return statements
- Validation: Run with expected input and capture output

### tooling_error
- Containment: Verify command availability
- Repair: Use alternative tool or install missing dependency
- Validation: Run the command again

### policy_violation
- Containment: Restore any reverted protected files
- Repair: Follow policy rules for the action
- Validation: Re-run policy checks

### build_failure
- Containment: Revert any incomplete changes
- Repair: Fix compilation errors
- Validation: Rebuild

## Rules

- Do not retry on raw failure text without classification
- If no evidence exists for a failure, disposition is `blocked`
- Infra failures should not blame the Worker
- Each recovery step must reference the incident ID
