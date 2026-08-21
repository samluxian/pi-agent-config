# Bounded Subagents

Provides three read-only evidence agents, one execution-capable reviewer, and one
approval-gated editing worker:

| Agent | Model | Thinking | Scope |
| --- | --- | --- | --- |
| `scout` | `openai-codex/gpt-5.6-luna` | `medium` | Local repository discovery with `read`, `grep`, `find`, and `ls` |
| `researcher` | `openai-codex/gpt-5.6-terra` | `medium` | Searches and reads external sources with project-local `pi-web-access` |
| `environment-scout` | `openai-codex/gpt-5.6-luna` | `medium` | Structured read-only Kubernetes and GCP inspection with `kubectl_inspect` and `gcloud_inspect` |
| `reviewer` | `openai-codex/gpt-5.6-terra` | `medium` | Runs bounded diff, render, plan, test, and validation commands with `read`, `grep`, `find`, `ls`, and child-only `safe_bash` |
| `worker` | `openai-codex/gpt-5.6-terra` | `medium` | Approved isolated edits with `read`, `write`, `edit`, child-only `safe_bash`, `web_search`, `fetch_content`, and read-only or review delegation |

The parent retains planning, decisions, approval context, evidence
reconciliation, and final delivery judgment. Scout, researcher, and
environment-scout remain read-only. Reviewer can execute commands but cannot use
`write` or `edit`. Use worker only after the user explicitly approves an
isolated edit and the task names its repository, exact owned files, constraints,
existing-change boundaries, and validation expectations.

After any final repository edit, the editing agent must start one fresh final
reviewer per changed Git repository. Reviewer executes the smallest sufficient
diff, render, plan, test, and validation matrix in its own context and returns
bounded findings. If parent edits directly, parent starts reviewer. If worker
edits, worker starts reviewer before returning. A successful worker review that
covers its final edit is not repeated by parent.

The extension keys pending generations by repository root. A semantic `pass`
clears only the matching repository; process exit 0 alone is insufficient.
`partial` review mode records sharded evidence without clearing the gate.
`blocked`, `fail`, missing-verdict, timed-out, stale, and failed reviews remain
pending. A later edit invalidates only that repository's review. Before final
response, the extension lists every pending repository and queues one bounded
follow-up per pending-state signature. A new session resets in-memory gate state.

Use subagents by default when read-only evidence acquisition needs multiple
searches or reads, covers several large sources, or would fill the parent context
with replaceable raw output. Prefer direct read/fetch calls for simple known-path
I/O. Subagents receive no parent-session context, so every task must carry all
required facts and safety boundaries and return a bounded summary.

## Bounds

- Single mode runs `scout`, `researcher`, `environment-scout`, `reviewer`, or
  `worker`.
- Reviewer and worker are single-mode only. Reviewer commands and worker edits
  must not race parallel tasks in the same repository.
- Parallel mode accepts at most four independent read-only tasks.
- Scout, researcher, environment-scout, and reviewer have a five-minute
  wall-clock deadline. Reviewer receives that deadline in its task, finishes
  commands within four minutes, reserves one minute for findings, and runs at
  most three independent heavy validation units. Worker has ten minutes so its
  nested reviewer can finish. Parent abort terminates child processes.
- Reviewer conclusions are capped at 160 lines and 16 KiB before they return to
  the caller. Raw command output remains in reviewer context or tool-created OS
  temporary output and must not be copied into the final conclusion.
- The default maximum concurrency is four. An adjacent `config.json` may reduce
  it; values are clamped to 1–4:

```json
{ "maxConcurrency": 2 }
```

Every child runs with `--no-session`, `--no-skills`, and `--no-extensions`.
Only its profile model, thinking level, exact tool allowlist, and required
project-local custom tool extensions are passed to the child process.
`web_search` and `fetch_content` come from pinned project package
`pi-web-access@0.23.0`. Environment inspection uses fixed direct-argv templates,
requires explicit target identifiers, supports current Cloud Asset Inventory and
retained Admin Activity evidence, blocks secret/config contents and mutation
operations, and bounds output to 120 lines and 24 KiB. `safe_bash` is loaded only
for reviewer and worker and is a dangerous-pattern blocklist, not a sandbox.
Repository approval, branch, secret, remote, and deployment rules still apply.
Reviewer may run Terraform, Kubernetes, or Argo CD inspection only when its task
contains every exact target and approved evidence boundary; it never applies,
syncs, patches, installs, upgrades, commits, or pushes. Use `reviewMode: partial`
for a bounded evidence shard and `reviewMode: final` for the semantic pass that
may clear the exact repository gate. Terraform no-op accepts either `No changes.`
or an explicit zero-action summary.
