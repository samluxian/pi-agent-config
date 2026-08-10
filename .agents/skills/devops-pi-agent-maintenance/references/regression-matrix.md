# Maintenance Regression Matrix

Run the smallest rows that cover every changed surface. Run the contract helper
first; add real prompt trials when routing behavior changes.

| Changed surface | Required evidence |
| --- | --- |
| Model-invoked skill description | Concise positive/negative boundary; unique invoke and skip fixtures; fixture validator; representative same-model prompt trials |
| Manual skill | `disable-model-invocation: true`; README `/skill:<name>` entry; no automatic invocation fixtures |
| Skill body/reference | Frontmatter and UI metadata valid; body within context budget; every pointer resolves; completion criteria remain checkable; no duplicated owner |
| Terraform import/state recovery guidance | Distinguish configuration/state/live ownership; exact source and destination addresses; matching import destination; non-destroying removal; explicit root order; saved-plan path and sensitivity; partial-apply fresh plan; lock owner proof; final per-root no-op evidence |
| Skill add/remove/rename | README inventory, UI metadata, fixtures, cross-skill pointers, and active references all accounted for |
| `AGENTS.md` | Within context budget; README synchronized; shared rule is always-on; no skill routing table or domain workflow; `git diff --check` |
| Pi extension | Hook allow/transform-or-block/failure/reset tests; package registration; initializer/install docs; bounded output review |
| Subagent extension | Parent/child authority boundary; profile/tool allowlist; model/thinking CLI; single/parallel limits; timeout/abort/process failure; no paid provider call in unit tests |
| Settings/session/model policy | JSON parse; installed-version documentation check; no automatic overwrite path; README adoption instructions |
| Communication contract | Answer/action-first and teaching-analysis examples remain structured; safety, uncertainty, and technical identifiers are retained |

## Fixed Checks

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/validate_repo_contract.py
git diff --check
git status --short --untracked-files=all
```

For a removed surface, use a narrow `rg` over active guidance, skills, package,
config, scripts, and extensions. Historical notes are evidence, not active
routing, and need not be rewritten.

## Paid Model Routing Check

Run after material description or routing changes, not as part of routine unit
tests:

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/run_invocation_benchmark.py \
  --provider <provider> --model <model> --thinking low
```

Grade invocation by the corresponding `SKILL.md` read event. A model merely
printing a skill name is not proof of invocation. Store raw events under `tmp/`
and report model, thinking level, case count, pass rate, tokens, cost, and failed
case IDs.

## Release Gate

A maintenance patch is ready for review only when:

1. Every requested behavior has one source of truth and every caller is current.
2. Positive behavior and nearest negative boundary have deterministic coverage.
3. Tool/context changes preserve errors, identity, recoverability, and bounded
   output, or explicitly document why one property does not apply.
4. Validation output names both passes and gaps.
5. The handoff identifies context, invocation, CI, documentation, and runtime
   risk without claiming untested behavior.
