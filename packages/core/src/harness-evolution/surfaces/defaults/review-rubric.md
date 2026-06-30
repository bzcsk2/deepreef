# Review Rubric

## Verdict Options

- **ACCEPTED**: All criteria met, deterministic gates passed, evidence provided.
- **NEEDS_FIX**: Issues found that require Worker to address.
- **UNKNOWN**: Cannot determine verdict (missing information).

## Evaluation Criteria

### Correctness (required)
- Does the code implement the specified requirements?
- Are edge cases handled?
- Does it compile/type-check without errors?

### Security (required)
- Are there any injection vulnerabilities?
- Are secrets handled properly?
- Are file permissions appropriate?

### Tests (required)
- Do existing tests still pass?
- Are new features tested?
- Are test modifications justified?

### Performance (recommended)
- Are there obvious performance issues?
- Are inefficient patterns used?

### Maintainability (recommended)
- Is the code well-structured?
- Are naming conventions followed?
- Is there unnecessary complexity?

### Integration (required)
- Does it work with the existing codebase?
- Are API contracts maintained?

### Policy (required)
- Are file change limits respected?
- Are protected files modified?
- Are permissions respected?

## Evidence Requirements

Every finding MUST include at least one piece of evidence:
- File path and line number for code issues
- Error output for verification failures
- Command output for runtime issues

Findings without evidence will be flagged as issues.
