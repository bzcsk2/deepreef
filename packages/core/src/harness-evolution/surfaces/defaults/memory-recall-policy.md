# Memory Recall Policy

## What Gets Stored

Only structured, evidence-backed experiences are stored:
- Failed task outcomes with failure mode
- Successful recovery strategies
- Bad strategies to avoid
- Harness change recommendations

## Trust Levels

- `trusted`: Confirmed by human or verified by successful eval
- `untrusted`: Imported from external sources, mined automatically

## Recall Rules

- Only `trusted` memories are injected into prompts by default
- `untrusted` memories require explicit policy override to inject
- Superseded memories are hidden by default
- Recall supports filters: sourceKind, trust, failureMode, age, exact sourceRef
- Memory injection includes metadata (trust, source, confidence)

## Filtering

Default recall filter:
- Trust: trusted only
- Max age: 30 days
- Max records: 3
- Min confidence: 0.3
