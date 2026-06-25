# DeepReef docs

Last consolidated: 2026-06-25.

This directory is the current documentation entry point for DeepReef maintainers and coding agents. Root-level README files remain the user-facing installation and project overview; `docs/` is for architecture, operations, development, roadmap, and change history.

## Reading order

1. [ARCHITECTURE.md](ARCHITECTURE.md) — product intent, runtime structure, package boundaries, workflow semantics, current implementation status, and invariants.
2. [OPERATIONS.md](OPERATIONS.md) — installation, CLI/TUI commands, configuration, model providers, logging, diagnostics, and safety notes.
3. [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, validation commands, testing strategy, release checks, and documentation rules.
4. [ROADMAP.md](ROADMAP.md) — active roadmap, completed recent milestones, non-goals, and next work.
5. [CHANGELOG.md](CHANGELOG.md) — user-visible and maintenance changes.

## What was consolidated

The previous docs set mixed current facts, historical DONE logs, old TODO plans, provider notes, logging notes, and configuration notes across many files. The useful material is now merged into the smaller set above:

| Previous content | New home |
| --- | --- |
| `PROJECT_DESIGN.zh.md`, `STATUS.md`, parts of `DONE.md` | `ARCHITECTURE.md` |
| `OPERATIONS.md`, `configuration.md`, `MODEL_PROVIDERS.md`, `LOGGING.md` | `OPERATIONS.md` |
| `DEVELOPMENT.md` | `DEVELOPMENT.md` |
| `TODO.md`, roadmap status notes | `ROADMAP.md` |
| Public change notes | `CHANGELOG.md` |

Historical day-by-day implementation logs and old remediation plans are no longer treated as authoritative docs. Keep implementation history in Git commits and PRs instead of reintroducing long `DONE` or archive files.

## Documentation rules

- Do not duplicate the same fact across multiple docs unless one doc clearly links to the authoritative source.
- Do not write planned behavior as completed behavior.
- When code behavior changes, update the narrowest relevant doc and then check whether `ARCHITECTURE.md` or `OPERATIONS.md` also needs a one-line adjustment.
- Keep commands, file paths, package names, model IDs, and environment variables exact.
- Prefer short tables and executable commands over narrative status logs.
- For coding-agent work, start from this file, then read `ARCHITECTURE.md`, `DEVELOPMENT.md`, and only the topic doc needed for the change.
