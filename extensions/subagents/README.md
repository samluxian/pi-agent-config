# Bounded Subagents

Provides three read-only evidence agents and one approval-gated editing worker:

| Agent | Model | Thinking | Scope |
| --- | --- | --- | --- |
| `scout` | `openai-codex/gpt-5.6-luna` | `medium` | Local repository discovery with `read`, `grep`, `find`, and `ls` |
| `researcher` | `openai-codex/gpt-5.6-terra` | `medium` | Searches and reads external sources with project-local `pi-web-access` |
| `environment-scout` | `openai-codex/gpt-5.6-luna` | `medium` | Structured read-only Kubernetes and GCP inspection with `kubectl_inspect` and `gcloud_inspect` |
| `worker` | `openai-codex/gpt-5.6-terra` | `medium` | Approved isolated edits with `read`, `write`, `edit`, child-only `safe_bash`, `web_search`, `fetch_content`, and read-only delegation |

The parent retains planning, decisions, approval context, and evidence
reconciliation. Scout, researcher, and environment-scout remain read-only. Use
worker only after the user explicitly approves an isolated edit and the task names its repository,
exact owned files, constraints, existing-change boundaries, and validation.
Worker may delegate only to scout, researcher, and environment-scout.

Use subagents by default when read-only evidence acquisition needs multiple
searches or reads, covers several large sources, or would fill the parent context
with replaceable raw output. Prefer direct read/fetch calls for simple known-path
I/O. Subagents receive no parent-session context, so every task must carry all
required facts and safety boundaries and return a bounded summary.

## Bounds

- Single mode runs `scout`, `researcher`, `environment-scout`, or `worker`.
- Worker is single-mode only to prevent concurrent file-edit collisions.
- Parallel mode accepts at most four independent read-only tasks.
- Each child has a five-minute wall-clock deadline and is terminated on parent abort.
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
for worker and is a dangerous-pattern blocklist, not a sandbox. Repository
approval, branch, secret, remote, and deployment rules still apply.
