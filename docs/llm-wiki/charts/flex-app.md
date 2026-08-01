# flex-app

`flex-app` is the shared Helm chart used by service wrapper charts to render
common Kubernetes application resources.

Source path:

```text
/home/samlu/devops-repos/helm-chart/charts/flex-app
```

## Current Source Version

The local chart source currently declares:

```yaml
name: flex-app
version: 3.4.0
```

This is the chart source version. Individual services in `k8s-deploy` may still
depend on older published versions through their wrapper `Chart.yaml`.

## Core Contract

`flex-app` turns values into common app resources:

| Area | Values Surface | Rendered Intent |
| --- | --- | --- |
| Workload | `deployment.*` | Kubernetes `Deployment`. |
| ConfigMap env | `config.envs` scalar values | ConfigMap-backed environment variables. |
| Secret env | `config.envs` objects with `remoteRef` | ExternalSecret-backed environment variables. |
| Config files | `config.configFiles` | ConfigMap files mounted into the Pod. |
| Secret files | `config.secretFiles` | ExternalSecret files mounted into the Pod. |
| Autoscaling | `autoscaling.*` | KEDA `ScaledObject`. |
| Service | `services.*` | One or more Kubernetes `Service` resources. |
| ServiceAccount | `serviceAccount.*` | Kubernetes `ServiceAccount` and optional Workload Identity annotation. |
| PDB | `pdb.*` | `PodDisruptionBudget`. |

## Important Defaults

The current `values.yaml` defaults include:

```yaml
nameOverride: "{{ .Release.Name }}"
fullnameOverride: "{{ .Release.Name }}"

deployment:
  enabled: true

autoscaling:
  enabled: true
  minReplicaCount: 2
  maxReplicaCount: 5
  profiles:
    cpu:
      enabled: true
      targetUtilizationPercentage: 80
```

This means service owners should be explicit when a workload should not use the
default CPU autoscaling behavior.

## Global Values

`flex-app` consumes global environment facts:

| Value | Used For |
| --- | --- |
| `global.envName` | Default labels/selectors, env-aware config resolution, common env values. |
| `global.gcpProjectId` | Workload Identity examples and Pub/Sub autoscaling Prometheus endpoint construction. |

Pub/Sub autoscaling requires `global.gcpProjectId` because the chart builds the
Google Managed Service for Prometheus server address from the project ID.

## Templates

Current template files:

```text
_helpers.tpl
configmap-env.yaml
configmap-files.yaml
deployment.yaml
external-secret-env.yaml
external-secret-files.yaml
pdb.yaml
scaledobject.yaml
service.yaml
serviceAccount.yaml
validate.yaml
```

## Wrapper Version Rule

Do not assume a service uses the latest local `flex-app` source version. Check:

```text
/home/samlu/devops-repos/k8s-deploy/<project>/<service>/Chart.yaml
```

Example evidence from `newaile/aile-service-gateway/Chart.yaml`:

```yaml
dependencies:
  - name: flex-app
    version: 3.3.0
    alias: stable
```

## Source Evidence

- `/home/samlu/devops-repos/helm-chart/charts/flex-app/Chart.yaml`
- `/home/samlu/devops-repos/helm-chart/charts/flex-app/values.yaml`
- `/home/samlu/devops-repos/helm-chart/charts/flex-app/templates/_helpers.tpl`
- `/home/samlu/devops-repos/helm-chart/charts/flex-app/templates/scaledobject.yaml`
- `/home/samlu/devops-repos/k8s-deploy/newaile/aile-service-gateway/Chart.yaml`
