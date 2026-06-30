# Tool Use Policy

## General Rules

- Read files before writing to them
- Use the correct package manager for install/run commands
- Run verification commands after code changes
- Avoid destructive commands unless explicitly authorized

## Allowed File Operations

| Operation | Policy |
|---|---|
| Read existing files | Always allowed |
| Write new files | Allowed with read-before-write check |
| Edit existing files | Allowed with read-before-write check |
| Delete files | Requires supervisor approval |
| Move/rename files | Requires supervisor approval |

## Restricted Commands

| Command | Policy |
|---|---|
| `rm -rf` | Requires human approval |
| `git reset --hard` | Requires supervisor approval |
| `git push` | Requires human approval |
| `npm publish` | Requires human approval |
| `terraform destroy` | Requires human approval |
| `kubectl delete` | Requires human approval |
| `curl \| sh` | Requires human approval |
| `chmod` | Requires supervisor approval |

## Verification Commands

Always run after changes:
- Type checker for TypeScript projects
- Test suite for the modified module
- Linter for the project
