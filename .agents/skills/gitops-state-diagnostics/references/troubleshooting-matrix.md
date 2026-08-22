# Troubleshooting Matrix

Use this matrix after framing the diagnostic loop. Pick one row, run its first
probe, interpret the result, then stop or route through the stated gate. Do not
scan every row.

| Symptom | Working hypothesis | First probe | Interpretation | Stop / route gate |
| --- | --- | --- | --- | --- |
| Unknown symptom or missing scope | No reliable layer can be selected until the requested conclusion and affected identity are known | Resolve expected versus actual behavior, environment, service/workload, and incident window from existing evidence; ask for only the single blocking fact | Missing frame data blocks the probe and yields no health conclusion; once resolved, select one row below | Stop for the blocking fact instead of compensating with broad repo, cluster, or log searches |
| Argo CD `OutOfSync` | Desired/live drift versus failed reconciliation or admission | `diagnostics_flow.sh argocd <app> <namespace>` | Named sync resource or operation message supports the delivery/controller layer; current `Synced`/`Healthy` rejects current OutOfSync as the cause; unreadable app/status is an inconclusive validation gap | Stop on a sufficient sync/admission cause; expand only to the named resource or controller message |
| Helm/render mismatch | Values/chart inputs produce the wrong resource or fail before live reconciliation | `diagnostics_flow.sh helm-json <release> <chart> <ns> <env>` | Render failure supports an input/schema/chart cause; a field mismatch names the target resource; matching fields reject the render layer | Stop on render failure or mismatch; route to desired state only for the named input, or live state only when render is correct |
| Live Deployment mismatch | Controller/admission output differs from the expected render | Compare a targeted Deployment JSON summary with the expected render | Selector, labels, image, envFrom, or service account differences support live mutation/drift; matching fields reject the Deployment spec as the cause | Stop on the sufficient differing field; expand only to its controller, admission, or desired-state owner |
| Pod unhealthy (`Pending`, image/config errors, `CrashLoopBackOff`, `OOMKilled`, probe failure, `Ready=False`) | Kubernetes lifecycle/startup failure versus application/dependency failure | `.agents/skills/runtime-dependency-diagnostics/scripts/k8s_pod_failure_summary.sh --context <ctx> --namespace <ns> --pod <pod>` | Conditions, container state/lastState, and events classify scheduling/image/config/probe/resource failures; a container that started and then logged an error supports application/dependency failure; Pod phase alone is inconclusive | Stop on a supported lifecycle cause; route an application-level result to `$runtime-dependency-diagnostics`, and inspect source only after image-to-revision mapping satisfies its source/runtime entry gate |
| Pods are Ready but a Service/API is unavailable | Service selection/readiness routing versus application or downstream failure | Targeted Service selector, EndpointSlice, and matching-Pod summary | Empty or mismatched ready endpoints support selector/readiness/targetPort routing; expected endpoints reject that path but do not prove the application or downstream is healthy | Stop on the endpoint mismatch; otherwise route to the named application dependency or service topology |
| Runtime error in a running container | Application/dependency or source/runtime contract failure rather than Kubernetes startup failure | Time-bounded `kubectl logs ... --tail=100 --since=<window>` or filtered error tail | A concrete error names one dependency or code/runtime contract question; a window outside retained logs is `no coverage`; empty or unrelated lines are inconclusive | Route to `$runtime-dependency-diagnostics`; inspect only the deployed source revision when its source/runtime entry gate is met, then stop on a supported immediate trigger and fix surface |
| GitLab pipeline failure | One delivery stage failed before later stages could run | `diagnostics_flow.sh gitlab-pipeline <project> <pipeline-id>` | Failed stage/job and compact key lines identify pre-check, build, test/package, GitOps update, legacy deploy, or downstream; missing trace/auth is an inconclusive validation gap | Stop at the first failing layer; for source/build failure hand off the job, revision, compact error, and named file without crossing to desired/live state; read more trace only when compact lines are inconclusive |
| Workload Identity/Secret readiness | A prerequisite binding, API, role, or resource reference is missing | `diagnostics_flow.sh wi --project ...` | A failed check supports the named prerequisite cause; all checks passing proves only those prerequisites, not application access or runtime health | Stop on a missing prerequisite; route to runtime evidence only when delivery readiness is already proven |
| Static MR readiness | Desired-state discovery, values, chart metadata, or CI handoff is incomplete | `audit_gitops_tree.sh <repo>` plus `git diff --stat` | Static gaps support repo-readiness failure; a clean audit does not prove render, sync, or runtime readiness | Stop when the requested claim is static readiness; cross layers only when changed paths require stronger proof |

Kubernetes interpretation follows the official [Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/): Pod phase is a high-level summary, while conditions and container states carry the diagnostic split. For Service failures, the official [Pod debugging guide](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/#debugging-services) starts by verifying EndpointSlices and Pods matching the Service selector.

## Springcloud-Aile Tag Pre-Check

Use this branch only when a `springcloud-aile` tag pipeline fails in
`pre-check` before `build-images` and `update-k8s-deploy-*` run.

Inspect the `manage-tags.sh` parser line first. Accepted forms are:

```text
{env}-v{major}.{minor}.{patch}
{env}-v{major}.{minor}.{patch}-{build}
```

For example, `uat-v1.1.8-202605291004` matches while
`uat-1.1.8-202605291004` does not. Re-read the current parser before treating
this recorded pattern as authoritative.

## Gateway / Nacos registry split-brain during phased migration

Use this route when a gateway reports `Unable to find instance for <service>`
or selected migrated services are unreachable even though their pods are Ready.
This is common when child services move to a new registry before the gateway is
migrated.

First check:

```bash
for svc in aile-service-gateway <target-service>; do
  kubectl --context <context> exec -n <namespace> deploy/$svc -c $svc -- \
    sh -c 'env | grep -E "NACOS_(DISCOVERY|CONFIG)_SERVER_ADDR|NACOS_SP" | sort'
done
```

Decisive fields:

- `NACOS_DISCOVERY_SERVER_ADDR`
- `NACOS_CONFIG_SERVER_ADDR`
- `NACOS_SP`
- target service pod readiness and actual pod env, not only ConfigMap/Secret
  existence

Rules:

- Gateway and all services it routes to must use the same Nacos registry during
  a phased migration.
- Do not remove legacy inline Nacos env from migrated child services before the
  gateway is migrated to the same registry.
- If only selected services should be fixed without affecting non-migrated
  services, align those selected services to the registry currently used by the
  gateway, then later migrate gateway and services together.

Risks:

- Switching the gateway first can break non-migrated services that still
  register to the legacy Nacos.
- Cleaning child-service inline env first can move those services to a different
  Nacos and make the gateway unable to discover them.
- Argo CD can still show `Synced`/`Healthy` while runtime discovery is split
  across registries; verify live pod env and gateway logs before concluding.
