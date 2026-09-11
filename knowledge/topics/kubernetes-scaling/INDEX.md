# kubernetes-scaling Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| single-autoscaler-ownership | fundamental | verified | autoscaling, hpa, keda, replicas, scaledobject, scaletargetref | autoscaler-conflict, hpa-keda-conflict, multiple-hpas | Independent replica writers can override each other, while one HPA or one KEDA ScaledObject can combine several scaling signals for a workload. | [Note](../../notes/fundamentals/single-autoscaler-ownership.md) |
