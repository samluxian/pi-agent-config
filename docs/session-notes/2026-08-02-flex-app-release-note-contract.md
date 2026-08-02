# Flex App Release Note Contract

Date: 2026-08-02
Status: complete; awaiting user Git handoff

## Result

- Extended `flex-app-chart-maintenance` to author evidence-based, productized
  GitLab Release notes after chart contract proof.
- Added a single release-note reference that covers evidence gates, originating
  project attribution, productized structure, breaking-change rationale,
  compatibility, known limitations, and user-operated GitLab publication.
- Kept GitLab read-only for the agent. The skill may inspect a release and write
  Markdown, but only provides the human with the `glab release create` command.
- Extended `flex-app-version-upgrade` to read every published Release note in
  `(current version, target version]` and reconcile each claim with exact chart
  source and render evidence.
- Made missing notes explicit missing evidence and kept chart source, effective
  render, and live compatibility authoritative when notes conflict.
- Added an upgrade-plan output that orders wrapper changes, validation,
  migrations, and stop conditions.
- Did not add a release-query script or modify chart, service, production, or
  GitLab resources.

## Changed Files

- `.agents/skills/flex-app-chart-maintenance/SKILL.md`
- `.agents/skills/flex-app-chart-maintenance/agents/openai.yaml`
- `.agents/skills/flex-app-chart-maintenance/references/release-notes.md`
- `.agents/skills/flex-app-version-upgrade/SKILL.md`
- `.agents/skills/flex-app-version-upgrade/agents/openai.yaml`
- `.agents/shared/skill-quality/fixtures/invocation-cases.json`
- `AGENTS.md`
- `README.md`
- `docs/session-notes/2026-08-02-flex-app-release-note-contract.md`

## Verification

- Repository contract validation passed with 11 model-invoked skills, 5
  extensions, and 3 extension test files.
- Invocation fixture validation passed with 31 cases across 11 skills and
  positive and negative coverage.
- Five representative routing benchmarks passed with
  `openai-codex/gpt-5.6-sol` at `low`: Release-note authoring invoked chart
  maintenance; Release-note-based and existing version comparisons invoked
  version upgrade; service-only values and shared chart authoring preserved
  their skip boundaries.
- Benchmark artifacts are git-ignored under
  `tmp/invocation-benchmark-20260802T074557Z/`.

## Risk

- Guidance and routing behavior only; no deployment, IAM, CI, runtime, or remote
  system was mutated.
- GitLab authentication, permission, missing release descriptions, or stale
  local tags can create evidence gaps. The consumer contract fails loud and does
  not interpret a missing note as no changes.
- Productized prose can overstate safety if it is not reconciled with chart
  behavior. The contract requires claim-to-source-to-render evidence and names
  operational tradeoffs explicitly.

## Next Action

Review the working diff, then commit and push through the user-operated Git
workflow when ready.
