# gitops-delivery Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| direct-deploy-to-gitops-handoff | fundamental | verified | argocd, deployment, downstream-pipeline, gitops, image-digest, reconciliation | direct-deploy, gitops-handoff, helm-to-gitops | A delivery pipeline can hand off an immutable artifact reference through versioned desired state while a GitOps controller owns cluster reconciliation. | [Note](../../notes/fundamentals/direct-deploy-to-gitops-handoff.md) |
| least-privilege-gitops-status-access | fundamental | verified | applications-get, argocd, ci, jwt, rbac, status | argocd-read-only, deployment-status-token, gitops-status-access | A CI status identity should receive project-qualified application read access while sync, update, delete, logs, defaults, and group grants remain separate decisions. | [Note](../../notes/fundamentals/least-privilege-gitops-status-access.md) |
