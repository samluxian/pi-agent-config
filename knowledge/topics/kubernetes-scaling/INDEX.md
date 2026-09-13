# kubernetes-scaling Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| gke-scheduling-autoscaling-and-spot-capacity | fundamental | verified | cluster-autoscaler, gke, requests, scheduling, spot-vm, taints | pending-pod, scale-from-zero, specialized-node-pool | Kubernetes schedules Pods from requests and placement constraints, while GKE cluster autoscaling can add only node capacity that satisfies those constraints and Spot capacity can disappear without availability guarantees. | [Note](../../notes/fundamentals/gke-scheduling-autoscaling-and-spot-capacity.md) |
| single-autoscaler-ownership | fundamental | verified | autoscaling, hpa, keda, replicas, scaledobject, scaletargetref | autoscaler-conflict, hpa-keda-conflict, multiple-hpas | Independent replica writers can override each other, while one HPA or one KEDA ScaledObject can combine several scaling signals for a workload. | [Note](../../notes/fundamentals/single-autoscaler-ownership.md) |
