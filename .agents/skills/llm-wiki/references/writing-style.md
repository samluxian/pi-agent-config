# English And No-AI-Slop Writing Contract

Write every human-readable field and paragraph under `knowledge/` in English.
The same rule applies to note templates in `assets/`. Keep code, commands, API
names, exact error text, source titles, and identifiers unchanged when technical
accuracy requires it.

## Required Editing Pass

Draft the complete technical meaning first. Then apply the editing principles
from Peter Yang's No AI Slop skill, pinned at commit
[`000650b156983f5159695b441477f4e63b25dc85`](https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/SKILL.md):

1. Preserve the claim, evidence grade, uncertainty, technical detail, and writer's
   natural voice.
2. Make the smallest edit that removes filler, repetition, inflated claims, and
   unclear sentence structure.
3. Lead with the useful point when setup adds no context.
4. Prefer active voice, direct verbs, named actors, concrete mechanisms, and
   measured results.
5. Name sources. Do not use vague attribution or invent facts, examples, numbers,
   opinions, or confidence.
6. Remove canned contrasts, throat-clearing, fake insight, dramatic fragments,
   decorative reveal sentences, recap endings, and importance claims that the
   evidence does not support.
7. Keep headings, tables, labels, and lists when they help a technical reader
   navigate evidence. Do not remove a necessary contrast or caveat merely because
   its grammar resembles a discouraged pattern.

Run the upstream-style evaluation after editing. The pinned
[`eval.md`](https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/skills/no-ai-slop/eval.md)
asks whether the edit preserves meaning and voice, uses concrete facts and direct
verbs, removes named slop patterns, and still reads naturally to a colleague.
Fix every failed check before publishing the note.

## Deterministic And Human Checks

`wiki.py check` rejects non-English CJK prose and a bounded list of wording that
the upstream skill bans or treats as filler. This catches regressions; it cannot
judge voice, rhythm, evidence, necessary nuance, or whether an English sentence
sounds natural.

The final human review must answer:

- Does every sentence add a fact, mechanism, boundary, decision, or useful action?
- Did the edit preserve uncertainty and exact technical distinctions?
- Are sources named next to the claims they support?
- Would the prose sound natural when read to a technical colleague?
- Does the ending stop on a concrete result, boundary, or next action?

## Attribution

This contract summarizes writing and evaluation principles from
[petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop/tree/000650b156983f5159695b441477f4e63b25dc85),
Copyright (c) 2026 Peter Yang, licensed under the
[MIT License](https://github.com/petergyang/no-ai-slop/blob/000650b156983f5159695b441477f4e63b25dc85/LICENSE).
