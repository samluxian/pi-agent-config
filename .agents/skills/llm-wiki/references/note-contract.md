# Knowledge Note Contract

Use one note for one reusable mechanism, decision, incident pattern, or runbook.
Human readability and bounded agent retrieval have equal priority.

## Language And Editing

Write all human-readable metadata, index text, and note prose in English. Preserve
code, commands, identifiers, API names, source titles, and exact errors when
translation would reduce technical accuracy.

Before publishing, apply [`writing-style.md`](writing-style.md): make the smallest
No AI Slop edit that removes filler and canned patterns while preserving evidence,
uncertainty, mechanism, and voice. The checker enforces only a deterministic
subset; human review owns natural language and necessary technical distinctions.

## Frontmatter

Every note starts with this flat YAML subset:

```yaml
---
id: lower-kebab-id
title: Human-readable title
type: fundamental | incident | decision | runbook
status: draft | open | verified | superseded | archived
topic: lower-kebab-topic
summary: One factual sentence used by indexes.
when_to_read: Concrete symptom, task, or decision boundary.
keywords: [canonical-term, technology]
aliases: [common phrase, alternate spelling]
scope: public-source | synthetic-private-case | repository-public-case
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Rules:

- Keep `id` stable and never reuse it. Rename titles without changing IDs.
- Use lowercase keywords and aliases that a person would actually search.
- Put retrieval terms in metadata, not repeated keyword prose.
- Use `open` when an incident cause or fix remains unverified.
- Use `superseded` only with a visible replacement note.
- Keep notes below 48 KiB. Split a broad subject into atomic notes instead of
  raising the limit.

## Shared Body

All notes contain:

1. `# <title>`
2. `## TL;DR`
3. `## When To Read`
4. `## Knowledge`
5. `## Sources`
6. `## Related Notes`

Fundamentals explain behavior, boundaries, common mistakes, and a small example.
Decisions add context, alternatives, decision, consequences, and supersession.
Runbooks add prerequisites, bounded steps, stop conditions, and validation.

Incident notes also contain:

- `## Synthetic Source Packet` for `synthetic-private-case` scope;
- `## Investigation` with evidence, hypotheses, and falsifiers;
- `## Wrong Turns` and why each inference failed;
- `## Root Cause And Contributing Factors`;
- `## Resolution` with status and fix surface;
- `## Validation` with behavior evidence and remaining gaps.

A `verified` incident must name a supported root cause, applied resolution, and
behavior-level validation. An `open` incident keeps the missing decisive evidence
visible and must not invent a final fix.

## Sources

Use claim-local markers such as `[S1]`, then repeat the sources in a table:

```markdown
| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Official documentation](https://example.test/docs) | YYYY-MM-DD | Exact claim supported by the source |
```

Prefer official specifications, vendor documentation, standards, public incident
reports, and public repositories. For a public GitHub or GitLab file, use a full
commit-SHA permalink. Record the access date and the exact claim supported.

External sources support public technical facts. They do not support invented
synthetic timestamps, names, outputs, or outcomes. If a source changes, update
the note's `updated` date and state whether the conclusion changed.

## Index Contract

`knowledge/INDEX.md` routes broad topic keywords to one topic index. Each topic
index contains every note for that topic exactly once. Index rows expose only
metadata needed for retrieval: ID, type, status, keywords, aliases, summary, and
note path.

Do not place note bodies, raw logs, long quotations, or full source lists in an
index. Keep root index below 12 KiB and each topic index below 24 KiB.
