# Roadmap

Last consolidated: 2026-06-25.

DeepReef is pre-1.0. This roadmap describes the current maintenance direction, not a compatibility guarantee.

## Current direction

DeepReef should become a reliable terminal-native coding loop for local, free, and low-cost models, with strong governance around evidence, permissions, configuration, and failure recovery.

The near-term priority is not adding more surface area. It is making the existing Supervisor/Worker loop predictable on real engineering tasks.

## Recently completed or baseline-ready

These areas have a usable foundation and should now be hardened instead of reimplemented:

- Monorepo, CLI, TUI, package metadata, and npm package output as `@deepreef/cli`.
- `ReasonixEngine`, OpenAI-compatible SSE client, context/session infrastructure, and streaming tool execution.
- Default engineering tools plus permission, hook, stale-read, dangerous-command, and file-snapshot protections.
- Supervisor/Worker `DualAgentRuntime`, `WorkflowCoordinator`, structured decision parsing, and audit gates.
- `GoalStore`, `GoalRuntime` foundation, `/goal` command paths, and goal governance tools.
- Mailbox and agent-communication foundation.
- Plugin/content-pack, MCP, AgentMemory, and skills loading foundation.
- TUI Chinese/English i18n foundation.
- Unified TOML config system and `deepreef config path|print|validate|init|edit|doctor`.
- Baseline long-session TUI bounding work: transcript limits, runtime queue limits, render window, and diagnostic stats.

## v0.1.x — public CLI hardening

Goal: make the repository and npm package easy to evaluate, install, and contribute to.

Status: mostly complete; keep it stable while other work proceeds.

Remaining work:

- Keep Chinese and English root README instructions consistent.
- Keep package contents aligned with `package.json` `files`.
- Keep CI/package dry-runs green.
- Avoid adding new public commands without docs and tests.

## v0.2.x — workflow reliability

Goal: make Supervisor/Worker mode predictable enough for routine engineering tasks.

Priority work:

- Add workflow end-to-end fixtures for small real repositories.
- Strengthen Worker report format and evidence bundles.
- Harden `runSupervisorAnalyse()` structured plan validation and fallback behavior.
- Decide whether `useMailboxWorkflow` becomes an explicit mode or stays out of the default path.
- Add workflow resume, interrupted, `waiting_user`, blocked, and failure-recovery tests.
- Clarify termination semantics across `maxRounds`, goal status, budget limits, and repeated blockers.
- Produce a small reliability report from reproducible tasks instead of anecdotal demos.

## v0.3.x — goal continuation and budget governance

Goal: make “loop = goal-driven work” complete without enabling uncontrolled automation.

Priority work:

- Fully wire `GoalRuntime` continuation gates into real usage and workflow state.
- Connect usage/token/time accounting to actual engine usage.
- Ensure `budget_limited` allows only safe wrap-up/reporting, not new substantive work.
- Preserve repeated-blocker audit behavior.
- Provide explicit user paths for resuming `blocked`, `paused`, `usage_limited`, and `budget_limited` goals.
- Document safe autonomous operation patterns after the behavior is verified.

## v0.4.x — weak and local model optimization

Goal: make low-cost and local models materially more useful.

Priority work:

- Improve provider and model capability profiles.
- Add common local OpenAI-compatible deployment examples.
- Tune harness strictness and role recommendations for weak models.
- Build a benchmark matrix for Worker reliability across model families.
- Publish reproducible reliability reports.

## v0.5.x — extension ecosystem

Goal: make DeepReef easier to extend without modifying core runtime code.

Priority work:

- Document plugin/content-pack authoring.
- Add MCP integration examples.
- Add memory configuration examples.
- Add skill packaging guidance.
- Add example projects and sample workflows.

## v0.6.x — UX and operational polish

Goal: improve day-to-day usability.

Priority work:

- Improve Windows terminal behavior.
- Polish model picker and provider configuration flows.
- Improve workflow visualization and human-escalation UX.
- Improve session restore and interrupted-work recovery.
- Improve error messages and remediation hints.
- Validate package install and smoke behavior across operating systems.

## Non-goals for now

- Replacing all strong-model usage.
- Claiming complete isolation for arbitrary local commands.
- Locking a stable public API before 1.0.
- Supporting every provider as a first-party integration.
- Optimizing for hosted multi-tenant operation before local development workflows are reliable.
- Building an IDE/Web shell before the terminal loop is dependable.
- Reintroducing long historical TODO/DONE documents as current documentation.
