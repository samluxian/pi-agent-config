# gcp-load-balancing

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Trace GKE load-balanced requests across control planes](../../notes/fundamentals/kubernetes-to-gcp-load-balancer-request-path.md) | fundamental | stable | verified | A GKE Application Load Balancer request crosses Google Cloud forwarding, routing, backend, health-check, NEG, and Pod layers that must be verified separately. |
| [Kubernetes readiness does not prove standalone NEG backend health](../../notes/incidents/synthetic-neg-health-check-port-mismatch.md) | incident | stable | verified | A fixed health check port that differed from standalone NEG endpoint ports kept an external Application Load Balancer backend unhealthy while Kubernetes reported ready Pods. |
