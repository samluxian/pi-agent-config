---
name: context-window-retrospective
description: Review the current Pi context window with bounded workflow metrics and produce an optimization plan.
disable-model-invocation: true
---

# Context Window Retrospective

Analyze how the active context window completed its work. Separate outcomes from
workflow quality. Propose improvements; do not implement them without approval.

## Evidence Boundary

1. Treat the latest active-branch compaction as the context-window checkpoint.
   Use its summary only as inherited state. Analyze entries after that checkpoint.
2. If `PI_SESSION_FILE` exists, run `scripts/summarize_session_metrics.py`
   resolved against this skill directory. The script returns counts, bounded
   reviewer metadata, usage grouped by parent model/thinking and child
   agent/model, and tool-result text bytes. It does not return prompts, command
   output, message text, diffs, logs, or secret values.
3. Reconcile metrics with the visible conversation, final repository status, and
   reviewer conclusions. Label missing session data or ambiguous causality.
4. Do not inspect abandoned branches, raw secret-bearing output, full session
   text, or unrelated repositories merely to enrich the retrospective.

## Analysis

Classify each finding by its owner:

- `task outcome`: completed behavior, remaining blocker, or unvalidated claim
- `parent planning`: scope, approval, repository boundary, or prompt quality
- `reviewer`: unnecessary breadth, wrong stop behavior, or unsupported verdict
- `skill`: missing workflow, evidence budget, ownership, or no-op rule
- `extension`: enforcement, timeout, semantic verdict, mutation, or repo scoping

Compare required evidence with executed checks. Count repeated or timed-out work,
but do not call all elapsed time waste. Distinguish a necessary correction from
a preventable retry. Do not rank people or infer productivity from tool counts.

Interpret usage without double counting: `reasoning` is part of `output`;
`cacheRead`, uncached `input`, parent, and subagent usage remain separate. Tool-result UTF-8 bytes indicate context volume, not model
tokens or billed cost. Missing provider fields are gaps, not zero usage. Do not
attribute total tokens to thinking level without a comparable same-task baseline.

## Initiative Gaps

Use the visible conversation to identify work that required avoidable user prompting:

- the agent asked for an identifier available from safe context discovery
- the agent stopped while a permitted decisive read-only check remained
- the user had to request live, pipeline, state, or validation evidence already in scope
- the agent described a check instead of executing it with an available tool

Treat metric-only follow-up signals as review candidates, not proof. Do not count
approval, mutation handoff, missing authentication, secret boundaries, ambiguous
scope, or a failed decisive check as passivity. Name the exact owning rule, skill,
extension, or parent decision that caused a supported gap.

## Optimization Plan

Prioritize `P0` correctness/safety, `P1` latency/context cost, then `P2`
convenience. For each item name the triggering evidence, owning surface, exact
proposed behavior, deterministic test, expected benefit, and overfitting risk.
Prefer one coherent existing-surface update over duplicated rules or a new
extension. Wait for explicit approval before modifying skills or extensions.

## Output

```text
Summary:
- Work completed and remaining gaps

Metrics:
- Window boundary, model/thinking usage, cache, reasoning subset, child usage,
  tool-result volume, reviewer duration/tools/verdicts, follow-up signals, and gaps

Findings:
- Required checks, excessive checks, mistakes, initiative gaps, and root causes

Optimization plan:
- P0/P1/P2 change, owner, validation, benefit, and risk

Next step:
- One exact approval or investigation action
```
