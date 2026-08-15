# Skill Design Contract

Use this contract when creating or changing project-scoped skills.

## Placement and Shape

Skills live at `.agents/skills/<skill-name>/`:

```text
<skill-name>/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

Only `SKILL.md` is required. Do not add provider-specific UI metadata. Add
support files only when they reduce repeated reasoning or provide deterministic
behavior.

## Context Ownership

- `AGENTS.md`: universal safety, approval, workspace, evidence, and mutation
  invariants. Never put a skill routing table or domain workflow there.
- Skill description: automatic invocation boundary; state positive and negative
  scope in one concise line.
- `SKILL.md`: selected task's core flow, stop conditions, reference pointers, and
  output contract.
- `references/`: optional deep procedures loaded only for a concrete need.
- `scripts/`: deterministic checks and repeated data reduction.
- `README.md`: human-facing inventory and manual invocation instructions.

Do not repeat the same rule across surfaces. Prefer moving detail downward over
copying it.

## Frontmatter

Required:

```yaml
---
name: lower-kebab-case
description: What it does. Use for X. Do not use for Y.
---
```

Use `disable-model-invocation: true` for infrequent, expensive, or explicitly
requested workflows. Manual skills must be documented as `/skill:<name>` in
README and must not have automatic invocation fixtures.

Keep auto descriptions precise and generally under 260 characters. Preserve the
positive trigger and closest negative boundary; do not optimize length by making
routing ambiguous.

## Body Budget

A normal `SKILL.md` should remain below 85 lines and contain only:

1. task contract or invariant
2. bounded workflow
3. safety/stop conditions
4. pointers to deeper references or scripts
5. concise output contract

Move command catalogs, troubleshooting matrices, examples, and domain background
to support files. A line limit is a review signal, not permission to compress
multiple unrelated rules into dense prose.

## Routing and Tests

Automatic skills require positive and negative invocation fixtures. Prefer one
fixture per meaningful boundary; add more only for a known collision.

Before completion, run:

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/validate_repo_contract.py
npm run test:extensions
git diff --check
```

Run the paid invocation benchmark only after automatic descriptions change and
the user confirms provider, model, authentication, and budget.
