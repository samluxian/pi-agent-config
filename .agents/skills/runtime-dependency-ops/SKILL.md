---
name: runtime-dependency-ops
description: "Trace an existing Kubernetes service failure or runtime dependency path across Pods, application startup/source-runtime contracts, identity, secret references, databases, queues, caches, storage, and workers. Use for application runtime wiring and health evidence. Do not use for generic GitOps delivery mismatches, static source review, repo topology, or implementation."
---

# Runtime Dependency Ops

Use this skill for read-only runtime diagnostics and dependency wiring checks
when a service spans Kubernetes, cloud resources, external data stores, queues,
and desired-state configuration.

## Rules

- Always identify environment, namespace, project/account, and service before
  drawing conclusions. If the user only provides a pod, resource, or screenshot,
  derive those fields first.
- For queues and Pub/Sub, checking only existence is insufficient. Also check
  topic binding, subscription/consumer binding, filter/routing attributes,
  deadletter policy, ack/visibility timeout, and project/account.
- A Kubernetes Lease only proves leader election. It does not prove downstream
  Pub/Sub, database, Redis, bucket, or internal service dependencies are healthy.
- Treat `kubectl describe pod` and `kubectl logs` as different evidence:
  describe/events explain Kubernetes lifecycle failures; logs explain
  application stdout/stderr failures. Do not dump full describe output or broad
  logs before a pod summary identifies the failing path.
- Treat application source as design and intent evidence, not proof of the
  deployed artifact or live configuration. Never analyze the default branch as
  a substitute for the source revision mapped from the running image.

## Quick Flow

1. Resolve environment, namespace, project/account, and target service. Complete
   only when all four identities are supported by evidence.
2. Identify pod, Deployment, HPA, current image tag or digest, and recent events.
   Complete when workload health and rollout identity are known or an unavailable
   field is reported.
3. When a pod is `Pending`, `ImagePullBackOff`, `ErrImagePull`,
   `CreateContainerConfigError`, `CrashLoopBackOff`, `OOMKilled`, probe-failing,
   or `Ready=False`, run the pod failure summary before raw `describe` or log
   expansion. Use status/events for Kubernetes lifecycle causes, then use
   current or `--previous` logs only when the container has started or restarted.
   Complete when the failure is classified as lifecycle or application-level.
4. For an application-level failure, state one code/runtime contract question
   and read `references/source-runtime-contract.md`. Enter source inspection only
   through its evidence gate, first map the running image to the deployed source
   revision, and report the immediate trigger separately from any contributing
   design factor. Complete when the contract classification and fix surface are
   supported or the single provenance/evidence gap is named.
5. If a worker is involved, check the Lease holder and recent holder logs.
   Complete when leadership and actual processing health are reported separately.
6. Check dependency wiring in the narrowest order needed:
   ServiceAccount/IAM, secret references, database, queue/Pub/Sub,
   Redis/Valkey/cache, and bucket/object storage. Complete when each dependency
   examined has its reference, target resource, environment, and health evidence
   accounted for.
7. Stop when the first supported cause is found. Report the next narrow check
   only if the cause is still ambiguous.

## Helper Routing

Read `references/helper-routing.md` before selecting a helper:

- Use the runtime snapshot for an explicit context/namespace and optional GCP
  dependency scope.
- Use the pod failure summary for one unhealthy pod.
- Use the desired-state inventory for local Helm-style service directories.

Helper selection is complete when one primary helper matches the requested
evidence layer, or the response names why direct targeted commands are smaller.

## References

- For dependency-specific checks, read `references/dependency-checks.md`.
- For application-level failures that meet the source evidence gate, read
  `references/source-runtime-contract.md`.
- For incident interpretation patterns, read `references/runtime-incident-patterns.md`.

## Output

```text
結論:
環境/Scope:
失敗階段:
Artifact / source revision: (source gate only)
證據:
直接原因:
設計因素: (when supported)
Contract classification:
Fix surface:
Next narrow check:
維運建議:
```

For a generic delivery mismatch, use `$gitops-diagnostics-workflow`; for an
unknown repo-to-repo topology, use `$service-delivery-topology`.
