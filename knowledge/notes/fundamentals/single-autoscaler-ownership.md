---
id: single-autoscaler-ownership
title: Keep one autoscaling control path per scale target
type: fundamental
status: verified
topic: kubernetes-scaling
summary: Independent replica writers can override each other, while one HPA or one KEDA ScaledObject can combine several scaling signals for a workload.
when_to_read: Designing, migrating, or debugging HPA and KEDA scaling when a workload replica count changes unexpectedly or more than one scaler targets it.
keywords: [autoscaling, hpa, keda, replicas, scaledobject, scaletargetref]
aliases: [autoscaler-conflict, hpa-keda-conflict, multiple-hpas]
scope: public-source
created: 2026-09-11
updated: 2026-09-11
---

# Keep one autoscaling control path per scale target

## TL;DR

Avoid independent control loops that write the same workload's scale target.
Kubernetes documents that an HPA periodically adjusts its target's desired scale
and overrides manual replica changes. [S1] [S2] The Kubernetes HPA and scaling
documentation cited here does not state an API rule that limits a workload to
one HPA, so treat single ownership as an operational control rule rather than an
API invariant.

Combine several metrics in one HPA where possible; the HPA calculates each
recommendation and chooses the largest desired replica count. [S1] For KEDA,
combine triggers in one `ScaledObject`. KEDA handles activation from zero, and
the generated HPA handles scaling between one and N replicas. [S4] [S6]

## When To Read

- Use when a Deployment or StatefulSet replica count oscillates, returns to an
  unexpected value, or ignores a manual setting.
- Use when replacing an existing HPA with KEDA or adding event-driven metrics to
  a workload that already has autoscaling.
- Use when a chart can render both a native HPA and a KEDA `ScaledObject`.
- Do not assume KEDA and its generated HPA are competing controllers; they form
  one documented scaling path. [S4]
- Do not apply this rule to controllers that change node count or container
  resource requests instead of the workload's `/scale` subresource.

## Knowledge

### The Contended Field

The HPA controller resolves `scaleTargetRef` and periodically adjusts the target's
desired scale from observed metrics. [S1] For a Deployment, the HPA manages the
Deployment `replicas` field. The Deployment controller then distributes that
desired total across ReplicaSets during and after a rollout. [S1]

```text
metrics
  → HPA decision
  → workload /scale
  → Deployment controller
  → ReplicaSet replicas
  → Pods
```

The HPA and Deployment controller therefore have different responsibilities.
The contention risk appears when another HPA, scaler, manual action, or repeated
manifest apply also writes the workload-level replica count.

Kubernetes explicitly warns not to set replicas manually while an HPA manages a
Deployment because the HPA reconciles and overrides the change. [S2] It also
warns that applying a manifest containing `spec.replicas` while HPA is active can
produce thrashing or flapping behavior. [S3]

### Combine Signals Before Adding Writers

One HPA can evaluate more than one metric. Kubernetes calculates a desired count
for each metric and chooses the largest recommendation. [S1]

For KEDA, one `ScaledObject` can contain multiple triggers. KEDA recommends this
shape and recommends against combining a `ScaledObject` with a separate HPA for
the same workload because the HPAs compete and can produce odd scaling behavior.
[S6]

```text
Scale target: Deployment/example-worker
Control path: one ScaledObject → one generated HPA → workload /scale
Signals: queue backlog + CPU utilization
Not present: second ScaledObject, separate HPA, continuously applied spec.replicas
```

Signal consolidation does not mean every signal has equal semantics. Check each
metric type, target value, missing-data behavior, activation threshold,
stabilization window, and scale policy before combining them.

### KEDA And HPA Responsibilities

KEDA monitors event sources and feeds metrics to Kubernetes HPA. [S4] Its normal
scaling flow has two phases:

| Range | Decision owner | Inputs |
| --- | --- | --- |
| `0 ↔ 1` | KEDA operator | Scaler activation state |
| `1 ↔ N` | Generated HPA | HPA configuration and metrics exposed by KEDA |

This division is a coordinated design, not two independent writers for the same
range. A `ScaledObject` identifies a `scaleTargetRef`, and KEDA sets up an HPA for
that target from the configured triggers. [S5]

### Transferring An Existing HPA

Do not create a default KEDA HPA beside an existing HPA and expect a gradual
handoff. KEDA documents an explicit transfer mechanism:

```yaml
metadata:
  annotations:
    scaledobject.keda.sh/transfer-hpa-ownership: "true"
spec:
  advanced:
    horizontalPodAutoscalerConfig:
      name: existing-hpa
```

The custom HPA name must match the HPA that the `ScaledObject` will manage. [S4]
KEDA also exposes an annotation that disables HPA ownership validation, but its
documentation warns that disabling admission validation adds risk. Keep the
validation enabled unless a reviewed migration requires the exception. [S4] [S5]

### Desired-State Ownership

Autoscaling ownership also affects the workload manifest. If a deployment tool
continually applies `spec.replicas`, that desired-state writer can reset the HPA
result. Remove the field only with a migration plan: Kubernetes warns that a
naive removal and apply can cause a one-time drop to the default replica count.
[S3]

A bounded migration should establish:

1. which HPA or `ScaledObject` targets the workload;
2. which chart, manifest, or deployment process writes `spec.replicas`;
3. whether several metrics can move into one HPA or `ScaledObject`;
4. how an existing HPA transfers to KEDA without an overlap window;
5. how current replicas are preserved while field ownership changes;
6. which observations prove stable scale-up, scale-down, and activation behavior.

### Validation

Validate the final rendered and live ownership, not only the configuration file:

- exactly one intended HPA targets the workload;
- a KEDA-managed HPA has the expected generated or transferred identity;
- no second `ScaledObject` targets the same workload;
- continuously applied workload configuration does not reset replicas;
- HPA conditions and events show usable metrics;
- scale-up, stabilization, scale-down, and zero activation follow the declared
  thresholds and timing;
- rollout behavior remains correct while the Deployment controller distributes
  replicas across ReplicaSets.

A stable replica count during an idle test does not validate autoscaling. Exercise
at least one controlled scale-up and scale-down path, plus zero activation when
the workload permits zero replicas.

### Boundaries

- The Kubernetes HPA and scaling pages cited here do not state a native API
  prohibition against two HPAs sharing one target. Detection and rejection can
  depend on higher-level tooling.
- KEDA-specific ownership validation is not a Kubernetes API rule. Verify the
  installed KEDA version and admission-webhook configuration. [S4] [S5]
- A cluster autoscaler changes node capacity, not the workload replica target; it
  can cooperate with HPA or KEDA.
- A vertical autoscaler changes resource recommendations or requests. Its
  interactions with HPA require separate metric and resource-policy analysis.
- Multiple metrics in one HPA do not average their desired replica counts; the
  largest recommendation wins. [S1]

### Common Mistakes

- **Rendering HPA and KEDA resources independently:** KEDA creates an HPA, so an
  additional native HPA can become a second writer. [S5] [S6]
- **Keeping `spec.replicas` in a repeatedly applied manifest:** the apply path can
  reset autoscaled replicas and cause flapping. [S3]
- **Calling KEDA and HPA inherently incompatible:** KEDA relies on a generated HPA
  for normal active-range scaling. [S4]
- **Replacing an HPA by name only:** KEDA ownership transfer also requires the
  transfer annotation. [S4]
- **Disabling ownership validation as a default:** the exception removes a guard
  intended to detect unsafe HPA ownership. [S4] [S5]
- **Adding one HPA per signal:** one HPA already supports multiple metrics and
  chooses the highest replica recommendation. [S1]

### Minimal Decision Model

```text
Need CPU, memory, or custom metrics without scale-to-zero?
  → Put the metrics in one HPA.

Need event-driven activation or scale-to-zero?
  → Put the triggers in one KEDA ScaledObject.
  → Let its generated HPA own 1-to-N scaling.

Existing HPA must move to KEDA?
  → Use the documented ownership transfer.
  → Avoid an interval with two independent HPAs.

Another process must set replicas temporarily?
  → Pause or transfer autoscaling through a documented mechanism.
  → Do not race the active control loop with a manual write.
```

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Kubernetes Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/) | 2026-09-11 | HPA control-loop behavior, scale target ownership, Deployment rollout roles, and multi-metric replica selection |
| S2 | [Kubernetes Horizontal Manual Scaling for a Deployment](https://kubernetes.io/docs/tasks/run-application/scale-deployment/) | 2026-09-11 | Manual replica changes are overridden while HPA manages a Deployment |
| S3 | [Kubernetes Horizontal Pod Autoscaling task](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) | 2026-09-11 | Applied `spec.replicas` can cause autoscaling thrashing and requires a migration plan |
| S4 | [KEDA scaling Deployments, StatefulSets, and custom resources](https://keda.sh/docs/2.20/concepts/scaling-deployments/) | 2026-09-11 | KEDA-to-HPA integration, zero activation, active-range scaling, ownership transfer, and validation exception risk |
| S5 | [KEDA ScaledObject specification](https://keda.sh/docs/2.20/reference/scaledobject-spec/) | 2026-09-11 | `scaleTargetRef`, generated HPA configuration, transfer annotation, and ownership validation annotation |
| S6 | [KEDA FAQ](https://keda.sh/docs/2.20/reference/faq/) | 2026-09-11 | Multiple triggers in one scaling object and the warning against a separate HPA for the same workload |

## Related Notes

- None.
