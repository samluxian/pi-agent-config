# runtime-diagnostics

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Assign one purpose to each Kubernetes probe](../../notes/fundamentals/kubernetes-probe-semantics-and-startup-order.md) | fundamental | stable | verified | Startup probes delay liveness and readiness checks, readiness controls endpoint eligibility, and liveness can restart a container without identifying its underlying failure. |
| [A liveness restart does not establish the startup root cause](../../notes/incidents/synthetic-startup-restart-causality.md) | incident | draft | open | A liveness restart is an observed failure mechanism, while the startup blocking call remains a separate causal question. |
