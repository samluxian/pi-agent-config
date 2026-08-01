# Helm Release to ArgoCD Handoff

Use this reference when a service is moving from an upstream `helm upgrade` flow to `k8s-deploy`/ArgoCD, or when the user asks about Helm release secrets, ArgoCD takeover, stale Helm-managed resources, or two controllers competing for ownership.

## Evidence to collect first

Keep these layers separate:

- Upstream service repo: `.gitlab-ci.yml`, included CI templates, tag rules, direct `helm upgrade` jobs, GitOps update jobs, `TARGET_FOLDER`, `DEPLOY_ENV`, and branch refs.
- `k8s-deploy`: chart path, `Chart.yaml`, `Chart.lock`, `values.yaml`, `values.<env>.yaml`, bootstrap discovery, and target ArgoCD path.
- `flex-app` or shared chart: current package version, values defaults, templates for the failing resource, and render output.
- Rendered desired state: `helm template <release> <chart> -f values.yaml -f values.<env>.yaml`.
- ArgoCD Application: source repo/path/revision/value files, releaseName, sync status, health, operationState, syncOptions, and failed resource messages.
- Live Kubernetes resources: Deployment, Service, ConfigMap, Secret references, ServiceAccount, HPA, PDB, labels, annotations, selectors, owner metadata, and events.
- Helm release evidence: `helm list`, `helm status`, `helm get values --all`, `helm get manifest`, and Helm release secrets such as `sh.helm.release.v1.<release>.v*`.

## Decision rules

- Do not assume Helm release secrets block ArgoCD takeover. ArgoCD applies rendered manifests to Kubernetes resources; Helm secrets usually hold Helm release history and rollback metadata.
- Deleting Helm release secrets is cleanup, not the first fix, unless the confirmed blocker is Helm itself running or Helm metadata is causing a specific ownership/adoption failure.
- If both legacy CI and ArgoCD can still deploy the same environment, stop and identify the active controller first. Disable or migrate the legacy direct deploy path before declaring GitOps ownership.
- For sync errors, identify the failed Kubernetes resource and exact validation/admission error before discussing Helm secrets.
- For stale live objects, compare live object spec/metadata with desired render. Patch conflicts commonly come from old fields, immutable selectors, old service names, PDB `minAvailable` versus `maxUnavailable`, Helm annotations, or orphaned resources.
- For destructive cleanup, state the rollback impact and exact resource type, then give the user UI or runbook steps. Do not delete or mutate Kubernetes, ArgoCD, GitLab, or Git state yourself. Deleting a Helm release secret is different from deleting a live workload resource such as a PDB or Service.

## Render And Diff Interpretation

When moving from a legacy chart to `flex-app` or another shared chart, some
diff noise is expected. Treat these as normal migration signals unless they
conflict with live traffic or runtime requirements:

- chart labels changing from the service chart to the shared chart
- `ConfigMap <release>-env` plus `envFrom.configMapRef`
- checksum annotations that trigger a Deployment rollout on config changes
- a new ServiceAccount with a Workload Identity annotation
- HPA/PDB metadata labels changing while the important spec remains stable

Treat these as high-risk and verify before calling the handoff ready:

- Service name, selector, port, or NEG/LB annotation changes
- PDB changing between `minAvailable` and `maxUnavailable`
- immutable selector or label changes on a live workload
- direct Helm CI and ArgoCD both still able to deploy the same environment
- live resource deletion being needed before ArgoCD can apply the desired state

`kubectl diff` is server-aware and can expose apply conflicts. Use it to find
live transition blockers, but separate expected render differences from actual
Kubernetes validation or admission errors.

## Post-Handoff Cleanup Runbook

Only propose cleanup after proving the Application exists and points at the
expected Git source:

```bash
kubectl -n argocd get application <app> \
  -o jsonpath='{.spec.source.path}{"\n"}{.spec.source.targetRevision}{"\n"}{.status.sync.status}{"\n"}{.status.health.status}{"\n"}'
```

If a specific live resource blocks sync, identify it first and give a
user-operated command or UI step. For example, a stale PDB may need deletion so
ArgoCD can recreate it from Git:

```bash
kubectl -n <namespace> delete pdb <release>
kubectl -n <namespace> get pdb <release> -o yaml
```

Clean Helm release secrets only after ArgoCD is the active controller and the
workload is healthy. Explain that this removes legacy Helm rollback/history
metadata and does not delete workload objects:

```bash
kubectl -n <namespace> get secret -l owner=helm,name=<release>
kubectl -n <namespace> delete secret -l owner=helm,name=<release>
helm -n <namespace> list --filter '^<release>$'
```

## Recommended checks

```bash
# Upstream controller path
rg -n "helm upgrade|deploy-<env>|update-k8s-deploy|TARGET_FOLDER|DEPLOY_ENV|K8S_DEPLOY_REF" .gitlab-ci.yml .gitlab/ci

# Desired GitOps state
git status --short --branch
helm template <release> <chart-path> -f values.yaml -f values.<env>.yaml > /tmp/<release>-desired.yaml

# ArgoCD state
kubectl -n argocd get application <app> -o yaml

# Live resources
kubectl -n <namespace> get deploy,svc,cm,sa,hpa,pdb -l app.kubernetes.io/instance=<release> -o wide
kubectl -n <namespace> get <kind> <name> -o yaml

# Helm release evidence
helm -n <namespace> list --filter '^<release>$'
helm -n <namespace> status <release>
helm -n <namespace> get values <release> --all
helm -n <namespace> get manifest <release>
kubectl -n <namespace> get secret -l owner=helm,name=<release>
```

## Reporting format

Answer in this order:

1. Current active controller: legacy Helm CI, ArgoCD, or both.
2. ArgoCD desired state: repo/path/revision/value files/releaseName.
3. Live conflict: exact resource and field/metadata mismatch.
4. Helm secret role: whether it is a blocker, rollback artifact, or safe post-cutover cleanup.
5. Smallest safe path: branch-local values/CI change the agent can propose and patch only after approval, or user-operated UI/runbook action such as ArgoCD sync, live resource deletion, or Helm secret cleanup.
6. Risk: downtime, rollback loss, PDB/service protection gap, or controller race.
