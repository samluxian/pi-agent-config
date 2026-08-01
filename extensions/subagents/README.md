# Read-only Subagents

Provides two bounded evidence agents:

| Agent | Model | Thinking | Scope |
| --- | --- | --- | --- |
| `scout` | `openai-codex/gpt-5.6-luna` | `low` | Local repository discovery with `read`, `grep`, `find`, and `ls` |
| `researcher` | `openai-codex/gpt-5.6-terra` | `low` | External documentation research with `web_search` and `web_fetch` |

The parent retains planning, decisions, approval context, evidence
reconciliation, and implementation. Delegate only an independent evidence task
after its goal, paths or source boundary, constraints, and required output are
explicit. Subagents receive no parent-session context and cannot edit files or
mutate Git, infrastructure, cloud, or runtime systems. There is no editing
`worker` profile.

Use the tool only when the user explicitly requests subagent or parallel work,
or when a selected workflow requires independent validation. Prefer direct
parallel read/fetch/search tool calls for simple I/O and do not repeat evidence
already available to the parent.

## Bounds

- Single mode runs one `scout` or `researcher` task.
- Parallel mode accepts at most four independent tasks.
- Each child has a five-minute wall-clock deadline and is terminated on parent
  abort.
- The default maximum concurrency is four. An adjacent `config.json` may reduce
  it; values are clamped to the range 1–4:

```json
{ "maxConcurrency": 2 }
```

Every child runs with `--no-session`, `--no-skills`, and `--no-extensions`.
Only its profile model, thinking level, built-in tool allowlist, and required
workspace-local custom tool extensions are passed to the child process.
