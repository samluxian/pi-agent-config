# Evidence Layers

LLM answers must keep deployment evidence layers separate. A fact from one layer
is not automatically true in another layer.

## Layer Order

```text
application repo / CI -> k8s-deploy desired state -> shared chart/render ->
Argo CD -> Kubernetes live state -> runtime/GCP evidence
```

## Authority Table

| Layer | Proves | Does Not Prove | First Evidence |
| --- | --- | --- | --- |
| Application repo / CI | Build intent, image creation, CI handoff logic, source-level config names. | What is currently deployed. | `.gitlab-ci.yml`, Docker/Jib config, service config source. |
| `k8s-deploy` desired state | Intended GitOps chart values, env overlays, bootstrap app discovery. | Rendered output or live cluster health by itself. | `newaile/<service>/Chart.yaml`, `values.yaml`, `values.<env>.yaml`, `bootstrap/values.<env>.yaml`. |
| Shared chart/render | Actual Kubernetes objects Helm would generate from chart plus values. | Whether Argo CD synced it or the cluster accepted it. | `helm template`, chart templates, compact manifest summary. |
| Argo CD | GitOps sync and health controller view. | Root cause of runtime failure by itself. | Argo CD app status, sync revision, comparison errors. |
| Kubernetes live state | Current workloads, Services, HPAs/ScaledObjects, Events, Pods. | Desired repo intent or GCP resource ownership by itself. | `kubectl get`, `kubectl describe` only when summary shows an issue. |
| Runtime/GCP evidence | IAM, Workload Identity, Secret Manager, Pub/Sub, Redis, buckets, load balancer, backend services. | That repo desired state is correct. | `gcloud`, resource metadata, controller status, targeted logs. |

## Answer Rule

When layers disagree, report the conflict instead of blending them. Example:

```text
`k8s-deploy` intends `autoscaling.profiles.cpu`, but the live cluster must still
be checked before claiming the workload is running with that ScaledObject.
```

## Drift-Prone Facts

These facts should be refreshed before making readiness claims:

- current branch;
- dirty working tree;
- image tag;
- Argo CD sync status;
- Pod readiness;
- live Service IP;
- GCP IAM bindings;
- Secret Manager versions;
- Pub/Sub subscription backlog;
- chart dependency versions in wrapper charts.
