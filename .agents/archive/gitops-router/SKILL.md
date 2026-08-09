---
name: archived-gitops-router
description: "Archived legacy GitOps router. Do not select for new work; use k8s-service-delivery, k8s-infra-delivery, gitops-diagnostics-workflow, or gitops-repo-audit instead."
---

# Archived GitOps Router

This archived skill is retained only for historical reference. Do not use it for
new work.

Pick the narrowest active project-scoped skill instead:

| User intent | Skill |
| --- | --- |
| Deliver an approved service-owned flex-app wrapper or values change | `$k8s-service-delivery` |
| Deliver an approved bootstrap, infrastructure, or platform CI change | `$k8s-infra-delivery` |
| Check, review, troubleshoot, verify, or explain GitOps/Helm/ArgoCD/Kubernetes/GCP behavior without editing | `$gitops-diagnostics-workflow` |
| Run a static desired-state inventory or consistency audit before deciding whether to change anything | `$gitops-repo-audit` |
| Write a handoff note after finishing or pausing work | `$session-memory` |

Keep evidence layers separate in every route:

```text
service repo / CI -> k8s-deploy desired state -> shared chart/render ->
ArgoCD -> Kubernetes live state -> runtime/GCP evidence
```

Hard rules:

- Treat Kubernetes, ArgoCD, GitLab, GCP, and Git remotes as read-only.
- Do not sync, apply, delete, restart, retry, approve, merge, push, tag, rebase,
  reset, restore, or mutate external systems.
- Do not guess envs, namespaces, project IDs, release names, GSA/KSA names,
  secret names, image tags, chart versions, or branch refs.
- Use scripts for fixed checks. Use model judgment for risk interpretation,
  source-of-truth conflicts, MR notes, and next actions.
- Scripts and templates that active skills still use were moved into the
  owning active skill directories.
- Legacy references remain here only for human lookup or explicit historical
  investigation.

If the request is already clearly implementation, diagnostics, or audit work,
skip this router and use the narrower skill directly.
