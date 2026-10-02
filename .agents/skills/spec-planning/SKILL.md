---
name: spec-planning
description: 使用固定模板撰寫實作規格。僅在使用者明確要求寫 spec、規格書或用 spec 規劃時使用；不適用一般修改、診斷、review 或未指定 spec 的規劃。
---

# Spec Planning

Plan only when the user explicitly requests a spec. An ordinary modification
request follows the root authorization contract without this workflow.

## Flow

1. Confirm the requested goal, target repository, and planning boundary. Inspect
   the relevant files, closest callers, defaults, tests, and defining contracts.
   Use the matching domain skill for evidence and safety requirements.
2. Read `assets/spec-template.md` and fill every section. Keep unknowns explicit;
   do not invent resource IDs, versions, ownership, or acceptance evidence.
3. Resolve questions that change scope, behavior, or acceptance. Keep unresolved
   blockers visible; a draft with blockers is not implementation-ready.
4. Present the spec in the conversation. Save it only when the user requests a
   file, using workspace `docs/` by default; write into a target only when its
   repository and path are named. Public repositories must not receive private
   target evidence. A requested spec file is documentation, not authorization to
   implement the described product or infrastructure changes.
5. Stop after planning unless the user also explicitly requests implementation.
   Before implementation, recheck the target and follow root/domain safety and
   validation. If agreed scope, behavior, or acceptance changes, obtain a decision
   before proceeding; do not restart spec approval for in-scope details.

## Output

Use the fixed template, proportionate to the task. State whether the spec is a
blocked draft, ready for an implementation decision, or authorized for
implementation. Do not claim validation that has not run. A spec never overrides
repository ownership, branch restrictions, secrets boundaries, or remote
inspection-only rules.
