# helm-contracts

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Install CRDs before their custom resources](../../notes/fundamentals/helm-crd-first-install-ordering.md) | fundamental | stable | verified | Helm guarantees first-install CRD ordering for the crds directory, not for CRDs rendered as ordinary templates beside their custom resources. |
| [Preserve evidence across the Helm release lifecycle](../../notes/fundamentals/helm-release-lifecycle-and-failure-evidence.md) | fundamental | stable | verified | Helm install, upgrade, rollback, and history operate on release revisions, while wait, atomic, cleanup, and history options determine what failure evidence remains. |
| [Treat a shared Helm chart as a versioned API](../../notes/fundamentals/shared-helm-chart-contracts.md) | fundamental | stable | verified | A shared Helm chart exposes a values contract and a rendered-resource contract that require schema, compatibility, server, and runtime validation. |
