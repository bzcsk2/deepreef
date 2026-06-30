# Incident Taxonomy

## Incident Kinds

| Kind | Description | Harness Layer | Severity |
|---|---|---|---|
| `review_needs_fix` | Supervisor review found issues | lifecycle | major |
| `verification_failure` | Tests/typecheck/build failed | verification | critical |
| `build_failure` | Build process failed | tools | critical |
| `integration_conflict` | Changes conflict with existing code | environment | major |
| `runtime_failure` | Runtime errors during execution | tools | major |
| `tooling_error` | Missing commands, binaries, fixtures | tools | major |
| `missing_output` | Worker submitted empty result | observability | critical |
| `context_provenance` | Missing or stale context files | context | minor |
| `planning_error` | Flawed task decomposition | lifecycle | major |
| `policy_violation` | Policy gate blocked the action | governance | critical |
| `sandbox_failure` | Sandbox environment error | sandbox | critical |
| `unknown` | Cannot classify | unknown | unknown |

## Classification Rules

- Empty worker output → `missing_output`
- "No tests found" → infrastructure, not worker blame
- Missing binary/fixture → `tooling_error` (infra, not task)
- Policy gate failure → `policy_violation`
- Setup/verifier failures → infrastructure
