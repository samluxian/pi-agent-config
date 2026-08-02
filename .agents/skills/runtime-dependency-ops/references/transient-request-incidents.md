# Transient Request Incident Gate

Use this gate for a time-bounded request failure such as intermittent HTTP 5XX,
timeout, connection reset, latency spike, GraphQL error, or application error
code when the workload may be healthy by the time of inspection.

The goal is to distinguish a supported request-path failure from a correlated
infrastructure event, missing observability, or an application-level semantic
error before inspecting source.

## 1. Lock the Incident Window

Record before broad inspection:

- exact timestamp and timezone
- bounded start and end time
- symptom source: client, alert, load balancer, gateway, BFF, or backend
- host, route, method, and explicit status type when available
- trace ID or request ID when available

If the user supplies only an approximate timestamp, begin with a narrow window
such as ten minutes on either side and state that assumption. Do not widen the
window until the first probe shows a concrete boundary event or missing
coverage.

Do not call a payload value `5XX` until its field semantics are known. Separate:

- HTTP response status
- gRPC status
- GraphQL error or extension code
- application status embedded in an HTTP 200 response
- free-form numbers or words inside request or response data

## 2. Resolve Request Ownership

Resolve the live path before querying logs or metrics:

```text
host -> DNS/IP -> frontend owner project/account -> forwarding rule/listener
-> proxy or gateway -> URL/route map -> backend owner project/account
-> backend service/target group -> NEG/endpoints -> Service -> workload
```

The frontend resource, metrics, backend service, and Kubernetes workload may
belong to different projects or accounts. Never assume the workload project
owns the load balancer. Preserve the full cross-project resource reference;
do not reduce it to a basename before recording the owner.

For a GCP external Application Load Balancer, bounded discovery normally checks:

1. DNS resolution for the incident host.
2. The project that owns the matching forwarding rule or reserved address.
3. Target proxy and URL map host/path rule.
4. The full backend service self-link, including its project.
5. Backend NEG, Kubernetes Service, namespace, and workload identity.

Stop topology expansion once the actual incident path and both owners are
supported.

## 3. Classify Observability Coverage

Classify each requested layer explicitly:

| State | Meaning |
| --- | --- |
| `enabled with hits` | Logging or metrics cover the incident window and target. |
| `enabled with no matching hits` | Coverage exists, but the requested condition was not observed. |
| `disabled` | The resource is configured not to emit that evidence. |
| `outside retention/window` | The query cannot cover the event time. |
| `unknown` | Ownership, configuration, or query scope is not yet supported. |

Only the first two states can reject an observed condition. The other states are
`no coverage`, not evidence of health.

When load-balancer request logging is disabled, use platform metrics if they are
available. For GCP HTTPS load balancing, useful metric types include:

- `loadbalancing.googleapis.com/https/request_count`
- `loadbalancing.googleapis.com/https/backend_request_count`

First query all response classes for the same forwarding rule and incident
window. Positive 2XX or 3XX points establish metric coverage. With that coverage,
no 5XX series rejects an LB-observed HTTP 5XX for that rule and window. No time
series at all is `no coverage`.

A 5XX series on a shared forwarding rule does not identify the incident host by
itself. Attribute it only when backend target labels, a dedicated rule, request
logs, or trace evidence isolate the route. Do not interpret project-wide 5XX
counts before filtering to the supported frontend rule. For cross-project GCP
NEGs, group by `resource.labels.backend_target_name`; `backend_name` may be
empty even when the backend target is known.

For structured application logs, inspect schema and field types first. Aggregate
only allowlisted operational fields such as timestamp, workload, explicit
status, method, normalized route, logger, and trace correlation. A regex match
for `5xx` or `timeout` inside arbitrary payload data is a hint, not status or
network-timeout evidence. Do not print request bodies, response bodies, tokens,
query values, or user identifiers.

## 4. Test Infrastructure Correlation

Current readiness describes now, not the incident window. Use historical audit,
event, metric, and log evidence for the bounded window.

For node scale-down or replacement, check in this order:

1. autoscaler decision
2. completed node or instance deletion
3. historical target Pod placement and lifecycle
4. Pod eviction/create/delete and Endpoint, EndpointSlice, or NEG mutation
5. load-balancer 5XX, connection, node-system, or network evidence

For GKE, useful control-plane evidence includes the
`container.googleapis.com/cluster-autoscaler-visibility` log and audit methods
such as `v1.compute.instances.delete`, `io.k8s.core.v1.nodes.delete`, and
`io.k8s.core.v1.pods.eviction.create`.

Do not infer historical placement only from current Pods: current output shows
survivors and replacements. Missing mutation records are `no coverage` when the
relevant audit stream is disabled or retention does not span the event.

Classify the relationship:

| Classification | Required evidence |
| --- | --- |
| `direct` | A target Pod or endpoint was removed and an aligned request error names that target or path. |
| `indirect candidate` | Target eviction is absent, but routing, NEG draining, connection, or node-network evidence aligns with the failure. |
| `coincidental` | The removed node did not host the target path, target endpoints were stable, and covered LB metrics show no aligned 5XX. |
| `inconclusive` | Timing aligns but target-path, historical placement, or request evidence is missing. |
| `no coverage` | The required logs, metrics, audit stream, or retention are unavailable. |

An autoscaler decision and node deletion establish temporal correlation only.
Scale-down of an empty or unrelated node is expected platform behavior, not a
root cause by itself.

## 5. Gate the Source Pivot

Do not inspect application source because an infrastructure event happened at a
similar time or because request logs are missing. Enter
`source-runtime-contract.md` only when application-level evidence identifies a
specific code/runtime contract question and the running image maps to its
deployed revision.

If source evidence later shows missing retry, draining, timeout, or connection
handling, report it as a contributing design factor unless evidence proves it
was the immediate trigger.

## Evidence Budget And Stop Rule

Use at most these initial probes:

1. request entrance ownership plus log/metric coverage
2. target workload and endpoint history for the incident window
3. one named infrastructure candidate correlated to explicit request evidence

Stop when the condition is supported or rejected. If unresolved, report the
single missing artifact that would change the classification, such as an exact
status field, owner project, trace ID, audit stream, or backend metric series.
