# Source / Runtime Contract

Use this branch only after the runtime flow classifies a failure as
application-level. Source code explains the process contract and design intent;
it does not prove which configuration or artifact reached the cluster.

## Entry Gate

Enter source inspection only when at least one condition is supported:

- the container started and a bounded current or previous log points to
  bootstrap, configuration parsing, migration, health handling, or dependency
  client code;
- desired state, render, and live workload agree, but the process rejects or
  behaves differently from that delivered contract;
- a readiness or liveness failure requires confirming the application's actual
  listen address, port, or health path;
- the same deployed image/config fails consistently and lifecycle evidence does
  not support scheduling, image pull, admission, or missing resource references.

Before reading source, complete a mapping from the Pod image tag or digest to the
deployed pipeline and source revision. If the local checkout is not that exact
revision, compare the relevant source blobs before using it as evidence. Do not
inspect local source in parallel with this mapping. If the mapping cannot be
proven, stop and report artifact provenance as the next narrow check; do not
substitute the current default branch for the deployed revision.

Do not enter this branch for a sufficient Kubernetes lifecycle, Argo CD drift,
Helm render, image pull, admission, or missing Secret/ConfigMap reference cause.

## Contract Check

State one code/runtime question, then inspect only the files needed to answer it.
Typical targets are:

- Dockerfile, entrypoint, startup command, and shutdown/signal handling;
- bootstrap and configuration schema or environment-variable binding;
- listen address, container port, and health endpoint implementation;
- startup migrations and dependency initialization;
- dependency client timeout, retry, backoff, and fail-fast behavior.

Compare the four evidence columns before assigning a fix surface:

| Evidence | Question |
| --- | --- |
| Deployed source revision | What contract or behavior does this exact artifact implement? |
| Desired state | What does the service configuration intend to provide? |
| Render and live workload | What configuration and probe contract actually reached the Pod? |
| Runtime evidence | What did the process observe, reject, or do? |

Use sibling Pods with the same image/config and the last-known-good revision only
when they test the current hypothesis. Never scan the whole repository to
compensate for an unframed question.

## Causal Classification

Report these separately:

- **Immediate trigger**: the event that directly caused the current failure;
- **Contributing design factor**: source behavior that amplified or failed to
  tolerate the trigger, such as startup fail-fast without bounded retry;
- **Contract classification**: `source defect`, `delivery configuration defect`,
  `cross-layer contract mismatch`, `external/transient failure`, or
  `inconclusive`;
- **Fix surface**: application source, CI/artifact build, GitOps desired state,
  shared chart, runtime/cloud dependency, or more evidence.

For example, a database timeout can be the immediate trigger while exiting on
the first timeout without retry is a contributing source-design factor. A
healthy sibling using the same image/config weakens a global source or config
claim but does not prove the design is resilient.

## Stop Condition

Stop when one classification and fix surface are supported. If evidence is
insufficient, name the single missing artifact, source revision, log window, or
contract field. This skill remains read-only; propose the smallest fix and wait
for the appropriate approved implementation workflow.
