# runtime-diagnostics Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| kubernetes-probe-semantics-and-startup-order | fundamental | verified | kubernetes, liveness, probe, readiness, startup | health-check, probe-order, restart-loop | Startup probes delay liveness and readiness checks, readiness controls endpoint eligibility, and liveness can restart a container without identifying its underlying failure. | [Note](../../notes/fundamentals/kubernetes-probe-semantics-and-startup-order.md) |
| synthetic-startup-restart-causality | incident | open | actuator, incident-causality, liveness, mongodb, startup | connection-refused, restart-loop, slow-startup | A liveness restart is an observed failure mechanism, while the startup blocking call remains a separate causal question. | [Note](../../notes/incidents/synthetic-startup-restart-causality.md) |
