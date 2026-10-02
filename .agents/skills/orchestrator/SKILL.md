---
name: orchestrator
description: Delegate bounded evidence tasks and reconcile results. Use by default for high-volume read-only discovery, explicit subagent requests, or workflow-required independent validation. Do not use for simple I/O, tightly coupled analysis, or handoffs.
---

# Session Orchestration

Use this skill as a companion to any selected domain skill. Default to bounded
delegation when read-only evidence acquisition is likely to fill the parent
context with replaceable raw output. Also use it for explicitly requested
delegation or required independent validation. The domain skill retains its
evidence and stop conditions. Use direct tools for simple known-path I/O.
Subagents have no parent-session context or delegated authority.

## Readiness

Before delegating, identify the decision, confirmed requirements, shared facts,
knowledge gaps, affected paths or systems, evidence budget, and stop condition.
Ask one short question when an unresolved ambiguity would materially change the
work; otherwise verify the gap with bounded evidence instead of guessing.

Route only self-contained tasks:

- `scout`: read-only local repository structure, callers, and patterns.
- `researcher`: current external documentation and source-backed claims.
- `environment-scout`: structured read-only inspection of named Kubernetes or
  GCP targets.
- `worker`: an approved isolated file edit with exact ownership and validation.

## Bounded Task Prompts

Use ASD-STE100-inspired Simplified Technical English without claiming full
compliance. Use short active sentences, one instruction per sentence, and
explicit nouns instead of ambiguous pronouns.

Use the lightweight [task contract](assets/task-contract.md): `GOAL`, `CONTEXT`,
`SCOPE`, `CONSTRAINTS`, `APPROACH`, `ACCEPTANCE`, and `RETURN`. Include the decision,
verified facts, exact targets, permitted operations, completion checks, and
expected evidence and gaps. For small tasks, combine relevant fields into a few
sentences. Headings are guidance, not a schema or dispatch gate; this is not a
separate spec or approval step.

Prefer confirmed paths and the smallest check that answers the question. Stop
acquisition when acceptance has sufficient evidence; do not scan an entire SDK
for a narrow compatibility question. After a missing-path error, use a confirmed
package location or one bounded discovery check instead of repeating guesses.
Finish independent permitted checks when one source is unavailable; report the
gap without widening scope. Request a concise synthesis, not arbitrary token or
line quotas. Parent verifies evidence and acceptance; the template alone cannot
guarantee quality.

## Flow

1. Delegate read-only acquisition by default when it requires multiple searches
   or reads, inspects several large sources, or would otherwise return raw output
   that dominates the parent context. Do not delegate merely because work is
   multi-step, spans files, or needs a handoff.
2. Define independent tasks and an exact output format. Include every required
   path, known fact, constraint, safety boundary, and validation expectation in
   each prompt.
3. Run up to four independent read-only tasks in parallel. Keep worker in single
   mode. Include every already-confirmed target identifier needed by the child.
   Parent retains planning, approval, and final judgment.
4. Do not re-scout facts already established. If a child reports that its
   structured interface cannot expose a required narrow field, use a direct,
   field-selected parent query for that field instead of delegating the same gap
   again.
5. Reconcile child results against primary evidence. Surface conflicts, stale
   evidence, and unsupported claims; do not average conclusions.
6. After repository edits, the parent or approved worker executes the smallest
   sufficient validation. Parent reconciles all findings.

## Limits

- Do not delegate secrets, credentials, remote mutations, or unbounded scans.
- Do not run worker in parallel with repository commands or edits.
- Do not use a subagent to bypass approval, branch, evidence, or deployment rules.
- Stop when tasks are too coupled for independent execution or delegation would
  duplicate context, require user back-and-forth, or create merge risk.

## Output

Return the reconciled decision, agreed evidence and conflicts, validation and
gaps, context/authority/implementation risk, and one concrete next action.
