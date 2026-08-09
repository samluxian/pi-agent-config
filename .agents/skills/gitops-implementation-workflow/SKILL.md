---
name: gitops-implementation-workflow
description: Implement an approved repo-file change to GitOps state, Helm values, CI handoff, or workspace guidance. Use only after approval covers the exact patch. Do not use for diagnosis, audits, architecture mapping, or MR prose.
---

# GitOps Implementation Workflow

Apply the smallest approved repository change and prove the intended behavior.
Approval never covers adjacent cleanup or a newly discovered wider scope.

## Preconditions

- Identify the actual target repository, branch, working tree, staged state, and
  user-owned changes.
- For delivery files, stop on `main`, `master`, `release`, protected, or shared
  branches. The documented workspace-guidance exception still requires explicit
  approval and bounded scope.
- Restate approved files, behavior, validation, and deployment/IAM/CI/runtime
  risk. Ask again if evidence changes the patch.

## Implementation Flow

1. Read target files, callers, defaults, templates, schemas, CI rules, and one
   relevant repository pattern.
2. Check desired-state ownership and effective values. For Helm aliases/overlays,
   use `references/helm-alias-overlays.md`; for Autopilot resource findings, use
   `references/gke-autopilot-resource-requests.md`.
3. Apply surgical edits only. Do not stage, commit, push, deploy, or overwrite
   unrelated user changes.
4. Validate in three bounded groups:
   - format or syntax
   - one behavior-proving render/test/check
   - final bounded diff and status
5. Stop and report if validation exposes a different required change.

Use `scripts/implementation_flow.sh` for fixed preflight/final checks. For Helm
rendering, prefer `.agents/shared/gitops/scripts/render_helm_values.sh`. Read
`references/keda-implementation.md` only when approved scope includes KEDA.

## Safety

Never modify secrets, credentials, kubeconfigs, `.env` files, remote Git,
clusters, Argo CD, GitLab, or GCP. Do not run direct deployment operations.
Do not invent environment names, versions, namespaces, identities, endpoints,
or branch refs.

## Output

```text
Summary:
- Files and intended behavior changed

Validation:
- Commands, results, and skipped checks

Risk:
- Deployment, IAM, CI, runtime, or documentation risk

Commit message:
- Suggested commit message when files changed

Next step:
- One concrete user action
```

When files changed, always provide a concise commit message. The user remains
responsible for commit, push, MR, and GitOps reconciliation.
