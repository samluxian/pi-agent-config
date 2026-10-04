# Incidents

- [Kubernetes readiness does not prove standalone NEG backend health](synthetic-neg-health-check-port-mismatch.md): A fixed health check port that differed from standalone NEG endpoint ports kept an external Application Load Balancer backend unhealthy while Kubernetes reported ready Pods.
- [A liveness restart does not establish the startup root cause](synthetic-startup-restart-causality.md): A liveness restart is an observed failure mechanism, while the startup blocking call remains a separate causal question.
