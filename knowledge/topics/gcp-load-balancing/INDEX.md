# gcp-load-balancing Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| synthetic-neg-health-check-port-mismatch | incident | verified | application-load-balancer, backend-service, gke, health-check, neg | 503-no-healthy-backend, kubernetes-ready-load-balancer-unhealthy, wrong-health-check-port | A fixed health check port that differed from standalone NEG endpoint ports kept an external Application Load Balancer backend unhealthy while Kubernetes reported ready Pods. | [Note](../../notes/incidents/synthetic-neg-health-check-port-mismatch.md) |
