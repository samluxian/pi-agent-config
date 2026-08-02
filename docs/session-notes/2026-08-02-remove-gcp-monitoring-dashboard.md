# Remove GCP Monitoring Dashboard Skill

Date: 2026-08-02
Status: complete; awaiting user Git handoff

## Result

- Removed the project-scoped `gcp-monitoring-dashboard` skill and its UI
  metadata and references.
- Removed the skill from the workspace routing table and README inventory.
- Removed its invoke and skip invocation fixtures.
- Kept `service-delivery-topology` unchanged as the owner for cross-repository
  construction, extraction, and delivery-topology analysis.
- Kept live service and dependency incidents under `runtime-dependency-ops`;
  dashboard authoring no longer has a dedicated project-scoped skill.

## Changed Files

- `AGENTS.md`
- `README.md`
- `.agents/shared/skill-quality/fixtures/invocation-cases.json`
- Deleted `.agents/skills/gcp-monitoring-dashboard/**`
- `docs/session-notes/2026-08-02-remove-gcp-monitoring-dashboard.md`

## Verification

- Repository contract validation passed: 11 model-invoked skills, 5 extensions,
  and 3 extension test files.
- Invocation fixture validation passed: 27 cases across 11 skills with positive
  and negative coverage.
- Four nearest-owner routing benchmarks passed with
  `openai-codex/gpt-5.6-sol` at `low`; artifacts are git-ignored under
  `tmp/invocation-benchmark-remove-gcp-dashboard-20260802T064318Z/`.
- Active-reference search found no remaining `gcp-monitoring-dashboard` pointer.
- `implementation_flow.sh --allow-main` preflight and post-patch review passed.
- Fixture JSON parsing, `git diff --check`, and changed-file whitespace and
  final-newline checks passed.

## Risk

- Guidance and routing behavior only; no deployment, IAM, CI, runtime, or remote
  system was mutated.
- Cloud Monitoring dashboard authoring no longer has a specialized
  project-scoped owner. External prompts that directly invoke
  `$gcp-monitoring-dashboard` will no longer resolve that skill.

## Next Action

Review the working diff, then commit and push through the user-operated Git
workflow when ready.
