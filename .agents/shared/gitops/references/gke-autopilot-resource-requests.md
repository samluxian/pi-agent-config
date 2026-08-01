# GKE Autopilot Resource Requests

Use this reference when tuning GKE Autopilot CPU or memory requests, or when an
Argo CD sync fails with a GKE Warden admission message about resource requests.

## Rules

- Separate general resource ratio checks from scheduling-behavior minimums.
- For ordinary Autopilot Pods on the default general-purpose compute platform,
  keep CPU and memory within the documented CPU:memory ratio. When a request is
  below the valid ratio, Autopilot usually increases the smaller request at
  admission time, which can make Argo CD show desired-vs-live drift.
- For Pods that use scheduling or eviction controls, such as pod anti-affinity
  or workload separation, first satisfy the special minimum request. On the
  default Autopilot compute platform this minimum is:
  - CPU: `500m`
  - Memory: `0.5Gi`
- Pod anti-affinity is a special case: when the request is below the special
  minimum, GKE Warden rejects the Pod instead of mutating the request upward.
- Check the actual compute configuration before applying the default-platform
  numbers. Built-in or custom ComputeClasses can have different minimums.

## Practical Sizing

- `2Gi` memory on ordinary Autopilot Pods requires about `308m` CPU by the
  default CPU:memory ratio. Prefer a readable value above the floor, such as
  `350m`, to avoid admission mutation and Argo CD drift.
- `1Gi` memory on ordinary Autopilot Pods requires about `154m` CPU. Prefer a
  readable value above the floor, such as `200m`.
- `512Mi` memory on ordinary Autopilot Pods can fit under `100m`, but if the Pod
  uses pod anti-affinity, CPU still must be at least `500m`.
- Tune memory request from usage history separately from CPU. Lowering memory
  request changes HPA memory-utilization math; lowering memory limit changes OOM
  risk. Do not lower limits as part of request-only cost tuning unless the user
  explicitly approves that risk.

## Diagnostic Pattern

If Argo CD reports `SyncFailed` with a message like:

```text
cpu requests '100m' is lower than the Autopilot minimum required of '500m' for using pod anti affinity
```

then the first fix to evaluate is restoring the affected Pod's CPU request to at
least `500m`, or explicitly removing or softening pod anti-affinity if the user
accepts the scheduling availability tradeoff.

## Cost View

The GKE workload cost page is useful for ranking workloads by cost after
Autopilot admission has applied resource rules. Treat it as prioritization
evidence, not as the only source for request values; still verify utilization,
HPA behavior, and admission constraints.

Reference: <https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-resource-requests>
