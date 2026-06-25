# Architecture

Last consolidated: 2026-06-25.

## Product intent

DeepReef is a terminal-native AI loop agent runtime for supervised local, free, and low-cost coding models. Its core product idea is not “one strong model does everything”; it is a controlled loop where stronger or more reliable models plan, review, recover, and judge, while cheaper or local models perform verifiable execution work.

The current mental model is:

```text
Supervisor plans / reviews / corrects
  -> Worker executes engineering work
  -> Worker reports result and evidence
  -> Supervisor decides continue / revise / complete / block / ask user
```

DeepReef is pre-1.0. Public APIs, config shape, package boundaries, and provider presets may still change.

## Repository shape

DeepReef is a TypeScript/Bun monorepo published as `@deepreef/cli`. The executable command is `deepreef`.

| Package | Path | Responsibility |
| --- | --- | --- |
| `@deepreef/core` | `packages/core/` | Engine, provider config, context, sessions, workflow, goal, mailbox, permissions, harness, model profiles, structured protocols. |
| `@deepreef/cli` | `packages/cli/` | CLI entry, TUI startup, pipe mode, tool registration, plugin/memory/MCP wiring, Supervisor/Worker wiring. |
| `@deepreef/tui` | `packages/tui/` | Ink/React UI, bridge, timeline, slash commands, model picker, workflow/goal UX, diagnostics, settings. |
| `@deepreef/tools` | `packages/tools/` | Default engineering tools: file, edit, shell, search, web, task, skill, workflow, notebook. |
| `@deepreef/mcp` | `packages/mcp/` | MCP host/client, resource listing, tool list, and proxied tool invocation. |
| `@deepreef/plugin` | `packages/plugin/` | Plugin runtime, content packs, hooks, rules, commands, skills, tools. |
| `@deepreef/memory` | `packages/memory/` | AgentMemory runtime, memory tools, hooks, MCP server/proxy, evaluation/retrieval. |
| `@deepreef/security` | `packages/security/` | Permission engine, hook manager, file snapshot protection. |
| `@deepreef/ink` | `packages/ink/` | Terminal rendering primitives and theme infrastructure. |
| `@deepreef/shell` | `packages/shell/` | Shell-state infrastructure. |

## Runtime map

```text
TUI / CLI / pipe mode
        |
        v
ReasonixEngine
        |
        v
AsyncGenerator<LoopEvent>
        |
        +-- ContextManager / ChatClient / SessionWriter
        +-- StreamingToolExecutor / Permission / Hooks
        +-- WorkflowCoordinator / DualAgentRuntime
        +-- Plugin / MCP / Memory
        |
        v
TUI bridge / transcript store / runtime status
```

The core engine emits an event stream. CLI and TUI consumers project that stream into text output, timeline entries, status bars, permission prompts, question prompts, and workflow state.

## Core engine boundaries

| Path | Role |
| --- | --- |
| `packages/core/src/engine.ts` | `ReasonixEngine`: submit, resume, config updates, tool registration. |
| `packages/core/src/loop.ts` | Main single-agent loop. |
| `packages/core/src/client.ts` | OpenAI-compatible SSE client. |
| `packages/core/src/config/` and `packages/core/src/config.ts` | Unified config manager plus provider/model presets. |
| `packages/core/src/context/` | Immutable prefix, append log, scratch, repair, summary, token estimation. |
| `packages/core/src/streaming-executor.ts` | Shared/exclusive streaming tool execution. |
| `packages/core/src/workflow-coordinator/` | Supervisor/Worker state machine and structured protocol. |
| `packages/core/src/goal/` | GoalStore, GoalRuntime, goal tools, steering prompt. |
| `packages/core/src/agent-comm/` | Mailbox, AgentCommController, mailbox tools. |
| `packages/core/src/dual-agent-runtime/` | Worker/Supervisor engine wrapper. |
| `packages/core/src/resolve-effective-tools.ts` | Role/mode/workflow-phase tool filtering. |

## CLI startup path

`packages/cli/src/index.ts` handles top-level command dispatch. `packages/cli/src/tui.ts` performs the interactive runtime wiring:

1. Load configuration.
2. Create `ReasonixEngine`.
3. Load MCP, plugin/content-pack, and memory systems in the background.
4. Register default tools, plugin tools, MCP proxy tools, and memory tools.
5. In TTY mode, create the Supervisor engine, `DualAgentRuntime`, `GoalStore`, `Mailbox`, and `WorkflowCoordinator`.
6. Register dynamic goal/mailbox governance tools so tool execution reads the current workflow/thread/controller instead of stale objects.
7. Render the `@deepreef/tui` app.

Non-TTY input uses pipe mode.

## TUI state path

The TUI entry points are:

- `packages/tui/src/App.tsx`
- `packages/tui/src/bridge.tsx`
- `packages/tui/src/store/bridge-runtime.ts`
- `packages/tui/src/store/transcript-store.ts`
- `packages/tui/src/store/transcript-reader.ts`
- `packages/tui/src/DeepiMessages.tsx`

The UI still contains some legacy bridge state while newer store/runtime components carry transcript, diagnostics, and bounded queue responsibilities. Long-session performance work should stay focused on transcript storage, reader cache behavior, bridge runtime queue limits, and timeline render windows. Do not mix UI trimming with core engine context truncation unless the task explicitly touches both.

## Workflow loop

`WorkflowCoordinator` drives the current Supervisor/Worker loop:

```text
idle
  -> supervisor_analyse
  -> worker_do
  -> worker_report
  -> supervisor_check
  -> supervisor_intervene
  -> waiting_user
  -> completed / blocked / failed
```

Current behavior:

- Supervisor in `supervisor_analyse` produces a plan.
- Worker in `worker_do` executes the plan.
- Worker in `worker_report` reports result and evidence.
- Supervisor in `supervisor_check` reviews the evidence and decides the next state.
- `parseSupervisorDecision()` prefers Zod-validated structured JSON.
- Legacy string fallback is still available but should be treated as lower confidence.
- `approve` only completes when completion audit has evidence.
- `blocked` requires repeated blocker evidence rather than a single unsupported claim.
- Mailbox workflow exists behind the `useMailboxWorkflow` branch, but the default path still passes plan/report through coordinator state.

## Goal and mailbox

`GoalStore` persists the active loop goal under the session tree:

```text
.deepreef/sessions/<sessionId>/goal.json
```

Goal state values:

```text
active | paused | blocked | usage_limited | budget_limited | complete
```

Model-side `update_goal` is intentionally narrow: it can mark `complete` or `blocked`; pause, resume, budget limit, and clear operations are user/system controls. This prevents the model from silently rewriting user governance state.

Mailbox support uses JSONL-style queue semantics and exposes `send_message`, `followup_task`, and `read_mailbox`. It is useful for future multi-step agent communication, but it is not the default workflow transport yet.

## Tool and permission boundaries

`resolveEffectiveTools()` is the central tool-filtering boundary:

- Worker loop receives engineering tools according to agent config and hard policy.
- Supervisor loop receives phase-scoped tools; it should not freely self-explore or edit during review phases.
- Supervisor alone/subagent paths use smaller allowlists.
- Goal and mailbox tools are governance tools managed by the coordinator, not arbitrary Worker tools.
- Writes still pass through permission and hook systems.
- Tool policy `deny` rules in config are hard rejects and cannot be overridden by TUI permission prompts.

## Provider and model layer

Provider presets live in `packages/core/src/config.ts`; unified config loading lives under `packages/core/src/config/`. Current provider families include `zen`, `deepseek`, `mimo`, `kilo`, `openai-compatible`, `nvidia`, `qwen`, `kimi`, `zai`, `stepfun`, and `openai`.

The exact model matrix and recommended role assignments are maintained in [OPERATIONS.md](OPERATIONS.md#model-providers).

## Extension systems

- Plugin/content-pack: `packages/plugin/`
- MCP: `packages/mcp/`
- Skills: `packages/tools/src/skills/` plus plugin skill directories
- AgentMemory: `packages/memory/`

These systems should fail soft during startup. A failed extension should not prevent the base CLI/TUI agent from running unless the user explicitly requested that extension as required.

## Current implementation status

Implemented foundations:

- CLI, TUI, core runtime, tools, security, plugin, MCP, memory, workflow, goal, and mailbox foundations.
- Unified TOML configuration control plane with user/project config paths and config CLI commands.
- Supervisor/Worker structured decision parsing with audit gates.
- TUI i18n foundation for Chinese/English switching.
- Bounded long-session TUI storage/rendering work has a baseline implementation.

Still being hardened:

- Workflow reliability on real engineering tasks.
- Goal continuation and budget governance tied to real usage accounting.
- Provider capability profiles and local-model recommendations.
- Cross-platform package/install validation.
- Public API stability.

## Source-of-truth paths

| Topic | Source |
| --- | --- |
| CLI entry | `packages/cli/src/index.ts`, `packages/cli/src/tui.ts` |
| Engine | `packages/core/src/engine.ts`, `packages/core/src/loop.ts` |
| Config | `packages/core/src/config/`, `packages/cli/src/commands/config.ts` |
| Provider presets | `packages/core/src/config.ts` |
| Workflow | `packages/core/src/workflow-coordinator/` |
| Goal | `packages/core/src/goal/` |
| Mailbox | `packages/core/src/agent-comm/` |
| TUI app | `packages/tui/src/App.tsx` |
| TUI store | `packages/tui/src/store/` |
| Slash commands | `packages/tui/src/CommandRegistry.ts`, `packages/tui/src/commands.ts` |
| Tool filtering | `packages/core/src/resolve-effective-tools.ts` |
| Default tools | `packages/tools/src/` |

## Invariants for coding agents

- Do not collapse Supervisor and Worker into an undifferentiated agent unless the task is explicitly a product redesign.
- Do not let Supervisor acquire broad write/search tool access in every workflow phase.
- Do not treat model claims as completion without evidence when the workflow path expects audit.
- Do not move runtime state such as sessions, goals, mailbox entries, token usage, or workflow phase into static project docs.
- Do not make local extension failures fatal unless the user opted into that strict behavior.
- Do not add new public commands, config keys, or provider IDs without updating `OPERATIONS.md` and tests.
