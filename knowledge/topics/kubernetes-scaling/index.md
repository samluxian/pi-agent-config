# kubernetes-scaling

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Connect GKE scheduling constraints to autoscaling capacity](../../notes/fundamentals/gke-scheduling-autoscaling-and-spot-capacity.md) | fundamental | stable | verified | Kubernetes schedules Pods from requests and placement constraints, while GKE cluster autoscaling can add only node capacity that satisfies those constraints and Spot capacity can disappear without availability guarantees. |
| [Keep one autoscaling control path per scale target](../../notes/fundamentals/single-autoscaler-ownership.md) | fundamental | stable | verified | Independent replica writers can override each other, while one HPA or one KEDA ScaledObject can combine several scaling signals for a workload. |
