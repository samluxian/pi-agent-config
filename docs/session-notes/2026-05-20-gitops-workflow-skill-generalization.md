# 2026-05-20 GitOps Workflow Skill Generalization

## Purpose

- Preserve the current checkpoint after generalizing the project-scoped GitOps delivery workflow from the webchatbff prod migration experience.
- Capture the workspace-root AGENTS.md branch-boundary clarification so a future agent does not incorrectly block skill maintenance on `/home/samlu/repos` `main`.

## Current Status

- Status: implementation completed locally; not committed or pushed.
- Working directory: `/home/samlu/repos`
- Branch: `main`

## Completed

- Updated `AGENTS.md` to clarify that `/home/samlu/repos` is the workspace-root guidance and skills repository, and can be edited on `main` when the user explicitly asks to maintain agent guidance or project-scoped skills.
- Kept the branch gate for inner service/deployment/chart repositories under `workspace-repos/*`.
- Updated the project-scoped `gitops-delivery-workflow` skill as a general-purpose workflow, not a webchatbff-specific flow.
- Added migration-progress guidance to report active controller, desired state, render result, dry-run status, ArgoCD/live state, and remaining blockers.
- Added CI trigger convention discovery, dry-run formalization cleanup, and dead legacy deploy cleanup guidance.
- Added ArgoCD handoff guidance for render diff interpretation, PDB/live-resource cleanup, and Helm release secret cleanup after takeover.
- Added reusable live verification snippets for image tag, env/ConfigMap, Workload Identity, Service/endpoints, and PDB shape checks.

## Changed Files

- `AGENTS.md`
- `.agents/skills/gitops-delivery-workflow/SKILL.md`
- `.agents/skills/gitops-delivery-workflow/references/ci-gitops.md`
- `.agents/skills/gitops-delivery-workflow/references/helm-argocd-handoff.md`
- `.agents/skills/gitops-delivery-workflow/references/risk-verification.md`
- `docs/session-notes/2026-05-20-gitops-workflow-skill-generalization.md`

## Verification

- `git diff --check` passed before this note was created.
- `git diff --check` passed again after this note was created.
- `rg -n "webchatbff|DEVOPS-143" .agents/skills/gitops-delivery-workflow/...` returned no matches, confirming the skill docs stayed generalized.
- Readback confirmed `SKILL.md` remains a router and detailed procedures live in `references/`.

## Next Steps

- Review `git diff` for the six changed files.
- Commit when ready; no commit has been made by the agent.
- If desired later, sync equivalent guidance to any global skill only after explicit user approval.

## Risks And Notes

- The workspace-root repo is on `main` by design for instruction/skill maintenance, per the updated AGENTS.md exception.
- Do not apply this `main` editing exception to `workspace-repos/k8s-deploy`, `workspace-repos/helm-chart`, or application repositories.
- Kubernetes, ArgoCD, GitLab, and Git mutation boundaries remain unchanged.

## Suggested Skills

- `gitops-delivery-workflow`
- `session-memory`
