# Session And Context Policy

## Session Scope

Keep one primary objective and target-repo set per session. Continue the session
while new evidence advances that objective. Start a new session when the user
switches to an unrelated objective, repo, or evidence path; carry forward a
short handoff note instead of raw tool output.

For an intentional Pi session switch, prepare and review a short handoff prompt
or `docs/session-notes/` entry, then start the replacement session manually. The
handoff must preserve scope, approval boundaries, verified evidence, changed
files, decisions, validation gaps, risks, and exactly one next action. A new
session does not implicitly receive the old conversation. Revalidate branch,
dirty state, remote freshness, deployment state, and runtime state after the
switch.

Compact when old tool results dominate the context or token use approaches the
working threshold (about 90k tokens for the current workspace policy). Do not
wait for the provider limit. Preserve decisions, changed files, validation,
risks, and the next action; discard replaceable exploration.

## Thinking Tiers

| Tier | Use |
| --- | --- |
| `low` default | Narrow inspection, known runbook, small approved edit, routine validation |
| `medium` | Cross-repo mapping, conflicting evidence, unfamiliar chart/API behavior, non-trivial incident analysis |
| `high` | Rare high-risk or highly ambiguous design where alternatives and blast radius cannot be bounded at `medium` |

Escalate because the task requires deeper reasoning, not because output is long.
Return to `low` after the uncertain decision is resolved. Keep concrete token
budgets in the optional settings baseline, not duplicated across skills.

## Model Use

Choose the model and thinking level at session scope according to the task.
Skills define process and evidence requirements; they do not switch models.
Use `low` for routine work, raise it only for the reasoning conditions above,
and never treat a tool, test, provider, authentication, or validation failure
as a reason to auto-escalate thinking.

Subagents are bounded delegation, not automatic execution for every skill. Use
them by default when read-only acquisition requires multiple searches or reads,
inspects several large sources, or would otherwise fill the parent context with
replaceable raw output. Keep simple known-path I/O and tightly coupled analysis
in the parent. The parent retains planning, decisions, approval context, mutation
authority, evidence reconciliation, and final validation. Read-only agents
collect bounded evidence. A worker may execute only an explicitly approved
isolated edit with exact file ownership and must remain single-mode. Every child
uses its configured model and thinking, receives no parent context implicitly,
and must be given the paths, constraints, and required output needed for its
task. Cap one read-only parallel request at four tasks and enforce a wall-clock
deadline per child.

## Context And Metrics

- Tool-output limits must be explicit, visible, and recoverable through a narrow
  rerun or protected temp archive.
- Historical compaction must preserve tool-call/result pairing and persisted
  session truth.
- Metrics belong in non-context session entries. Track at least turn latency,
  tool-call/result count, context use, and response usage when available.
- Compare changes with repeatable prompt cases and the same model/settings.
  Structural fixture validation proves coverage shape, not invocation quality.

## Baseline Adoption

`config/pi-settings-baseline.json` is opt-in. Validate it against the installed
Pi version, merge only desired keys into project-local settings, and never copy
it over an existing settings file automatically.
