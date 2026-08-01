# DevOps Pi Agent Context And Maintenance Contract

Date: 2026-08-01
Status: implementation complete; review remains

## Result

- Narrowed every active model-invoked skill description with positive and
  negative boundaries.
- Absorbed the useful `caveman` and `stop-slop` response rules into `AGENTS.md`,
  added structured teaching/analysis principles inspired by `i-have-adhd`, and
  removed both communication skills.
- Added `lean-context` tool-output bounds, historical context compaction, temp
  archives, and non-context turn metrics.
- Extended `bash-guard` with an unbounded Kubernetes dump check and a repeated
  successful-command loop guard.
- Added the optional `config/pi-settings-baseline.json` and documented session,
  thinking, and model guidance without applying personal settings.
- Added `devops-pi-agent-maintenance` as the narrow maintenance contract for
  future skill, extension, AGENTS/README, settings, and regression changes; its
  `skill-design-contract.md` now owns the former generic skill-writing rules.
- Evaluated and then removed `skill-model-router`. Automatic skill detection
  depended on tool-call wrapping details and made normal use less predictable;
  model and thinking selection remain session-level choices.
- Hardened `subagents` as bounded read-only evidence execution: the parent owns
  planning and decisions, profiles pin model/thinking/tools, parallel and time
  limits are enforced, and there is no editing worker.

## Deterministic Evidence

- `npm run test:contract` passed: 12 active/model-invoked skills, 5
  extensions, and 3 extension test files.
- `npm run test:extensions` passed all 14 bash-guard, lean-context, and
  subagent tests without provider calls.
- `git diff --check`, JSON parsing, and `bash -n scripts/init-workspace.sh`
  passed.
- Actual invocation benchmark passed 26/26 cases with
  `openai-codex/gpt-5.6-sol` at `low`: 13 invoke and 13 skip cases, 557,948
  reported tokens, US$1.688814, 249.412 seconds, and no provider/tool errors.
  Raw JSONL and summary are git-ignored under
  `tmp/invocation-benchmark-20260801T145458Z/`.
- The same 26 cases passed with `openai-codex/gpt-5.6-luna` at `low`: 559,543
  reported tokens, US$0.0614624, 240.315 seconds, and no provider/tool errors.
  This was 96.36% cheaper and 3.65% faster than Sol. One skip case selected
  `gitops-diagnostics-workflow` instead of Sol's `runtime-dependency-ops` for a
  live Pod readiness failure; both correctly skipped the target
  `service-delivery-topology`, and Luna's diagnostic route fits the prompt.
  Artifacts are under `tmp/invocation-benchmark-20260801T150512Z/`.
- Router integration trials proved direct skill commands could switch models,
  but automatic invocation remained coupled to how the harness represented
  skill-file reads. The extension was removed rather than widening that brittle
  detection surface. Historical artifacts remain git-ignored under `tmp/`.

## Subagent Hardening

- `scout` uses Luna/low for local repository evidence and `researcher` uses
  Terra/low for external documentation. Both run with exact read-only tools,
  `--no-skills`, `--no-extensions`, and no implicit parent context.
- The parent retains planning, decisions, approval context, evidence
  reconciliation, and implementation. Unknown profiles, including `worker`,
  fail before spawning.
- Parallel mode accepts at most four tasks, concurrency is clamped to 1–4, and
  each child has a five-minute deadline with parent-abort propagation and
  SIGTERM-to-SIGKILL escalation.

## Remaining Review

- Changes are uncommitted. Do not stage, commit, or push from the agent.

## Next Action

Review the working diff, refresh the installed `subagents` copy, and then
reload Pi. The stale workspace-local router is already absent.
