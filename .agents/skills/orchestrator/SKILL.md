---
name: orchestrator
description: Delegate bounded independent evidence tasks and reconcile results. Use for explicit parallel/subagent requests or when a selected workflow requires independent validation. Do not use merely because work is multi-step, spans files, or needs a handoff.
---

# Orchestrator

Use subagents for bounded reasoning, not simple file reads or shell commands.
Subagents have no parent-session context.

## Flow

1. Define the decision, shared facts, independent tasks, evidence budget, output
   format, and stop condition.
2. Delegate only tasks that can be completed independently. Include every needed
   path, constraint, and safety boundary in each prompt.
3. Keep mutation with the parent unless the user explicitly approved an isolated
   worker edit with exact file ownership.
4. Reconcile results against primary evidence. Surface conflicts, stale evidence,
   and unsupported claims; do not average conclusions.
5. Return one recommendation, validation status, risk, and next action.

## Limits

- Prefer parallel tool calls for independent I/O.
- Do not delegate secrets, credentials, remote mutations, or unbounded repo scans.
- Do not have multiple workers edit the same or adjacent files.
- Do not use a subagent to bypass approval, branch, evidence, or deployment rules.
- Stop when tasks are coupled tightly enough that delegation would duplicate
  context or create merge risk.

## Output

```text
Decision:
- Reconciled recommendation

Evidence:
- Agreed facts and conflicts

Validation:
- Independent checks and gaps

Next step:
- One concrete action
```
