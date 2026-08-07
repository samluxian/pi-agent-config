---
name: devops-pi-agent-maintenance
description: Maintain this devops-pi-agent repository's skills, extensions, AGENTS.md, README, settings baselines, and regression contracts. Invoke manually for agent behavior maintenance; do not use for product or service delivery work.
disable-model-invocation: true
---

# DevOps Pi Agent Maintenance

Keep agent behavior lean, testable, and owned by one surface. This skill is
manual because repository-wide agent-contract changes are infrequent and broad.

## Flow

1. Confirm this repository, branch, status, and requested behavior.
2. State affected surfaces, success criteria, validation, and compatibility risk.
3. Read before writing:
   - `references/skill-design-contract.md` for skill structure and routing.
   - `references/surface-contracts.md` for ownership boundaries.
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

Do not duplicate a workflow across these surfaces. Keep manual skills out of
automatic routing and document their `/skill:<name>` entry points in README.

## Validation

Run:

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/validate_repo_contract.py
npm run test:extensions
git diff --check
```

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
