---
name: orchestrator
description: Delegate bounded independent subtasks and reconcile evidence. Use when the user explicitly requests parallel or subagent work, or another selected skill requires independent validation.
---

# Orchestrator

Use direct narrow checks for known files and a bounded subagent only for
independent exploration, external research, or isolated read-only analysis.
Do not delegate work that needs user clarification or cross-agent coordination.
Do not invoke this skill only because a task is multi-step or needs a handoff.

## Flow

1. Establish the requested outcome, target repo, and mutation boundary.
   Complete when unknown requirements that change implementation are named.
2. Gather the minimum evidence needed. Use a scout for multi-file discovery and
   a researcher for external documentation only when the local evidence cannot
   answer the question. Include paths, scope, constraints, and required output
   in every subagent task.
   Complete when every conclusion has local or cited evidence.
3. Reconcile results before implementation. Resolve conflicts with targeted
   primary evidence; do not treat a subagent summary as deployment truth.
   Complete when affected files, behavior, validation, and risk are explicit.
4. Implement only after the workspace approval gate permits it. Keep edits
   narrow and verify the claimed behavior with the smallest relevant check.
   Complete when validation evidence or its exact gap is reported.

## Delegation Limits

- Use at most four independent subagents.
- Default to `scout` and `researcher`; do not use an editing worker.
- Subagents must not mutate Git, delivery, cloud, or runtime systems.
- Do not re-scout evidence already established in the active context.

## Output

```text
Conclusion:
Evidence:
Affected files:
Validation:
Risk:
Next step:
```
