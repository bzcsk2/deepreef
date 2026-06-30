# Context Selection Policy

## Rules for Selecting Context Files

1. **Project config files**: Always include package.json, tsconfig.json, and detected config files.
2. **Project instructions**: Always include AGENTS.md, CODEBUDDY.md, and README.md.
3. **Relevant source files**: Include files that are directly related to the task goal.
4. **Lockfiles**: Include for package manager detection but not as full context.
5. **Omitted files**: Record the reason (budget/irrelevant/unsafe/missing) when files are excluded.

## Priority Order

1. Project instructions and config
2. Files mentioned in the task description
3. Files that import from or are imported by target files
4. Test files for target modules
5. Documentation files

## Budget Rules

- Max context files: 15 by default
- Max total characters: 100000 by default
- When budget exceeded, exclude lowest-priority files and record in omittedContext

## Exclusion Reasons

- `budget`: File would exceed context window
- `irrelevant`: File is not related to the task
- `unsafe`: File may contain secrets or sensitive information
- `missing`: Referenced file does not exist
