# 2026-05-25 GitOps Delivery Engineering Preflight

## Purpose

- Harden `gitops-delivery-workflow` so delivery work checks GCP/runtime prerequisites before editing files, keeps upstream and downstream changes paired, and reports live diff plus MR-ready output.

## Current Status

- Status: completed locally, not committed.
- Working directory: `/home/samlu/repos`
- Branch: `main`

## Completed

- Added a pre-write gate for GCP-backed changes: verify required GSA, APIs, IAM binding, KSA wiring, and Secret Manager secrets before patching desired-state files.
- Added blocker behavior for missing or unverified GSA/API/IAM/secret prerequisites.
- Added multi-repo delivery guidance to identify upstream service repo and downstream `k8s-deploy`, and to avoid patching downstream alone when upstream CI/build/handoff must change.
- Added post-patch requirements to provide repo diff commands, include a live diff command, ask whether to compare other environment values, and provide upstream/downstream MR notes when both sides are involved.
- Updated README skill summary to expose the new human-facing workflow expectations.

## Changed Files

- `.agents/skills/gitops-delivery-workflow/SKILL.md`
- `README.md`
- `docs/session-notes/2026-05-25-gitops-delivery-engineering-preflight.md`

## Verification

- `git diff --check`: passed.
- `rg -n "Engineering preflight|Post-patch verification|GSA|live diff|upstream|downstream|Secret Manager" .agents/skills/gitops-delivery-workflow/SKILL.md README.md`: confirmed key rules are present.
- `git status --short --untracked-files=all`: confirmed the changed files are the skill, README, and this new note.

## Next Steps

- Review the diff.
- Commit when the wording is accepted.

## Risks And Notes

- The skill remains a compact router; if this section grows further, move detailed setup runbooks into `references/workload-identity.md` or a dedicated engineering preflight reference.
- Live GCP/Kubernetes commands were not run because this was skill maintenance, not a service delivery change.

## Suggested Skills

- `gitops-delivery-workflow`
- `session-memory`
