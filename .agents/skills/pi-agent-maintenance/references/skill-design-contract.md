# Skill Design Contract

Use this contract when creating or changing project-scoped skills.

## Placement and Ownership

Skills live at `.agents/skills/<skill-name>/` and require `SKILL.md`. Add
`references/`, `scripts/`, `assets/`, or a human-facing `README.md` only when each
surface has a concrete owner:

- `AGENTS.md`: rules needed for every task.
- Skill description: what the skill does and when it should be selected.
- `SKILL.md`: the selected task's core flow and stop conditions.
- `references/`: detailed procedures loaded for a stated condition.
- `scripts/`: deterministic checks and repeated data reduction.
- `assets/`: templates and static resources.
- `README.md`: optional human setup, inventory, or manual usage.

Move detail downward instead of copying it. Do not repeat the complete workspace
report shape or add a skill routing table to always-on instructions.

## Agent Skills Metadata

Every `SKILL.md` starts with YAML frontmatter containing:

```yaml
---
name: lower-kebab-case
description: What the skill does and when it should be used.
---
```

The deterministic hard contract follows the Agent Skills specification:

- `name` is 1–64 characters, uses lowercase letters, digits, and single internal
  hyphens, and matches its parent directory.
- `description` is a non-empty string of at most 1,024 characters.
- Optional `compatibility` is a string of 1–500 characters.
- Optional `license` and `allowed-tools` are strings.
- Optional `metadata` maps string keys to string values.

Descriptions should contain specific task language and enough positive scope to
route correctly. Add the nearest negative boundary when it resolves a real
collision; no exact `Use` or `Do not use` sentence form is required.

Pi-specific fields such as `disable-model-invocation: true` may control local
behavior. Unknown fields remain available to compatible harnesses and are not a
reason to rewrite an external skill.

## Progressive Disclosure and Budgets

Instruction size is review evidence, not a loadability failure:

- Review `AGENTS.md` after 200 lines. At 32 KiB, report its contribution to
  Codex's combined project-instruction portability limit.
- Review `SKILL.md` after 500 lines.
- Report a performance notice when a skill body reaches an estimated 5,000
  tokens. The validator uses a documented byte-derived estimate, not a claimed
  model tokenizer count.
- Report aggregate description characters because all skill metadata is loaded
  at startup, but do not impose an invented aggregate hard limit.

Keep core workflow and stop conditions in `SKILL.md`. Move command catalogs,
troubleshooting, examples, and domain background to focused references. Every
reference pointer should state when the agent needs that file.

## External Skills

Externally installed skills retain their upstream layout and wording. Apply the
same Agent Skills metadata checks and report the same nonblocking size signals,
but do not locally rewrite upstream content to satisfy repository preferences.
`skills-lock.json` remains installer inventory and is not part of the instruction
focus validator. Public-safety remains a separate whole-repository check.

## Routing Evaluation

Static validation cannot prove semantic routing. When a description materially
changes or a known collision recurs, use representative positive and negative
prompts under an explicitly approved provider, model, authentication, and paid
budget. Invocation fixtures and model trials are optional evaluation tools, not
fixed contract gates.
