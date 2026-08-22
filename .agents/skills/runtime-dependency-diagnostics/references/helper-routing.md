# Helper Routing

Choose one primary helper for the requested evidence layer. Add direct commands
only when the helper reports a concrete gap.

## Runtime Snapshot

Use when the user provides an explicit Kubernetes context and namespace. Add
`--project` only when GCP dependency evidence is required.

```bash
.agents/skills/runtime-dependency-diagnostics/scripts/runtime_dependency_snapshot.sh \
  --context <kube-context> --namespace <namespace> [--project <gcp-project>] \
  [--service <service>] [--topic <pubsub-topic>] [--subscription-filter <filter>] \
  [--region <region>] [--location <location>]
```

Without `--project`, treat skipped GCP checks as intentionally out of scope, not
as evidence that the dependencies are healthy.

## Pod Failure Summary

Use when one named pod is unhealthy and the question is whether the cause is
Kubernetes lifecycle state or application behavior.

```bash
.agents/skills/runtime-dependency-diagnostics/scripts/k8s_pod_failure_summary.sh \
  --context <kube-context> --namespace <namespace> --pod <pod> \
  [--container <container>] [--tail 100] [--since 10m] [--no-logs]
```

Prefer this helper over raw `kubectl describe pod`. It summarizes pod phase,
conditions, container `state`/`lastState`, pod-scoped events, current logs, and
previous logs without printing env, Secret values, ConfigMap payloads, full pod
YAML, or full describe output.

## Desired-State Inventory

Use for local Helm-style service directories when the question is dependency
ownership or environment coverage rather than live health.

```bash
.agents/skills/runtime-dependency-diagnostics/scripts/runtime_desired_state_inventory.sh \
  --root <desired-state-root> [--services <svc1,svc2>] [--envs <dev,qa,uat,prod>]
```

Helper use is complete when its compact output answers the requested evidence
layer or names one exact field that requires a narrower follow-up.
