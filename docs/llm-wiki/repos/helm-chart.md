# helm-chart

`helm-chart` is the shared Helm chart source repository.

Current local path:

```text
/home/samlu/devops-repos/helm-chart
```

## Role

This repo owns reusable chart behavior. For this wiki's current scope, the most
important chart is:

```text
charts/flex-app
```

`helm-chart` does not prove which service is deployed or which chart version a
service wrapper uses. Service wrapper charts in `k8s-deploy` choose dependency
versions.

## Important Layout

| Path | Meaning |
| --- | --- |
| `charts/flex-app/Chart.yaml` | Shared `flex-app` chart identity and current chart source version. |
| `charts/flex-app/values.yaml` | Public values contract and defaults. |
| `charts/flex-app/values.schema.json` | Machine-checkable values schema. |
| `charts/flex-app/templates/` | Kubernetes object rendering logic. |

## First Checks

```bash
git -C /home/samlu/devops-repos/helm-chart branch --show-current
git -C /home/samlu/devops-repos/helm-chart status --short --untracked-files=all
sed -n '1,120p' /home/samlu/devops-repos/helm-chart/charts/flex-app/Chart.yaml
find /home/samlu/devops-repos/helm-chart/charts/flex-app/templates -maxdepth 1 -type f | sort
```

## Source Evidence

- `/home/samlu/devops-repos/helm-chart/charts/flex-app/Chart.yaml`
- `/home/samlu/devops-repos/helm-chart/charts/flex-app/values.yaml`
- `/home/samlu/devops-repos/helm-chart/charts/flex-app/values.schema.json`
- `/home/samlu/devops-repos/helm-chart/charts/flex-app/templates/`
