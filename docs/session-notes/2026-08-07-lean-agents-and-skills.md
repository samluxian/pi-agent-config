# Lean AGENTS and Skills

## Completed

- Reduced `AGENTS.md` to always-on safety, approval, workspace, evidence, and
  mutation invariants; removed the skill routing table and domain workflows.
- Compressed all 12 `SKILL.md` files while retaining boundaries, stop conditions,
  reference/script routing, and output contracts.
- Kept nine skills automatic, including both Flex App skills.
- Made `devops-pi-agent-maintenance`, `orchestrator`, and
  `service-delivery-topology` manual-only and documented their `/skill:` entry
  points in README.
- Added deterministic budgets: `AGENTS.md` <=230 lines, each `SKILL.md` <=85
  lines, and automatic descriptions <=2100 characters total.

## Validation

- Repository contract: passed; 12 skills, 9 model-invoked, 6 extensions.
- Extension tests: 20 passed.
- `git diff --check`: passed.
- Paid invocation benchmark: not run; provider/model/budget confirmation remains
  required.

## Result

- `AGENTS.md`: 403 -> 187 lines; 2,718 -> 1,177 words.
- `SKILL.md` total: 1,071 -> 668 lines; 6,445 -> about 3,300 words.
- Startup-visible descriptions: 12 skills / 3,757 characters -> 9 skills /
  2,093 characters.
