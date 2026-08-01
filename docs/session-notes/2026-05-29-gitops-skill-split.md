# 2026-05-29 GitOps Skill Split

## Purpose

- Split the broad GitOps router skill into narrower implementation and diagnostics skills.

## Current Status

- Status: completed locally, not committed or pushed.
- Working directory: `/home/samlu/repos`
- Branch: `main`

## Completed

- Renamed `.agents/skills/gitops-delivery-workflow/` to `.agents/skills/gitops-router/`.
- Replaced `.agents/skills/gitops-router/SKILL.md` with a compact compatibility router.
- Added `.agents/skills/gitops-implementation-workflow/` for approved repo-file implementation work.
- Added `.agents/skills/gitops-diagnostics-workflow/` for read-only checks, review, troubleshooting, and verification.
- Added executable wrapper scripts:
  - `.agents/skills/gitops-implementation-workflow/scripts/implementation_flow.sh`
  - `.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh`
- Added compact JSON summarizers to keep large manifests and diffs out of the
  context window:
  - `.agents/skills/gitops-diagnostics-workflow/scripts/summarize_manifest_json.py`
  - `.agents/skills/gitops-diagnostics-workflow/scripts/summarize_kubectl_diff_json.py`
- Added compact GitLab pipeline summarization:
  - `.agents/skills/gitops-diagnostics-workflow/scripts/summarize_gitlab_pipeline.sh`
  - `diagnostics_flow.sh gitlab-pipeline <project-path> <pipeline-id>`
  - Captures tag parser failures such as `uat-1.1.8-...` failing
    `manage-tags.sh` before build or GitOps update.
- Updated `README.md` with the new skill inventory and trigger boundaries.
- Kept legacy `gitops-router/references/` and `assets/` in place, but the router no longer loads or routes to them by default.

## Changed Files

- `.agents/skills/gitops-router/SKILL.md`
- `.agents/skills/gitops-implementation-workflow/SKILL.md`
- `.agents/skills/gitops-implementation-workflow/agents/openai.yaml`
- `.agents/skills/gitops-implementation-workflow/scripts/implementation_flow.sh`
- `.agents/skills/gitops-diagnostics-workflow/SKILL.md`
- `.agents/skills/gitops-diagnostics-workflow/agents/openai.yaml`
- `.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh`
- `.agents/skills/gitops-diagnostics-workflow/scripts/summarize_gitlab_pipeline.sh`
- `.agents/skills/gitops-diagnostics-workflow/scripts/summarize_manifest_json.py`
- `.agents/skills/gitops-diagnostics-workflow/scripts/summarize_kubectl_diff_json.py`
- `README.md`
- `docs/session-notes/2026-05-29-gitops-skill-split.md`

## Verification

- `bash -n` passed for both new wrapper scripts.
- Both wrapper scripts returned valid `--help` output.
- `summarize_manifest_json.py` and `summarize_kubectl_diff_json.py` passed AST
  syntax parsing without writing `__pycache__`.
- `diagnostics_flow.sh helm-json authserver-uat test-charts/authserver-flex-app-3.1.0 newaile uat`
  produced compact JSON for ConfigMap, Service, Deployment, and ExternalSecret.
- `summarize_kubectl_diff_json.py` summarized a synthetic immutable selector
  diff into `fail` plus selector and ServiceAccount findings without printing a
  full diff.
- `implementation_flow.sh --allow-main --chart test-charts/authserver-flex-app-3.1.0 --release authserver-uat --namespace newaile --env uat ...`
  ran successfully and emitted a rendered manifest JSON summary.
- `diagnostics_flow.sh gitlab-pipeline aile_cloud/newaile/backend/springcloud-aile 2560611322`
  produced compact JSON and detected `tag_format_rejected_in_pre_check` for
  `uat-1.1.8-202605291004`.
- `quick_validate.py` passed for:
  - `.agents/skills/gitops-router`
  - `.agents/skills/gitops-implementation-workflow`
  - `.agents/skills/gitops-diagnostics-workflow`
- `git diff --check` passed.
- `implementation_flow.sh --allow-main ... /home/samlu/repos` passed and produced repo preflight plus post-patch review output.

## Next Steps

- Review whether to eventually delete or archive legacy `gitops-router/references/` and `assets/`.
- Consider moving shared helper scripts out of the router skill into a common project script location if cross-skill dependency becomes confusing.

## Risks And Notes

- Existing unrelated untracked files remain in the workspace, including `dev-shell-zsh-setup`, `docs/authserver-uat-deployment-plan.md`, and `test-charts/authserver-flex-app-3.1.0/`.
- `README.md` already had uncommitted dev-shell content before this change; the new README edit preserved and extended it.
- No Kubernetes, ArgoCD, GitLab, GCP, Git remote, branch, staging, commit, or push mutation was performed.

## Suggested Skills

- `gitops-router`
- `gitops-implementation-workflow`
- `gitops-diagnostics-workflow`
- `gitops-repo-audit`
- `session-memory`
