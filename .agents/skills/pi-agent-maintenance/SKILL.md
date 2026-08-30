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
3. Read before writing:
   - `references/skill-design-contract.md` for skill structure and routing.
   - `references/surface-contracts.md` for ownership boundaries.
   - `references/public-repository-safety.md` for public-safe examples and identifiers.
   - `references/regression-matrix.md` for required checks.
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

After the final edit, always run:

```bash
python3 .agents/skills/pi-agent-maintenance/scripts/check_public_safety.py
python3 .agents/skills/pi-agent-maintenance/scripts/validate_repo_contract.py
git diff --check
```

The contract helper covers structural contracts and invocation fixtures. Select
additional tests from `references/regression-matrix.md` only for changed surfaces;
for example, run `npm run test:extensions` when extension runtime, package
registration, or its harness changed. Do not rerun successful checks unless files
or relevant tool state changed.

Run `scripts/run_invocation_benchmark.py` only when automatic routing changed
and the user has confirmed provider, model, authentication, and paid-test budget.
Keep benchmark artifacts under git-ignored `tmp/`.

## Output

```text
Summary:
- Contract or behavior changed

Validation:
- Deterministic checks and benchmark status

Risk:
- Routing, compatibility, safety, or documentation risk

Next step:
- One concrete user action
```
