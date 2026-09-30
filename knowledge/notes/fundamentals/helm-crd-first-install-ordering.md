---
id: helm-crd-first-install-ordering
title: Install CRDs before their custom resources
type: fundamental
status: verified
topic: helm-contracts
summary: Helm guarantees first-install CRD ordering for the crds directory, not for CRDs rendered as ordinary templates beside their custom resources.
when_to_read: A fresh Helm install fails to recognize a custom resource kind, or a chart renders both a CRD and an instance of that kind.
keywords: [crd, custom-resource, helm, install, templates]
aliases: [no-matches-for-kind, first-install-crd, crd-ordering]
scope: public-source
created: 2026-09-30
updated: 2026-09-30
---

# Install CRDs before their custom resources

## TL;DR

Helm installs plain CRD files in `crds/` before it renders and uploads templates on a fresh install. That documented ordering does not cover CRDs generated from `templates/` alongside custom resources. [S1] If the target API server does not recognize a custom resource kind, establish its CRD before submitting instances of that kind. Check the actual chart layout rather than assuming every chart needs a separate installation step.

## When To Read

- Use when an initial chart install reports `no matches for kind` for a custom resource.
- Use when a wrapper chart renders both a dependency's CRD and its own custom resource.
- Do not assume a successful local render proves the target API server recognizes the kind.

## Knowledge

### First-install boundary

Helm treats files in a chart's `crds/` directory specially: it installs them before rendering the chart's templates. Files there must be plain YAML; Helm does not install those CRDs again on upgrade or rollback, nor does it delete them. [S1]

A CRD rendered from `templates/` is not covered by that `crds/` guarantee. Check whether the chart packages its CRDs under `crds/`, renders them from templates, or expects a separate CRD owner. Do not infer first-install ordering from a value named `installCRDs` alone. [S1]

For a chart that renders both a templated CRD and its custom resource, a chart-owned option to omit the custom resource can permit a bounded two-stage install: first establish the CRD and controller, verify the API server serves the kind, then enable the custom resource. This is a chart-specific option, not a general Helm guarantee. Avoid two releases managing the same resources merely to work around ordering.

### Identity and readiness boundaries

A provider-backed custom resource can be accepted by Kubernetes yet remain unusable. For the External Secrets Operator Google Secret Manager provider, a `ClusterSecretStore` using `auth.workloadIdentity` needs a namespaced Kubernetes service account reference. [S2] On GKE, linking that Kubernetes service account to an IAM service account requires both the intended annotation and an IAM impersonation binding; access to Secret Manager is a separate authorization decision. [S3]

Keep these checks separate:

1. The CRD is established and the API server recognizes the kind.
2. The release completed and the controller is ready.
3. The store reports a valid provider configuration.
4. An authorized test resource actually synchronizes an intended secret without exposing its value.

Neither local `helm template` output nor a ready store proves the final secret read. A failed or interrupted Helm upgrade also requires checking release history; an existing custom resource does not prove the latest revision was deployed.

### Boundaries and common mistakes

- **Treating every CRD alike:** the `crds/` lifecycle and a CRD under `templates/` have different documented ordering contracts. [S1]
- **Repeating an interrupted upgrade without checking status:** first inspect the release revision and the custom resource condition.
- **Treating a Kubernetes service account as a complete cloud identity:** service-account creation, IAM impersonation, and resource-level access are separate steps. [S3]
- **Equating controller readiness with a successful read:** validate an authorized read through the intended workload path.

### Minimal example

```text
Wrapper chart:
  dependency/templates/crds/          # CRD rendered as a template
  templates/provider-store.yaml        # instance of the new kind

Fresh target:
  API server does not yet recognize ProviderStore

Chart-supported first phase:
  render CRD and controller, omit provider-store
  wait for CRD establishment

Second phase:
  enable provider-store
  inspect store status and test one authorized read
```

The example is illustrative, not a claim about any particular chart or cluster.

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Helm Charts: Custom Resource Definitions](https://helm.sh/docs/topics/charts/) | 2026-09-30 | Special `crds/` install ordering, plain YAML requirement, and CRD upgrade/deletion limits |
| S2 | [External Secrets Operator: Google Secret Manager](https://external-secrets.io/latest/provider/google-secrets-manager/) | 2026-09-30 | `ClusterSecretStore` workload identity service account reference and namespace requirement |
| S3 | [Google Cloud: Authenticate to Google Cloud APIs from GKE workloads](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/workload-identity) | 2026-09-30 | GKE linked-service-account annotation and impersonation binding; separate resource authorization |

## Related Notes

- [Preserve evidence across the Helm release lifecycle](helm-release-lifecycle-and-failure-evidence.md)
- [Prefer workload identity over service account key files](workload-identity-over-service-account-keys.md)
