# Runtime Guard Policy

## Detection Patterns

The runtime guard detects these risk patterns in prompts and commands:

### Prompt Injection (block)
- "ignore previous instructions"
- "reveal system prompt"
- "you are now" role-switching attempts

### Untrusted Input (review)
- Content from browser, email, issues, or comments controlling actions
- External source content without sourceRef

### Destructive Actions (block)
- `rm -rf` with dangerous paths
- `git reset --hard` (with force flags)
- `git clean -f`
- Drop database commands
- `terraform destroy`
- `kubectl delete`

### Privileged Actions (certificate required)
- `git push`
- `npm publish`
- Deployment commands
- `curl | sh` patterns
- Secret/API key with outbound action

## Dispositions

- **allow**: Continue and record packet
- **review**: Supervisor must approve or convert to safer instruction
- **block**: Stop Worker dispatch unless explicit human approval exists

## Policy Rules

- The guard is deterministic (no model calls)
- Initial pattern matching is regex-based
- Patterns are conservative (favor false positive over false negative)
- Secret exfiltration detection checks for API keys/credentials in outbound actions
