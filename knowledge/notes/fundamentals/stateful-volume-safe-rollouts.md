---
id: stateful-volume-safe-rollouts
title: Select rollout strategy from the workload and volume contract
type: fundamental
status: verified
topic: kubernetes-delivery
summary: Stateful rollout safety depends on revision overlap, identity, readiness, volume access and attachment semantics, and application-level fencing.
when_to_read: A Kubernetes rollout uses persistent volumes, cannot tolerate concurrent revisions, reports multi-attach errors, or needs a choice between Deployment and StatefulSet.
keywords: [deployment, persistentvolume, pvc, readwriteonce, rollout, statefulset]
aliases: [multi-attach, rwo-rollout, volume-safe-deployment]
scope: public-source
created: 2026-09-11
updated: 2026-09-11
---

# Select rollout strategy from the workload and volume contract

## TL;DR

A Deployment `RollingUpdate` intentionally allows old and new Pods to overlap;
`maxSurge` and `maxUnavailable` control that overlap. A Deployment `Recreate`
stops existing Pods before creating new ones during an upgrade, but Kubernetes
limits that guarantee to upgrades and does not promise application-level safety.
[S1]

`ReadWriteOnce` means read-write mounting from one node, not one Pod. Multiple
Pods on that node can still access the volume. `ReadWriteOncePod` restricts a PVC
to one Pod across the cluster when the CSI path supports it. [S3] Choose the
controller, rollout strategy, access mode, and application fencing from the same
concurrency contract.

## When To Read

- Use when a workload writes persistent state during rollout.
- Use when old and new revisions cannot run concurrently.
- Use when Pods report volume attachment or mount delays.
- Use when deciding between Deployment and StatefulSet.
- Use when a PDB is expected to serialize rollout.
- Do not assume `ReadWriteOnce` enforces one-Pod access.
- Do not assume `Recreate` prevents every overlap caused by manual deletion,
  node failure, or a terminating process.

## Knowledge

### Start With Application Concurrency

Ask these questions before selecting a controller:

1. Can old and new versions write the same state concurrently?
2. Does each replica need a stable identity or its own volume?
3. What proves the old writer has stopped?
4. Does the application provide leader election, fencing, or transactional
   ownership?
5. Can the storage driver attach the volume to the scheduled node within the
   rollout deadline?
6. Does readiness mean the new writer is safe, or only that its process started?

Storage access mode alone cannot answer these questions.

### Deployment RollingUpdate

During a rolling update, a Deployment can create a new Pod before deleting an old
Pod. `maxSurge` controls how many Pods may exist above the desired replica count,
and `maxUnavailable` controls how many may be unavailable. [S1]

```text
old revision still running
  + new revision starting
  = intentional overlap window
```

This is useful for stateless availability and for stateful applications that
explicitly support concurrent revisions. It is unsafe when one writer, one
mounted volume, or one incompatible schema version must remain exclusive.

Setting surge to zero reduces extra Pods but does not replace application-level
analysis. Termination, readiness, and scheduler timing still determine the
observed sequence.

### Deployment Recreate

With `strategy.type: Recreate`, Kubernetes kills existing Pods before creating
new Pods during a Deployment upgrade. Kubernetes warns that this termination
before creation guarantee applies only to upgrades. A manually deleted Pod can
be replaced while the old Pod is still terminating. [S1]

Use Recreate only when:

- planned upgrade downtime is acceptable;
- termination completes before a new writer becomes active;
- the application releases locks and storage cleanly;
- failure recovery does not require concurrent old/new versions;
- manual intervention and controller replacement paths are understood.

Recreate removes the normal rolling-upgrade overlap. It does not provide fencing,
data consistency, or proof that the old process stopped external writes.

### StatefulSet RollingUpdate

StatefulSet gives Pods stable identity and can associate storage per replica. Its
RollingUpdate proceeds from the largest ordinal to the smallest, one Pod at a
time, and waits for an updated Pod to become Running and Ready before updating
its predecessor. [S2]

This order is useful when replica identity and readiness are meaningful. It does
not prevent a Ready process from corrupting shared state, guarantee leader
handoff, or repair an incompatible application protocol.

### Volume Access Modes

Kubernetes defines these relevant modes: [S3]

| Mode | Documented scope | Important boundary |
| --- | --- | --- |
| `ReadWriteOnce` | Read-write by one node | Multiple Pods on that node may access it |
| `ReadWriteOncePod` | Read-write by one Pod cluster-wide | CSI support and required component versions apply |
| `ReadOnlyMany` | Read-only by many nodes | Does not allow writers |
| `ReadWriteMany` | Read-write by many nodes | Application must coordinate writers |

Except for `ReadWriteOncePod`, access modes primarily match and constrain volume
use; they are not general write-protection guarantees after mount. Actual behavior
depends on the volume plugin and storage system. [S3]

### Binding, Scheduling, And Attachment

PVC-to-PV binding is exclusive and one-to-one, but that binding does not mean the
volume is already attached to the node where a Pod schedules. [S3]

Attachable-volume limits can leave a Pod waiting when a node reaches its driver
limit. Kubernetes honors limits reported by CSI drivers during scheduling. [S4]
A rollout can therefore fail because of node placement or attachment capacity
even when the PVC and Pod specifications are valid.

Inspect these as separate events:

```text
PVC bound
  → Pod scheduled
  → volume attached to node
  → volume mounted in Pod
  → application opened state
  → readiness became true
```

### PDB Boundary

A PodDisruptionBudget limits simultaneous unavailability from voluntary
disruptions that use the Eviction API. It cannot prevent involuntary disruptions,
and workload controllers are not constrained by PDBs during rolling upgrades.
[S5]

Use a PDB to express voluntary-disruption availability, not rollout serialization
or storage exclusivity. Configure rollout behavior on the workload controller and
writer ownership in the application/storage design.

### Strategy Matrix

| Workload contract | Starting strategy | Required additional proof |
| --- | --- | --- |
| Concurrent revisions are safe | Deployment RollingUpdate | Surge/unavailability and backward compatibility |
| No planned revision overlap | Deployment Recreate | Shutdown, fencing, downtime, and replacement behavior |
| Stable identity and per-replica storage | StatefulSet RollingUpdate | Ordinal readiness and application replication semantics |
| One Pod must mount one PVC | `ReadWriteOncePod` where supported | CSI capability and failure recovery |
| Several writers share storage | RWX-capable volume | Application locking and consistency model |

This matrix selects a starting point, not a universal answer.

### Validation

Before rollout:

- document whether old and new revisions may coexist;
- inspect controller strategy, surge, unavailability, and readiness settings;
- inspect PVC ownership and requested access mode;
- verify actual CSI support and per-node attachment limits;
- test graceful shutdown, lock release, leader handoff, and retry behavior;
- confirm the PDB is not being used as a rollout-order substitute.

During rollout:

- observe old/new Pod overlap and termination completion;
- track PVC binding, scheduling, attach, and mount events separately;
- verify readiness occurs only after safe state access;
- stop on multi-attach, stale writer, split-brain, or repeated rescheduling;
- inspect application-level ownership, not only Pod phase.

After rollout:

- verify data integrity and writer identity;
- test controlled restart and node movement;
- verify rollback compatibility with the current data format;
- confirm voluntary disruption behavior separately through the Eviction API.

### Boundaries

- RWO is node-scoped and can permit several Pods on one node. [S3]
- RWOP is Pod-scoped but depends on CSI support and cannot guarantee application
  correctness. [S3]
- Recreate's ordering guarantee is limited to Deployment upgrades. [S1]
- StatefulSet readiness ordering does not provide application fencing. [S2]
- A bound PVC is not proof of successful node attachment or mount.
- PDBs do not control workload-controller rolling upgrades. [S5]

### Common Mistakes

- **Reading RWO as one Pod:** Kubernetes explicitly allows same-node multi-Pod
  access. [S3]
- **Using RollingUpdate for a single writer:** surge creates an overlap window.
  [S1]
- **Treating Recreate as a lock:** external writes can continue until shutdown
  and fencing complete.
- **Selecting StatefulSet only because a PVC exists:** stable identity and
  per-replica semantics should drive the controller choice.
- **Treating Ready as storage-safe:** readiness must test the condition the next
  rollout step depends on.
- **Using a PDB to serialize rollout:** workload controllers are not limited by
  PDBs during rolling upgrades. [S5]
- **Debugging only the PVC:** scheduling and CSI attachment limits can block later
  stages. [S4]

### Minimal Decision Model

```text
Can old and new writers coexist safely?
  → Yes: evaluate RollingUpdate surge and readiness.
  → No: evaluate Recreate or an ordered StatefulSet plus application fencing.

Need Kubernetes-enforced one-Pod PVC mounting?
  → Evaluate ReadWriteOncePod and CSI support.

Pod is pending with a bound PVC?
  → Check scheduling and attachment limits, not only binding.

Need voluntary-disruption protection?
  → Add a PDB, but configure rollout ordering separately.
```

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) | 2026-09-11 | RollingUpdate overlap, surge/unavailability, Recreate behavior, and upgrade-only caveat |
| S2 | [Kubernetes StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) | 2026-09-11 | Reverse-ordinal, one-at-a-time, readiness-gated rolling updates |
| S3 | [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) | 2026-09-11 | PVC/PV binding, access modes, RWO/RWOP semantics, and enforcement limits |
| S4 | [Kubernetes node-specific volume limits](https://kubernetes.io/docs/concepts/storage/storage-limits/) | 2026-09-11 | Scheduler handling of attachable-volume and CSI-reported limits |
| S5 | [Kubernetes disruptions](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/) | 2026-09-11 | PDB scope, involuntary disruptions, and rolling-upgrade boundary |

## Related Notes

- [Give migration Jobs one rollout-ordering owner](migration-job-rollout-ordering.md)
