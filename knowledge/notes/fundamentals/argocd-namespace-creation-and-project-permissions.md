---
id: argocd-namespace-creation-and-project-permissions
title: Argo CD namespace creation and project permissions
type: fundamental
status: stable
topic: gitops-delivery
when_to_read: An Application enables CreateNamespace but namespace creation is denied or its project requires a Namespace allowlist.
aliases:
- namespace-auto-creation
- namespace-whitelist
- app-of-apps
scope: public-source
created: 2026-10-03
updated: 2026-10-03
description: CreateNamespace requests destination namespace creation but does not replace AppProject resource permissions or Kubernetes RBAC.
tags:
- argocd
- namespace
- appproject
- createnamespace
- clusterresourcewhitelist
- rbac
evidence_status: verified
---

# Argo CD namespace creation and project permissions

## TL;DR

`CreateNamespace=true` requests automatic creation of `spec.destination.namespace`. It does not grant permission to create it. Namespace is a cluster-scoped resource, so the Application's AppProject must allow that resource, and Argo CD must have the necessary Kubernetes permissions. [S1][S2][S3]

## When To Read

- An Application has `CreateNamespace=true`, but its destination namespace is not created.
- A project configuration includes `clusterResourceWhitelist` for `Namespace`, and its purpose is unclear.
- An App-of-Apps parent and its children use different projects.
- Do not use this note as proof that a particular cluster or Argo CD release is configured correctly.

## Knowledge

### Mechanism

Three separate controls participate:

| Control | Role |
| --- | --- |
| Application `spec.syncPolicy.syncOptions` | Requests automatic creation of the destination namespace with `CreateNamespace=true`. [S1] |
| AppProject destination and resource policies | Permit the target cluster and namespace, and the cluster-scoped Namespace resource. [S2] |
| Kubernetes RBAC for Argo CD's cluster identity | Authorizes the API operation; project policy does not grant Kubernetes permissions. [S3] |

Namespace is cluster-scoped even though it contains namespaced resources. Allowing workloads in a destination namespace is therefore distinct from allowing creation of the Namespace resource itself. Projects control cluster-scoped resource kinds with an allowlist. [S2]

### Minimal Example

The following fragments belong to different resources. They are not a complete installation or a cluster-readiness check.

```yaml
# AppProject.spec
clusterResourceWhitelist:
  - group: ""
    kind: Namespace
```

```yaml
# Application.spec
project: workload-project
destination:
  server: https://kubernetes.default.svc
  namespace: workload-space
syncPolicy:
  syncOptions:
    - CreateNamespace=true
```

The allowlist must belong to the `workload-project` AppProject named by the Application. The empty API group denotes the Kubernetes core group. This entry permits the Namespace kind; it neither creates a namespace by itself nor limits the grant to automatic creation. The project must separately allow the destination. [S2]

### Boundaries And Common Mistakes

- `metadata.namespace` locates the Application CR. `spec.destination.namespace` identifies the workload destination and the namespace targeted by automatic creation. [S1][S4]
- An App-of-Apps parent does not confer its project permissions on child Applications. Evaluate each child's `spec.project`. [S2][S4]
- No additional Namespace allowlist entry is needed when the selected project already permits it. Do not broaden the project to all cluster-scoped kinds merely to allow Namespace creation. [S2]
- `managedNamespaceMetadata` requires `CreateNamespace=true`; several Applications sharing a namespace should not be assumed to provide independent ownership of its metadata. [S1]
- Argo CD user RBAC, AppProject resource policy, and Kubernetes RBAC are different authorization layers. Changing one does not establish the others. [S2][S3]

### Evidence And Validation Limits

This is a documentation-backed fundamental, not a verified incident resolution. No target-system synchronization or release-specific behavior was tested. For a deployment diagnosis, confirm the child's actual project, effective project destination/resource policies, Argo CD release, and a bounded sync error before concluding which layer denied creation. A repository manifest proves intended configuration, not applied state.

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Argo CD sync options](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/) | 2026-10-03 | CreateNamespace target, namespace matching, and managedNamespaceMetadata prerequisite. |
| S2 | [Argo CD projects](https://argo-cd.readthedocs.io/en/stable/user-guide/projects/) | 2026-10-03 | Per-Application project selection, destination restrictions, and cluster-scoped resource allowlists. |
| S3 | [Kubernetes RBAC authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) | 2026-10-03 | Kubernetes API permissions remain a separate authorization requirement. |
| S4 | [Argo CD declarative setup](https://argo-cd.readthedocs.io/en/stable/operator-manual/declarative-setup/) | 2026-10-03 | Application location, project reference, and destination fields. |

## Related Notes

- [Least-privilege GitOps status access](least-privilege-gitops-status-access.md): Argo CD user access is separate from resource deployment permissions.
