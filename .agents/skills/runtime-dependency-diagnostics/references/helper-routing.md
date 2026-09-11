# Helper Routing

Choose one primary helper for the requested evidence layer. Add direct commands
only when the helper reports a concrete gap.

## Runtime Snapshot

Use when the user provides an explicit Kubernetes context and namespace. Add
`--project` only when GCP dependency evidence is required.

```bash
.agents/skills/runtime-dependency-diagnostics/scripts/runtime_dependency_snapshot.sh \
  --context <kube-context> --namespace <namespace> [--project <gcp-project>] \
  [--service <deployment-or-service>] [--topic <pubsub-topic>] \
  [--subscription-filter <filter>] [--region <region>] [--location <location>]
```

With `--service`, the helper resolves an exact Deployment first, then an exact
Service, and derives the Pod selector and ServiceAccounts from live fields. It
queries events only for the resolved workload and selected Pods. It stops instead
of guessing a label or ServiceAccount from the supplied name.

Without `--project`, treat skipped GCP checks as intentionally out of scope, not
as evidence that the dependencies are healthy.

## Pod Failure Summary

Use when one named pod is unhealthy and the question is whether the cause is
Kubernetes lifecycle state or application behavior.

```bash
.agents/skills/runtime-dependency-diagnostics/scripts/k8s_pod_failure_summary.sh \
  --context <kube-context> --namespace <namespace> --pod <pod> \
  [--container <container>] [--logs] [--tail 100] [--since 10m] \
  [--max-log-bytes 16384]
```

Prefer this helper over raw `kubectl describe pod`. By default it returns only
pod phase, probe timing, conditions, container `state`/`lastState`, and pod-scoped
events. Add `--logs` only when lifecycle evidence identifies an application
question. Log output is bounded by age, lines, and UTF-8 bytes. Previous logs are
queried only when the selected container status has a restart or terminated
`lastState`. The helper does not print env, Secret values, ConfigMap payloads,
full pod YAML, or full describe output; application logs can still contain
sensitive data, so quote only the necessary summary.

## Desired-State Inventory

Use for local Helm-style service directories when the question is dependency
ownership or environment coverage rather than live health.

```bash
.agents/skills/runtime-dependency-diagnostics/scripts/runtime_desired_state_inventory.sh \
  --root <desired-state-root> [--services <svc1,svc2>] [--envs <dev,qa,uat,prod>]
```

## Incident Report

When the user requests an incident report or RD handoff, read
`incident-report-contract.md` and use `../assets/runtime-incident-report-template.md`.
Do not load the report asset during ordinary diagnosis.

Helper use is complete when its compact output answers the requested evidence
layer or names one exact field that requires a narrower follow-up.
