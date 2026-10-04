---
name: code-intelligence
description: >
  Parser-backed full-repository mapping for JavaScript, TypeScript and Java.
  Use before explaining existing source, tracing dependencies, debugging,
  reviewing, refactoring or editing code. Requires current code-intelligence
  evidence; distinguish facts, inference and unknowns.
---

# Code Intelligence

## Scope and truth

Use mature compiler APIs, not filename guesses or regex-based substitutes.
Read [the evidence contract](references/evidence.md) before interpreting results.
This workflow does not authorize repository edits, dependency installation, builds,
cloud access or any action prohibited by the workspace contract.

## Analyze

1. Confirm the authorized Git repository root. Do not index sibling repositories
   or a workspace parent implicitly. Repository-wide indexing must be in scope.
2. Run `code_index` for that root before the first source analysis. For later
   analysis, check `code_index_status`; re-index stale content. Re-index after
   dependency changes, and reload Pi after parser/runtime updates.
3. Review language adapters, coverage, diagnostics, excluded/unsupported scope
   and unresolved relationships. A parsed file is not a passing typecheck.
4. Query `code_query(kind="files")` for the repository map as needed, then
   `code_context`, `code_query` and bounded `code_impact` for the question. Follow
   pagination when making exhaustive claims. Do not dump the whole graph into
   model context.
5. Read relevant implementations, callers, configuration and tests. The map is
   navigation and structural evidence, not a replacement for reading behavior.
6. Cite file/line and snapshot-bound evidence IDs for structural claims. Separate
   FACT, INFERENCE and UNKNOWN. Never infer callers, imports, tests, routes or
   business effects from names.
7. If indexing is unavailable or incomplete, report the precise gap. Do not
   silently substitute text search for a parser-backed map. Ask before proceeding
   with a reduced, explicitly limited analysis when the missing evidence matters.

## Edit

1. Recheck branch, working tree and user authorization under `AGENTS.md`.
2. Retrieve target context, references, dependencies and dependents. Use impact
   depth 2 initially; expand only when relevant. Inspect tests directly; automatic
   test association is currently UNKNOWN.
3. Retain the current snapshot ID before editing. Avoid unnecessary re-indexing
   that evicts the baseline; only two snapshots per repository are retained.
4. Apply ordinary authorized edits; this extension does not restrict write tools.
5. Run `code_validate_change(before=<snapshot ID>)`. It re-indexes the full source
   scope and compares files, symbols, concrete edges, newly unresolved relationships, diagnostics
   and parsing regressions. File movement, exports and aliases therefore refresh
   consumers too. This first version deliberately does not cache partial graphs.
6. Explain added/removed edges against the intended change. A removed edge is not
   automatically a bug; unchanged edge counts do not prove correctness.
7. Run the repository's appropriate typecheck/compile/tests only when permitted.
   Do not claim completion with unexplained structural regressions or skipped
   required checks. Never automatically rollback user files.

## Delegation

A scout has the same read-only intelligence tools, but its in-memory index is
independent of the parent. Supply exact root/scope, current evidence and requested
query. Do not make a bounded child silently widen its scope for full indexing.
Keep approval, edits and delivery judgment in the parent.
