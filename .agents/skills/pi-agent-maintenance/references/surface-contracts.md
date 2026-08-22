# Surface Contracts

Read only the branch matching the requested change. The root `AGENTS.md` owns
workspace safety; this reference owns maintenance-specific design decisions.

## Skill Branch

Read `skill-design-contract.md` before creating, changing, splitting, merging,
or removing a skill. It is the single source of truth for invocation cost,
descriptions, information hierarchy, completion criteria, pruning, fixtures,
and removal gates.

## Pi Extension Branch

- Read the installed Pi extension documentation completely for every hook being
  changed and follow its linked API documentation before implementation.
- Use an extension only for behavior that must be deterministic across runs:
  mutation blocking, output bounds, context shaping, session metrics, or a
  narrowly defined loop guard.
- Preserve tool-call/result identity, error state, images, and details unless
  the documented hook contract explicitly permits replacing them. A context
  rewrite changes LLM input, not persisted session truth.
- Bound large text by both lines and UTF-8 bytes. Keep useful head/tail evidence;
  archive full output only to a permission-restricted OS temp path and make
  truncation visible.
- A loop guard must define pending, success, failure, edit, new-turn, and
  new-session behavior. Failed checks remain retryable; successful evidence is
  reused until a state-changing repo edit or new agent run invalidates it.
- Never block a compact filtered probe merely because its underlying command can
  be broad. Prefer `custom-columns`, `jsonpath`, `jq`, field selectors, `--tail`,
  and `--since` in user-facing recovery text.
- Add focused hook tests for the allow path, block/transform path, reset path,
  and failure path. Register every extension in package metadata and document
  workspace-local installation behavior.
- A subprocess subagent is bounded execution, not delegated authority. Keep
  planning, decisions, approvals, mutation authority, reconciliation, and final
  delivery judgment in the parent. A worker may execute only an explicitly
  approved isolated edit with exact file ownership. Reviewer may delegate
  multi-file repository reading to one bounded single or parallel scout request,
  but scout remains a leaf without subagent or command tools. Reviewer retains
  validation planning, command execution, evidence reconciliation, finding
  severity, and the semantic verdict. Reviewer has no write/edit tools. Keep the
  outer reviewer and worker out of parallel mode. After final edits, require one
  fresh final reviewer per changed repository. Only semantic `pass` clears that
  repository; partial, failed, timed-out, blocked, stale, or missing-verdict
  review remains a gap. Later edits invalidate only the matching repository.
  Allowlist profiles and tools, pin model and thinking, cap tasks and concurrency,
  expose role deadlines, propagate abort, bound reviewer conclusions, and test
  repository scope, partial/final, semantic verdict, stale review, timeout, and
  process failure without paid model calls. Test the reviewer-to-scout allowlist,
  bounded single/parallel delegation, leaf-scout boundary, and reviewer-owned
  verdict without paid model calls.

## AGENTS And README Branch

- `AGENTS.md` contains only rules needed on every turn: safety, approval,
  workspace ownership, routing, evidence budget, and shared response shape.
- Domain commands, symptom matrices, long examples, and release procedures live
  in skill references or deterministic scripts.
- Universal response rules stay in `AGENTS.md`: answer/action first, structured
  teaching and analysis, visible progress, no filler, and no loss of safety or
  precision. Do not recreate them as competing style skills.
- Update `README.md` in the same patch when inventory, triggers, installation,
  human workflow, settings policy, or maintenance rules change.

## Settings And Session Branch

Read `session-context-policy.md` before changing settings baselines, compaction,
thinking budgets, model guidance, metrics, or session lifecycle rules. Baseline
files are examples for deliberate user adoption; initialization must not
silently replace an existing project or personal setting.
