---
name: llm-wiki
description: Retrieve or maintain the repository Markdown knowledge wiki.
disable-model-invocation: true
---

# LLM Wiki

Maintain reusable technical knowledge without loading the whole wiki into
context. Retrieval is read-only. Note creation or updates follow the repository
approval boundary.

## Retrieve

1. Reduce the current question to concrete symptoms, technologies, operations,
   and likely aliases. Do not include credentials or private identifiers.
2. Run:

   ```text
   scripts/wiki.py find --query <terms> --limit 5
   ```

3. Read only the best matching topic index when its routing context is needed.
4. Read at most three candidate notes. Prefer `verified` over `open` when scope
   and artifact/config assumptions match.
5. Treat a note as precedent, not current-state proof. Revalidate target identity,
   version, configuration, runtime state, and time window.
6. If no note matches, continue the selected domain workflow or external
   research. Do not scan all notes to force a match.

## Record Or Update

1. Read `references/note-contract.md` and `references/writing-style.md`. For
   knowledge derived from a private system, also read
   `references/private-to-synthetic.md`.
2. Choose one atomic note and one topic. Update an existing note when it has the
   same mechanism and scope; do not create near-duplicates.
3. Propose the note path, evidence grade, sources, synthetic transformation when
   applicable, index entry, and validation. Wait for explicit approval.
4. Create the note from the narrowest template in `assets/`, update exactly one
   topic index, and add a root topic only when no existing topic applies.
5. Write all wiki prose and metadata in English. Apply the pinned No AI Slop
   editing and evaluation pass without weakening technical precision or evidence.
6. Run `scripts/wiki.py check` and the public-safety check. A private-case note
   also requires a semantic re-identification review.

## Evidence And Source Rules

- Preserve fundamentals, symptom, investigation, wrong turns, resolution,
  validation, uncertainty, and source support that materially affect reuse.
- Write wiki content in English and follow `references/writing-style.md`.
- Mark incident status `open` until the cause and fix behavior are verified.
- Cite official public documentation or immutable public repository permalinks.
- Never link, name, quote, redact, or mechanically transform a private source.
  Recreate a complete synthetic source packet with non-identifying values.
- Wiki knowledge cannot override live evidence or a newer authoritative source.

## Stop Conditions

Stop on an ambiguous target note, a likely duplicate, missing source support,
unverified `verified` status, private-data leakage risk, or a checker failure.
Return the one decision or artifact needed to continue.

## Output

For retrieval, report selected note IDs, applicability, conflicts, current-state
checks still required, and sources used. For maintenance, report changed notes
and indexes, checker/public-safety results, disclosure risk, and one next action.
