---
id: bounded-ci-concurrency-and-retry
title: Bound CI concurrency without widening retry scope
type: fundamental
status: verified
topic: ci-pipelines
summary: CI capacity, job acquisition, mutual exclusion, parallel expansion, and retry are separate controls that must be sized and validated independently.
when_to_read: Diagnosing runner saturation, limiting concurrent GitLab jobs, serializing a deployment, expanding a matrix, or choosing the smallest safe retry unit.
keywords: [concurrency, gitlab-ci, resource-group, retry, runner, scheduling]
aliases: [ci-capacity, job-throttling, retry-isolation]
scope: public-source
created: 2026-09-11
updated: 2026-09-11
---

# Bound CI concurrency without widening retry scope

## TL;DR

GitLab exposes separate controls for runner execution capacity, job-request
polling, project-local mutual exclusion, parallel job creation, and failed-job
retry. `concurrent` limits jobs across one GitLab Runner process, while `limit`
applies to one registered runner entry. `request_concurrency` limits concurrent
requests for new jobs, not running jobs. [S1]

Use `resource_group` when one concurrency-sensitive operation must run at a time.
It is a mutex, not an arbitrary N-slot semaphore. [S2] Keep retry at the smallest
job boundary that can run safely again; GitLab's `retry` keyword applies to one
job and allows zero, one, or two retries. [S3]

## When To Read

- Use when jobs remain pending despite idle-looking runner capacity.
- Use when parallel package or test jobs exhaust CPU, memory, network, or an
  external service quota.
- Use when deployment or state-changing jobs must not overlap across pipelines.
- Use when a failed matrix entry should retry without rerunning unrelated work.
- Do not change `request_concurrency` to control the number of running jobs.
- Do not add retries until the operation is idempotent or has a bounded recovery
  rule.

## Knowledge

### Control Layers

| Layer | GitLab control | Scope | What it does not prove |
| --- | --- | --- | --- |
| Runner process | `concurrent` | All registered runners in that process | Project fairness or job-request throughput |
| Registered runner | `limit` | One `[[runners]]` entry | Host capacity outside that runner entry |
| Job acquisition | `request_concurrency` | Concurrent requests for new jobs | Running-job capacity |
| Critical section | `resource_group` | Matching jobs in one project | Arbitrary N-slot throttling |
| Job expansion | `parallel` / matrix | Instances created by one job definition | Runner capacity |
| Failure handling | `retry` | One failed job | Pipeline-wide rollback or idempotency |

GitLab Runner documents `concurrent` as the maximum number of jobs running across
all registered runners in the process. The per-runner `limit` narrows one
registered runner, with zero meaning no additional limit. [S1]

`request_concurrency` controls how many requests for new jobs can be active. A
runner can have enough execution slots but acquire work slowly, or acquire work
quickly and then saturate its execution slots. Treat these as different symptoms.
[S1]

### Capacity Before Parallelism

The `parallel` keyword creates several job instances in one pipeline. A matrix
creates instances with different variable combinations. [S3] Fan-out raises
demand; it does not add runner CPU, memory, disk, network bandwidth, or external
quota.

Before increasing fan-out, estimate the peak demand of one job and multiply it by
the maximum simultaneous instances. Include helper containers, image pulls,
package caches, artifact uploads, and retries. The smallest useful model is:

```text
peak demand
  = active jobs
  × per-job CPU, memory, disk, and network demand
  + runner and service overhead
```

If one resource is the bottleneck, bound concurrency where that resource is
owned. A runner-wide limit protects a host. A registered-runner limit protects a
specific executor pool. A project pipeline may need a structural split when only
one job class should be throttled.

### Mutual Exclusion

Jobs with the same `resource_group` key are mutually exclusive across pipelines
in one project. One starts while the others wait for the group. [S2]

```yaml
deploy:
  resource_group: example-environment
  script:
    - ./deploy
```

This is suitable for a deployment, state writer, or other one-at-a-time critical
section. It does not provide four slots or another arbitrary capacity. If a
workload needs N-way throttling rather than serialization, use runner capacity,
separate deterministic queues, or another scheduler with an explicit N-slot
contract.

Resource groups also have process modes. The default `unordered` mode does not
guarantee execution order. Other modes favor older, newer, or newest-ready
pipelines, and the newest-first modes require idempotent jobs. [S2] Select order
from delivery semantics rather than assuming queue order follows pipeline time.

### Retry Isolation

GitLab's `retry` setting reruns a failed job zero, one, or two times and can limit
retry to selected failure classes or exit codes. [S3]

```yaml
package-component:
  retry:
    max: 1
    when:
      - runner_system_failure
      - scheduler_failure
```

A retry is safe only when repeating that job cannot duplicate an irreversible
side effect or hide a deterministic failure. Build, test, package, publish, and
deploy stages often need different retry policies.

Keep independently recoverable work in separate job instances. If several
components share one large job, one transient failure repeats every completed
component. Splitting the work preserves per-component retry but can increase
concurrency, so pair isolation with a capacity limit.

### Diagnosis

Separate three common symptoms:

1. **Pending jobs:** inspect runner matching, runner availability, `concurrent`,
   per-runner `limit`, and resource-group queues.
2. **Slow acquisition:** inspect job-request behavior and
   `request_concurrency`; do not infer host saturation from polling alone.
3. **Running-job failures:** inspect host/container pressure, executor errors,
   external quotas, and whether matrix expansion exceeded the capacity model.

Pipeline duration alone cannot identify the layer. A lower concurrency limit can
increase queue time while reducing failures and total retries.

### Validation

- Confirm the effective runner process configuration and every registered-runner
  limit.
- Compare active and pending jobs with host CPU, memory, disk, and network use.
- Confirm that `resource_group` protects only the intended critical section.
- Exercise the selected process mode with overlapping pipelines.
- Verify matrix expansion produces the expected number of job instances.
- Inject one retryable and one non-retryable failure and confirm only the intended
  job reruns.
- Measure completion time, failure rate, queue time, and retry count together.

### Boundaries

- `concurrent` is runner-process-wide, not project-wide. [S1]
- `limit` cannot create capacity beyond the runner host or executor platform.
- `request_concurrency` changes job acquisition, not execution slots. [S1]
- `resource_group` provides one-at-a-time exclusion, not N-way throttling. [S2]
- `parallel` increases job instances but does not reserve capacity. [S3]
- `retry` is not a substitute for idempotency, cleanup, or rollback. [S3]

### Common Mistakes

- **Raising `request_concurrency` to run more jobs:** it changes request polling,
  while `concurrent` and `limit` still bound execution. [S1]
- **Adding matrix entries without a capacity model:** the pipeline can move from
  queue-bound to resource-bound failure.
- **Using a resource group for general throughput:** unrelated work becomes
  serialized behind one critical section.
- **Assuming `unordered` means first-in-first-out:** the default process mode has
  no ordering guarantee. [S2]
- **Retrying every failure:** deterministic script errors consume capacity again
  and delay useful jobs.
- **Combining all components in one retry unit:** one transient failure repeats
  successful work and widens the blast radius.

### Minimal Decision Model

```text
Need to cap all jobs on one Runner process?
  → Set and validate concurrent.

Need to cap one registered runner entry?
  → Set and validate limit.

Need one critical operation at a time?
  → Use one resource_group and choose its process mode.

Need more job instances?
  → Use parallel or matrix only after checking capacity.

Need transient-failure recovery?
  → Retry the smallest idempotent job for selected failure modes.
```

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [GitLab Runner advanced configuration](https://docs.gitlab.com/runner/configuration/advanced-configuration/) | 2026-09-11 | Runner-wide concurrency, per-runner limits, and job-request concurrency |
| S2 | [GitLab resource groups](https://docs.gitlab.com/ci/resource_groups/) | 2026-09-11 | Mutual exclusion, waiting behavior, process modes, and ordering constraints |
| S3 | [GitLab CI/CD YAML syntax reference](https://docs.gitlab.com/ci/yaml/) | 2026-09-11 | `parallel`, matrix expansion, resource groups, and job-scoped retry behavior |

## Related Notes

- [Replacing direct deployment with a GitOps handoff](direct-deploy-to-gitops-handoff.md)
