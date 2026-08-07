---
name: orchestrator
description: Delegate bounded independent reasoning tasks and reconcile their evidence. Invoke manually when independent validation or explicit parallel analysis is required; do not use merely because work is multi-step or spans files.
disable-model-invocation: true
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
