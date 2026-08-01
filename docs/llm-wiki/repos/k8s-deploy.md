# k8s-deploy

`k8s-deploy` is the GitOps desired-state repository for Kubernetes workloads and
platform components.

Current local path:

```text
/home/samlu/devops-repos/k8s-deploy
```

## Role

This repo owns desired deployment intent, not application source code and not
live cluster truth. It is the place to inspect:

- wrapper chart dependencies;
- base service values;
- environment overlays;
- bootstrap discovery and Argo CD Application generation inputs;
- infra chart desired state.

## Important Layout

| Path | Meaning |
| --- | --- |
| `bootstrap/` | App-of-apps chart inputs for environment-specific Argo CD child Applications. |
| `bootstrap/values.yaml` | Shared bootstrap defaults and per-project overrides. |
| `bootstrap/values.dev.yaml` | Dev environment facts such as `envName` and `gcpProjectId`. |
| `bootstrap/values.qa.yaml` | QA environment facts. |
| `bootstrap/values.uat.yaml` | UAT environment facts. |
| `bootstrap/values.prod.yaml` | Prod environment facts. |
| `newaile/<service>/Chart.yaml` | Service wrapper chart and dependency version. |
| `newaile/<service>/values.yaml` | Shared service deployment shape. |
| `newaile/<service>/values.<env>.yaml` | Environment-specific image tag, config, Secret Manager refs, ServiceAccount annotations, and overrides. |
| `infra/` | Shared platform components such as KEDA, External Secrets, Nacos, reloader, and GitLab Runner Terraform chart desired state. |
| `aileai/` | AileAI service desired state. |

## Bootstrap Contract

Bootstrap values provide shared environment facts and project-level overrides.
The current bootstrap values use an `envDefault` anchor with:

```yaml
gcpProjectId: ""
tags:
  isDev: false
  isQa: false
  isUat: false
  isProd: false
```

Environment overlays set concrete values such as:

```yaml
global:
  envName: dev
  gcpProjectId: aile-main-development
```

Those values are later consumed by child charts such as `flex-app` through
`.Values.global.envName` and `.Values.global.gcpProjectId`.

## Example Wrapper

`newaile/aile-service-gateway/Chart.yaml` currently depends on `flex-app` through
the alias `stable`:

```yaml
dependencies:
  - name: flex-app
    version: 3.3.0
    alias: stable
```

The wrapper's shared values define workload shape such as image repository,
probes, resources, autoscaling profiles, Services, and ServiceAccount name.
Environment overlays define env-specific config, image tag, load balancer IP,
and Workload Identity annotation.

## First Checks

Use these before editing or answering deployment questions:

```bash
git -C /home/samlu/devops-repos/k8s-deploy branch --show-current
git -C /home/samlu/devops-repos/k8s-deploy status --short --untracked-files=all
find /home/samlu/devops-repos/k8s-deploy/newaile/<service> -maxdepth 1 -type f | sort
sed -n '1,160p' /home/samlu/devops-repos/k8s-deploy/newaile/<service>/Chart.yaml
```

For Helm behavior, use a compact render summary instead of pasting full rendered
manifests.

## Source Evidence

- `/home/samlu/devops-repos/k8s-deploy/bootstrap/values.yaml`
- `/home/samlu/devops-repos/k8s-deploy/bootstrap/values.dev.yaml`
- `/home/samlu/devops-repos/k8s-deploy/bootstrap/values.qa.yaml`
- `/home/samlu/devops-repos/k8s-deploy/bootstrap/values.uat.yaml`
- `/home/samlu/devops-repos/k8s-deploy/bootstrap/values.prod.yaml`
- `/home/samlu/devops-repos/k8s-deploy/newaile/aile-service-gateway/Chart.yaml`
- `/home/samlu/devops-repos/k8s-deploy/newaile/aile-service-gateway/values.yaml`
- `/home/samlu/devops-repos/k8s-deploy/newaile/aile-service-gateway/values.dev.yaml`

## Known Caution

The local `k8s-deploy` working tree may contain unrelated user changes. Always
inspect its branch and status before using it as current-state evidence.
