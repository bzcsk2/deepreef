# Task Digest Template

Generate a structured digest for every task before dispatching to the Worker.

## Required Fields

```
Goal: <clear, single-sentence objective>
Acceptance Criteria:
  - <verifiable condition>
  - <verifiable condition>
Repository Facts:
  - CWD: <working directory>
  - Package Manager: <auto-detected: bun/pnpm/npm/yarn>
  - Git Branch: <current branch>
  - Git Clean: <true/false>
  - Config Files: <list of relevant config files>
Context Files:
  - <path> — <reason for inclusion>
Constraints:
  - <limitation>
Verification Plan:
  - <command to run>
Omitted Context:
  - <reason> — <detail about what was excluded>
```

## Rules

- Always detect package manager from lockfiles: bun.lock, pnpm-lock.yaml, yarn.lock, package-lock.json
- Include AGENTS.md and project instructions if present
- Record omitted files instead of silently dropping context
- Include verification command candidates from project config
- In eval mode, include case contract and verifier command
