---
name: pi-agent-maintenance
description: Maintain devops-pi-agent skills, extensions, AGENTS.md, README, settings, and regression contracts. Use for this repository's agent behavior or maintenance rules. Do not use for product/service GitOps or target-repo edits.
---

# Pi Agent Maintenance

Keep agent behavior lean, testable, and owned by one surface. Use this skill
only for this repository's agent contract, not ordinary delivery work.

## Flow

1. Confirm this repository, branch, status, and requested behavior.
2. State affected surfaces, success criteria, validation, and compatibility risk.
3. Read `references/public-repository-safety.md` and
   `references/regression-matrix.md`, then use `references/surface-contracts.md`
   to load only the branch and linked reference needed for the changed surface.
4. Propose the bounded patch and wait for explicit approval.
5. Apply the smallest coherent change; update README for human-facing behavior.
6. Run deterministic validation and compare context/routing budgets when relevant.

## Ownership

- `AGENTS.md`: always-on safety, approval, workspace, and evidence invariants.
- Skill description: automatic invocation boundary.
- `SKILL.md`: selected task's core workflow and stop conditions.
- `references/`: deep procedures and domain explanation.
- `scripts/` or extensions: deterministic or enforceable behavior.
- `README.md`: human-facing setup, inventory, and usage.

Do not duplicate a workflow across these surfaces. Keep each skill's semantic
boundary in its description instead of adding a routing table to `AGENTS.md`.

## Validation

Required fixed checks:

```bash
python3 .agents/skills/pi-agent-maintenance/scripts/check_public_safety.py
python3 .agents/skills/pi-agent-maintenance/scripts/validate_repo_contract.py
git diff --check
```

The contract helper hard-fails only Agent Skills loadability and metadata errors;
instruction-size, portability, and focus findings are nonblocking review signals.
Public safety remains a separate check. Select additional tests from
`references/regression-matrix.md` only for changed surfaces.

Use `scripts/run_invocation_benchmark.py` only for a material routing change or
known collision after the user confirms provider, model, authentication, and
paid-test budget. It is not a fixed contract gate. Keep benchmark artifacts under
git-ignored `tmp/`.

## Domain Reporting

In the workspace report, include routing, compatibility, safety, documentation,
context-budget, deterministic-check, and benchmark findings that apply.
