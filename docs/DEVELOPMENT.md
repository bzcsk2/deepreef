# Development

Last consolidated: 2026-06-25.

This document is the maintenance guide for humans and coding agents working on DeepReef.

## Environment

Required baseline:

- Bun 1.3+
- Node.js 18+
- TypeScript 5.x

Install dependencies:

```bash
bun install
```

Run from source:

```bash
bun run dev
```

Build the npm CLI output:

```bash
bun run build
```

The build emits `dist/index.js` with a Node shebang. The package binary is `deepreef`.

## Root scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Start the CLI from TypeScript source. |
| `bun run build` | Bundle `packages/cli/src/index.ts` to `dist/index.js`. |
| `bun run smoke:cli` | Run `node ./dist/index.js --help`. |
| `bun run test` | Run core/tools/tui/cli/security tests. |
| `bun run test:all` | Run the main test suite plus memory package tests. |
| `bun run test:memory` | Run memory package tests. |
| `bun run typecheck` | Run TypeScript across the repo. |
| `bun run pack:dry-run` | Preview npm package contents. |
| `bun run benchmark:fusion` | Run benchmark matrix script. |

Scoped tests:

```bash
bun test packages/core
bun test packages/tui
bun test packages/tools
bun test packages/memory
bun test packages/cli
```

## Default validation

Before preparing a PR, run the smallest reliable validation set for the touched area. For broad changes, run:

```bash
bun run typecheck
bun test
bun run build
bun run smoke:cli
npm pack --dry-run
```

For memory changes:

```bash
bun run test:memory
```

For package/export/CLI-entry changes, inspect `package.json` fields:

- `bin`
- `files`
- `exports`, if added
- build output under `dist/`

## Testing strategy

Current test coverage includes:

- core engine, context, repair, tool execution, session, provider, workflow;
- goal runtime/tools, mailbox, structured protocol, `resolve-effective-tools`;
- TUI bridge, transcript store, workflow menu, commands, message rendering, i18n;
- default tools, MCP, memory, plugin/content-pack;
- CLI config commands and package smoke checks.

Test counts change frequently. Do not encode exact pass counts in docs unless the doc is a release note or PR summary.

## Change rules by area

| Area changed | Expected follow-up |
| --- | --- |
| Core runtime behavior | Add or update core tests. |
| Workflow / goal / mailbox | Cover coordinator path, structured parser, command path, and failure states where applicable. |
| TUI state or rendering | Add/update TUI store, bridge, command, or component tests. |
| Provider/config | Update config/provider tests and `docs/OPERATIONS.md`. |
| CLI command or slash command | Update command tests and user-facing docs. |
| Public config key, tool name, provider ID | Update docs and tests in the same PR. |
| Security/permission behavior | Include negative tests; never rely only on happy-path tests. |

## Coding-agent workflow

A coding agent should use this order:

1. Read `docs/README.md`.
2. Read `docs/ARCHITECTURE.md` for the affected subsystem.
3. Read the source-of-truth code path listed in `ARCHITECTURE.md`.
4. Make the smallest scoped change.
5. Run the narrowest relevant checks.
6. State what was validated and what was not.

Hard rules:

- Do not edit root documentation when the task says docs-only under `docs/`.
- Do not create a second implementation of an existing abstraction before checking current package boundaries.
- Do not widen Supervisor tools across all workflow phases to fix a local failure.
- Do not move runtime state into config.
- Do not weaken permission checks to make tests pass.
- Do not silently regenerate lockfiles unless dependency changes require it.

## Documentation maintenance

The docs set is intentionally small:

- `README.md` — docs index and maintenance rules.
- `ARCHITECTURE.md` — design, runtime map, status, invariants.
- `OPERATIONS.md` — installation, commands, config, providers, logging, safety.
- `DEVELOPMENT.md` — local development, tests, validation, coding-agent rules.
- `ROADMAP.md` — active work and non-goals.
- `CHANGELOG.md` — public change history.

Do not reintroduce long daily `DONE` logs, historical TODO dumps, or archive directories unless there is a specific release-management reason. Git history and PR descriptions are the correct place for detailed historical implementation logs.

## PR checklist

Before opening a PR:

- Scope only the intended files.
- Ensure docs do not contain broken links to deleted files.
- Verify commands and paths against current code.
- Run relevant checks or clearly state why checks were not run.
- Summarize user/developer impact, not just the file list.

For docs-only PRs, typecheck/tests are optional unless docs include generated snippets or examples that must be verified against code. At minimum, review links, command names, and deleted-file references.
