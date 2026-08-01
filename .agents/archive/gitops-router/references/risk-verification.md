# Risk To Verification Map

Use this reference before saying a GitOps delivery migration or values change is ready. Match each changed surface to the corresponding verification. Do not claim checks were run if they were not.

| Risk / Changed Surface | Verification |
| --- | --- |
| ServiceAccount or Workload Identity changed | Verify KSA name, GSA annotation, metadata identity, token acquisition, and API-specific IAM roles. |
| `config.envs`, `envFrom`, or any `null` override changed | Render the ConfigMap and Deployment env sources; compare against live env if already deployed. |
| `values.<env>.yaml` was added, deleted, or renamed | Verify bootstrap discovery and prove there is no unintended duplicate Application. |
| Service name, port, selector, or annotations changed | Compare rendered Service and live Service, then confirm downstream callers or ingress/NEG expectations. |
| HPA changed | Compare min/max replicas and CPU/memory metrics; confirm whether Deployment replicas are HPA-owned. |
| PDB changed | Compare `minAvailable` versus `maxUnavailable` against live state and old render. |
| probes, resources, strategy, affinity, or labels changed | Compare Deployment render and live rollout behavior. |
| Redis, Pub/Sub, OTEL, secrets, or mounted files changed | Verify read-only runtime behavior from Pod logs, live env, and external control-plane evidence. |
| ArgoCD is `Synced`/`Healthy` | Still inspect repo path, target revision, value files, rendered/live resource specs, Pod readiness, and relevant dependency checks. |

## Readiness Rule

If a changed surface cannot be verified because of credentials, network, missing tools, or safety limits, report it as a missing check or accepted risk. Do not hide it behind `Healthy`, `Synced`, or a successful local render.

Before saying a branch is `commit-ready`, apply the harder gate in `commit-ready.md`. This file maps risks to checks; `commit-ready.md` decides whether the full branch is ready.

## Useful Live Verification Snippets

Current image tag from the live Deployment:

```bash
kubectl -n <namespace> get deploy <release> \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Running Pod images, using the Deployment selector when labels are uncertain:

```bash
kubectl -n <namespace> get deploy <release> \
  -o jsonpath='{.spec.selector.matchLabels}{"\n"}'
kubectl -n <namespace> get pods -l app.kubernetes.io/name=<release> \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'
```

Legacy direct env versus shared-chart ConfigMap env:

```bash
kubectl -n <namespace> get deploy <release> \
  -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{"="}{.value}{"\n"}{end}'
kubectl -n <namespace> get configmap <release>-env \
  -o jsonpath='{.data.LOG_LEVEL}{"\n"}'
```

ServiceAccount and Workload Identity annotation:

```bash
kubectl -n <namespace> get sa <service-account> \
  -o jsonpath='{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'
kubectl -n <namespace> get deploy <release> \
  -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'
```

Old/new Service and endpoint comparison:

```bash
kubectl -n <namespace> get svc <new-service> <old-service> -o wide
kubectl -n <namespace> get endpoints <new-service> <old-service>
kubectl -n <namespace> get svc <new-service> <old-service> -o yaml \
  | rg -n "name:|cloud.google.com/neg|selector:|port:|targetPort:"
```

PDB shape check:

```bash
kubectl -n <namespace> get pdb <release> \
  -o jsonpath='{.spec.minAvailable}{"\n"}{.spec.maxUnavailable}{"\n"}{.status.currentHealthy}{"/"}{.status.desiredHealthy}{"\n"}'
```
