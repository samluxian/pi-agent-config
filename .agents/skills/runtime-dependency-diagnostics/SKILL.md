---
name: runtime-dependency-diagnostics
description: Trace Kubernetes request or service failures across workloads, autoscaling, load balancing, identity, secret references, databases, queues, caches, storage, and workers. Use for time-bounded runtime incidents. Do not use for generic GitOps mismatch, static review, topology mapping, or edits.
---

# Runtime Dependency Diagnostics

Identify the failing runtime edge with bounded, read-only evidence.

## Quick Flow

1. Fix service, environment, symptom, time window, request/correlation evidence,
   and expected dependency path. Analyze supplied evidence first.
2. Build only the relevant path:
   client/LB -> Service/NEG -> Pod -> identity/config reference -> dependency ->
   worker/response.
3. Start at the symptom and inspect adjacent edges. Expand only when evidence
   identifies a concrete error, timing gap, missing reference, or health claim.
4. Compare desired wiring, live reference/identity, control-plane status, and
   bounded runtime evidence without printing secret data.
5. Separate observed mechanism, immediate trigger, source-proven design factor,
   incident causality, falsifying evidence, and supported fix surface. Complete
   the running-image-to-deployed-revision mapping before source inspection; do
   not inspect local source in parallel with that mapping.
6. Test the leading explanation against an aligned healthy or earlier-failure
   baseline before calling it causal. A count, last log, source diff, or total
   deploy duration is not a measured runtime cause by itself.
7. Stop at the first supported failing edge or next decisive check. Hand repository
   changes to the appropriate implementation workflow.

Use `references/helper-routing.md` to select helpers. Load only the relevant deep
reference:

- `references/transient-request-incidents.md` for 5XX, timeout, LB/NEG, Pod, HPA,
  events, or node-autoscaling paths.
- `references/source-runtime-contract.md` for startup and deployed source mapping.
- `references/incident-report-contract.md` when an incident report or RD handoff
  is requested; load its asset only for that deliverable.
- `references/dependency-checks.md` for identity, Secret Manager references,
  database, Pub/Sub/queue, Redis/Valkey, or storage checks.
- `references/runtime-incident-patterns.md` for recurring incident signatures.

## Stop Conditions

Stop on unresolved target identity, absent authorization, evidence outside the
window, a required secret value, a required mutation, or source that cannot be
mapped to the deployed image. Naming alone is never dependency evidence.

## Output

Report the first failing edge, observed mechanism, immediate trigger,
source-proven design factor, incident-causality grade, falsifying evidence,
uncertainty, correct fix surface, and one safe next check. Do not raise a report's
certainty above the underlying evidence. Use
`assets/runtime-incident-report-template.md` only when the user requests a
written incident report or RD handoff.
