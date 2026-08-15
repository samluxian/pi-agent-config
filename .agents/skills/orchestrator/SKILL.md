---
name: orchestrator
description: Delegate bounded independent evidence tasks and reconcile results. Use for explicit parallel/subagent requests or when a selected workflow requires independent validation. Do not use merely because work is multi-step, spans files, or needs a handoff.
---

# Session Orchestration

Use this skill as a companion to any selected domain skill, but only for
explicitly requested delegation or required independent validation. The domain
skill retains its evidence and stop conditions. Use direct parallel tools for
simple I/O. Subagents have no parent-session context or delegated authority.

## Readiness

Before delegating, identify the decision, confirmed requirements, shared facts,
knowledge gaps, affected paths or systems, evidence budget, and stop condition.
Ask one short question when an unresolved ambiguity would materially change the
work; otherwise verify the gap with bounded evidence instead of guessing.

Route only self-contained tasks:

- `scout`: read-only local repository structure, callers, and patterns.
- `researcher`: current external documentation and source-backed claims.
- `environment-scout`: structured read-only inspection of explicitly named
  Kubernetes or GCP targets.
- `worker`: an explicitly approved isolated file edit with exact ownership and
  validation instructions.

## Bounded Task Prompts

Use ASD-STE100-inspired Simplified Technical English without claiming full
compliance. Use short active sentences, one instruction per sentence, and
explicit nouns instead of ambiguous pronouns.

Structure each child prompt as `GOAL`, `INPUT`, `DO`, `DO NOT`, `STOP`, and
`RETURN`. State exact paths, allowed operations, evidence and output limits, and
blocker behavior. Tell the child to stop and report instead of widening scope.

## Flow

1. Decide whether delegation adds independent evidence. Do not delegate merely
   because work is multi-step, spans files, or needs a handoff.
2. Define independent tasks and an exact output format. Include every required
   path, known fact, constraint, safety boundary, and validation expectation in
   each prompt.
3. Run up to four independent read-only tasks in parallel. Keep workers in single
   mode and all planning, approval context, decisions, and final validation in
   the parent.
4. Do not re-scout facts already established. Use direct reads only for narrow
   verification needed to reconcile or edit.
5. Reconcile child results against primary evidence. Surface conflicts, stale
   evidence, and unsupported claims; do not average conclusions.
6. Validate the recommendation or implementation with the smallest behavior
   check that proves it before claiming completion.

## Limits

- Do not delegate secrets, credentials, remote mutations, or unbounded scans.
- Do not have multiple workers edit the same or adjacent files.
- Do not use a subagent to bypass approval, branch, evidence, or deployment rules.
- Stop when tasks are too coupled for independent execution or delegation would
  duplicate context, require user back-and-forth, or create merge risk.

## Output

```text
Decision:
- Reconciled recommendation

Evidence:
- Agreed facts and conflicts

Validation:
- Independent checks, behavior evidence, and gaps

Risk:
- Context, authority, or implementation risk

Next step:
- One concrete action
```
