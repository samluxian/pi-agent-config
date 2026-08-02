# Source / Runtime Diagnostics Gate

Date: 2026-08-02
Status: implementation complete; review remains

## Result

- Added an application-level source inspection gate to runtime diagnostics.
- Required the running image tag or digest to map to the deployed source
  revision before source inspection; the default branch cannot substitute for
  artifact provenance.
- Added a four-layer contract comparison across deployed source, desired state,
  render/live workload, and runtime observations.
- Separated the immediate trigger, contributing source-design factor, contract
  classification, and supported fix surface.
- Added GitLab stage routing so source/build failures stop before irrelevant
  desired-state or live-state inspection.
- Kept static source review and generic GitOps mismatches outside
  `runtime-dependency-ops`.

## Changed Files

- `AGENTS.md`
- `README.md`
- `.agents/shared/skill-quality/fixtures/invocation-cases.json`
- `.agents/skills/gitops-diagnostics-workflow/SKILL.md`
- `.agents/skills/gitops-diagnostics-workflow/references/troubleshooting-matrix.md`
- `.agents/skills/runtime-dependency-ops/SKILL.md`
- `.agents/skills/runtime-dependency-ops/agents/openai.yaml`
- `.agents/skills/runtime-dependency-ops/references/source-runtime-contract.md`
- `docs/session-notes/2026-08-02-source-runtime-diagnostics-gate.md`

## Verification

- Repository contract validation passed: 12 model-invoked skills, 5 extensions,
  and 3 extension test files.
- Invocation fixture validation passed: 29 cases across 12 skills with positive
  and negative coverage.
- Five affected and nearest-competitor routing benchmarks passed with
  `openai-codex/gpt-5.6-sol` at `low`; artifacts are git-ignored under
  `tmp/invocation-benchmark-20260802T052811Z/`.
- `implementation_flow.sh --allow-main` preflight and post-patch review passed.
- `git diff --check`, JSON parsing, and changed-file whitespace/final-newline
  checks passed.

## Risk

- Documentation and routing behavior only; no deployment, IAM, CI, runtime, or
  remote system was mutated.
- The source gate reduces broad repository scans, but a missing image-to-source
  mapping intentionally leaves the result inconclusive rather than guessing.

## Next Action

Review the working diff, then commit and push through the user-operated Git
workflow when ready.
