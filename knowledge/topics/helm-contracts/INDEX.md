# helm-contracts Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| helm-crd-first-install-ordering | fundamental | verified | crd, custom-resource, helm, install, templates | no-matches-for-kind, first-install-crd, crd-ordering | Helm guarantees first-install CRD ordering for the crds directory, not for CRDs rendered as ordinary templates beside their custom resources. | [Note](../../notes/fundamentals/helm-crd-first-install-ordering.md) |
| helm-release-lifecycle-and-failure-evidence | fundamental | verified | atomic, helm, history, install, release, rollback, upgrade, wait | failed-release, helm-lifecycle, release-revision | Helm install, upgrade, rollback, and history operate on release revisions, while wait, atomic, cleanup, and history options determine what failure evidence remains. | [Note](../../notes/fundamentals/helm-release-lifecycle-and-failure-evidence.md) |
| shared-helm-chart-contracts | fundamental | verified | helm, json-schema, lint, semver, templates, values | chart-api, shared-chart, values-contract | A shared Helm chart exposes a values contract and a rendered-resource contract that require schema, compatibility, server, and runtime validation. | [Note](../../notes/fundamentals/shared-helm-chart-contracts.md) |
