# 2026-07-20 Diagnostics Decision Loop

## Purpose

- Make GitOps troubleshooting select and interpret the smallest useful probe before crossing evidence layers.

## Current Status

- Status: completed locally, not committed or pushed.
- Repository: `/home/samlu/devops-repos/skills`
- Branch: `main`

## Completed

- Replaced flat diagnostic rules with a five-step loop: `frame → hypothesis → probe → interpret → stop/route`.
- Added a completion criterion to every loop step.
- Added explicit result states: `supported`, `rejected`, `inconclusive`, and `no coverage`.
- Expanded the troubleshooting matrix with working hypotheses, interpretation, and route gates.
- Added routes for unknown scope and for Ready Pods behind an unavailable Service/API.
- Grounded Pod and Service interpretation in official Kubernetes documentation.
- Updated `README.md` for the human-facing workflow.

## Changed Files

- `.agents/skills/gitops-diagnostics-workflow/SKILL.md`
- `.agents/skills/gitops-diagnostics-workflow/references/troubleshooting-matrix.md`
- `README.md`
- `docs/session-notes/2026-07-20-diagnostics-decision-loop.md`

## Verification

- `git diff --check` passed.
- `implementation_flow.sh --allow-main` repo preflight and post-patch review passed.
- The diagnostic loop contains five steps and five completion criteria.
- `diagnostics_flow.sh --help` works through the workspace skill symlink.
- Official Kubernetes Pod lifecycle and Pod/Service debugging pages were fetched successfully.

## Risk

- Documentation-only change; no deployment, IAM, CI, runtime, or remote mutation.
- The stop condition is bounded by the user's requested conclusion so one supported cause does not imply that every independent fault has been excluded.
