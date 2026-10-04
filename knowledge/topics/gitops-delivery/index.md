# gitops-delivery

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Argo CD namespace creation and project permissions](../../notes/fundamentals/argocd-namespace-creation-and-project-permissions.md) | fundamental | stable | verified | CreateNamespace requests destination namespace creation but does not replace AppProject resource permissions or Kubernetes RBAC. |
| [Replacing direct deployment with a GitOps handoff](../../notes/fundamentals/direct-deploy-to-gitops-handoff.md) | fundamental | stable | verified | A delivery pipeline can hand off an immutable artifact reference through versioned desired state while a GitOps controller owns cluster reconciliation. |
| [Gate GitOps delivery on explicit reconciliation evidence](../../notes/fundamentals/gitops-reconciliation-health-and-pipeline-gates.md) | fundamental | stable | verified | Git revision, sync status, resource health, and application behavior are separate evidence layers that a deployment gate must select and time-bound explicitly. |
| [Grant CI only the GitOps status access it uses](../../notes/fundamentals/least-privilege-gitops-status-access.md) | fundamental | stable | verified | A CI status identity should receive project-qualified application read access while sync, update, delete, logs, defaults, and group grants remain separate decisions. |
