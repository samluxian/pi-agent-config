# Optional KEDA Implementation Checklist

Use this checklist only when the user explicitly chooses KEDA/event-driven
autoscaling for a service or environment. Do not assume every service should use
KEDA, and do not install KEDA as a default prerequisite for unrelated work.

## Decide Whether KEDA Is Needed

Ask for or verify the autoscaling intent first:

- Which service/workload should scale?
- Which environment is in scope?
- Which event/metric should drive scaling?
- Is existing CPU/memory HPA sufficient, or is event backlog/lag the real signal?
- Does the cluster already have KEDA installed and healthy?

Prefer no KEDA change when the request is only fixed replicas, ordinary
CPU/memory HPA tuning, or read-only diagnosis.

## Infrastructure Prerequisites

When KEDA is selected and not already installed for the target environment:

1. Add an infra chart/application for KEDA operator, CRDs, metrics server, and
   webhooks. Keep it environment-scoped; do not enable qa/uat/prod by naming
   convention or assumption.
2. For GKE/GCP metrics, use Workload Identity rather than service account key
   JSON when possible.
3. Verify the KEDA operator Kubernetes ServiceAccount annotation points to the
   intended GSA.
4. Verify IAM prerequisites read-only before declaring ready:
   - `roles/monitoring.viewer` on the metric project for Cloud Monitoring
   - `roles/iam.workloadIdentityUser` binding from the KEDA KSA to the GSA
5. Create shared auth only when useful. A cluster-wide
   `ClusterTriggerAuthentication` is appropriate when multiple namespaces or
   services will use the same KEDA GCP identity.

## Chart Design Rules

For shared application charts such as `flex-app`:

- Keep KEDA opt-in (`keda.enabled: false`) unless the user explicitly requests a
  breaking chart model change.
- Render no `ScaledObject` unless `keda.enabled=true` and triggers are present.
- KEDA `authenticationRef` belongs on each trigger in the rendered
  `ScaledObject`, not at `spec.authenticationRef`.
- If values expose a top-level `keda.authenticationRef`, treat it as a default
  and expand it into every trigger that does not define its own auth ref.
- Do not render an ordinary HPA and a KEDA `ScaledObject` for the same target.
  KEDA creates/manages its own HPA.
- If removing legacy HPA support from a shared chart, call it out as a behavior
  change: services that upgrade and do not enable KEDA will use fixed replicas.

## CPU/Memory HPA to KEDA Migration Pattern

Use this pattern only when the user explicitly asks to migrate a service from
ordinary HPA to KEDA while keeping CPU/memory utilization as the scaling signal.
Do not assume CPU/memory KEDA is better than ordinary HPA for all services.

Before editing, verify the service-specific autoscaling intent from existing
values, live HPA, ticket context, or user instruction:

- Target service and environments.
- Existing or approved min/max replicas.
- Existing or approved CPU threshold.
- Existing or approved memory threshold.
- Whether memory scaling should be added, preserved, removed, or left unset.
- Whether the service already uses a KEDA-capable chart version.

Example values shape only; do not treat these placeholders as global defaults:

```yaml
keda:
  enabled: true
  minReplicaCount: <existing-or-approved-min>
  maxReplicaCount: <existing-or-approved-max>
  pollingInterval: <approved-or-chart-default>
  cooldownPeriod: <approved-or-chart-default>
  triggers:
    - type: cpu
      metricType: Utilization
      metadata:
        value: "<existing-or-approved-cpu-threshold>"
    - type: memory
      metricType: Utilization
      metadata:
        value: "<existing-or-approved-memory-threshold>"
```

Validation must prove the migration behavior, not merely render success:

- Exactly one `ScaledObject` is rendered for the target workload.
- Zero ordinary `HorizontalPodAutoscaler` resources are rendered for the same
  workload.
- Rendered min/max and trigger thresholds match the existing or approved intent.
- The live old HPA handoff is planned before or during Argo CD sync.
- Post-sync `ScaledObject` is `READY=True` and the HPA is
  `keda-hpa-<service>` with metrics matching the intended triggers.

## GCP Pub/Sub Scaling Rules

For Pub/Sub consumer workloads, scale on subscription backlog rather than topic
name alone. Topic publish traffic is not the same as this consumer's queue.

Use `subscription/num_undelivered_messages` as the first MVP signal because it
represents queue backlog / unacked work for a subscription. Example PromQL for
Google Cloud Monitoring Prometheus API:

```promql
sum({"__name__"="pubsub.googleapis.com/subscription/num_undelivered_messages","monitored_resource"="pubsub_subscription","subscription_id"="SUBSCRIPTION_NAME"})
```

For more proactive scaling, consider a second trigger for incoming publish or
message rate only after confirming the exact Cloud Monitoring metric name,
labels, and threshold semantics in Metrics Explorer.

Threshold guidance:

```text
threshold ≈ one pod's acceptable backlog capacity
threshold = pod_messages_per_second × target_drain_seconds
```

Use low thresholds only for dev/MVP visibility. Tune higher values from load
or processing-capacity evidence.

## Existing HPA Handoff

KEDA admission webhooks reject a `ScaledObject` if the target workload is
already managed by an existing HPA. Before or during migration:

- Ensure the chart no longer renders the old HPA for that workload.
- If a live old HPA already exists, plan a controlled handoff: remove/prune the
  old HPA, then sync the `ScaledObject` so KEDA creates `keda-hpa-*`.
- In dev, a short no-HPA window is usually acceptable when fixed replicas or
  KEDA `minReplicaCount` preserve capacity; report the gap explicitly.

## GKE Autopilot / Defaulting Drift

If Argo CD shows KEDA infra OutOfSync but pods and CRDs are healthy, inspect the
specific resource diffs before patching. Common non-functional drift:

- GKE Autopilot adjusts resources, e.g. memory request `100Mi -> 103Mi` or adds
  `ephemeral-storage`.
- Kubernetes defaults fields such as deployment strategy, probe scheme, and
  fieldRef API version.
- Empty env values may be omitted in live state.

Prefer values changes to align with live GKE defaults when the diff is small and
safe. Use `ignoreDifferences` only for narrow, proven defaulting noise; never
ignore whole apps or broad Deployment specs by default.

## Validation

After changes, validate the intended behavior, not only successful rendering:

```bash
helm dependency update <service-chart>
helm template <release> <service-chart> -n <namespace> \
  -f <service-chart>/values.yaml \
  -f <service-chart>/values.<env>.yaml
```

Check for:

- `ScaledObject` is rendered only when intended.
- No ordinary HPA is rendered for the same target when KEDA is enabled.
- `authenticationRef` appears inside each trigger in the rendered
  `ScaledObject`.
- The target name matches the live Deployment.

For live verification after GitOps sync:

```bash
kubectl describe scaledobject <name> -n <namespace>
kubectl describe hpa keda-hpa-<name> -n <namespace>
kubectl logs -n keda deploy/keda-operator --since=10m | grep <scaledobject-or-service>
```

Key failure patterns:

- `Warning: unknown field "spec.authenticationRef"`: auth was rendered at the
  wrong ScaledObject level.
- `workload ... is already managed by the hpa ...`: old HPA still exists.
- Prometheus scaler `status: 401`: GCP auth is missing, mis-rendered, or Workload
  Identity/IAM is incomplete.
- HPA metric `<unknown>` with `FailedGetExternalMetric`: inspect ScaledObject
  status and KEDA operator logs before changing thresholds.
