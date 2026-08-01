---
name: devops-pi-agent-maintenance
description: "Maintain the `devops-pi-agent` repository's agent contract across project skills, Pi extensions, AGENTS.md, settings baselines, and regression checks. Use only when changing this repo's agent behavior or maintenance rules. Do not use for product/service GitOps work, ordinary target-repo edits, or running an existing skill."
---

# DevOps Pi Agent Maintenance

Use this skill with `$gitops-implementation-workflow` for approved edits. The
workspace `AGENTS.md` remains the authority for approval, Git, secrets, and
non-mutating operational boundaries.

## Maintenance Flow

1. **Baseline the contract.** Confirm this repo, branch, dirty state, requested
   behavior, and affected surfaces. Inspect each caller before proposing a
   change. Complete when every pre-existing change is preserved and every
   requested behavior has a named owner and consumer.
2. **Choose one owner.** Use the surface table below, remove duplicate rules,
   and disclose branch-only details behind a context pointer. When changing a
   skill, read `references/skill-design-contract.md`. When changing an extension
   or session/settings behavior, read the matching branch in
   `references/surface-contracts.md`. Complete when each behavior has one
   source of truth and no broader trigger or always-on rule is introduced by
   accident.
3. **Gate the patch.** Present intended files, behavior, validation, and
   context/invocation/tool-loop risk before editing. Complete when explicit
   approval covers that exact patch.
4. **Implement the smallest contract change.** Synchronize package/init wiring,
   README inventory, metadata, fixtures, tests, and removal references only
   where the changed surface requires them. Complete when no adopting surface
   is stale or orphaned.
5. **Prove predictability.** Run the deterministic helper, then apply the
   changed-surface checks in `references/regression-matrix.md`. Complete when
   positive and negative behavior are both covered, every changed file is
   accounted for, and each skipped check has a named reason.
6. **Handoff without drift.** Lead with the resulting behavior, visible test
   evidence, residual risk, and one next action. Complete when a future
   maintainer can review the patch without reconstructing its ownership or
   safety assumptions.

## Surface Ownership

| Behavior | Owning surface |
| --- | --- |
| Always-loaded safety, routing, approval, shared response shape | `AGENTS.md` |
| On-demand semantic process or domain procedure | `.agents/skills/**` |
| Deterministic tool, context, session, or loop enforcement | `extensions/**` |
| Optional Pi defaults and budget examples | `config/**` |
| Human-facing installation, inventory, and operating policy | `README.md` |
| Repeatable proof of trigger or hook behavior | fixtures, scripts, and tests |

Do not solve a deterministic hook problem with prompt prose. Do not solve a
semantic judgment problem with a brittle command regex. Do not recreate a
standalone communication skill for rules that apply to every response; keep
shared response shape in `AGENTS.md`.

## Deterministic Helper

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/validate_repo_contract.py
```

The helper checks structure and regressions; it does not prove model routing
quality by itself.

## Model Invocation Benchmark

When a model-invoked description or routing boundary materially changes, run:

```bash
python3 .agents/skills/devops-pi-agent-maintenance/scripts/run_invocation_benchmark.py \
  --provider <provider> --model <model> --thinking low
```

This performs paid, read-only, `--no-session` Pi calls. It loads exactly the
project skills, permits only `read`, saves raw JSONL under git-ignored `tmp/`,
and grades actual `SKILL.md` reads. Keep model and thinking settings identical
when comparing two revisions.

## Output

```text
Result:
Contract owner:
Changed surfaces:
Validation:
Drift risk:
Next step:
```
