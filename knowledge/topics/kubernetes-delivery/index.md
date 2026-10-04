# kubernetes-delivery

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Give migration Jobs one rollout-ordering owner](../../notes/fundamentals/migration-job-rollout-ordering.md) | fundamental | stable | verified | A one-time migration Job needs one lifecycle owner, explicit retry and cleanup behavior, and application-level validation before workload rollout proceeds. |
| [Select rollout strategy from the workload and volume contract](../../notes/fundamentals/stateful-volume-safe-rollouts.md) | fundamental | stable | verified | Stateful rollout safety depends on revision overlap, identity, readiness, volume access and attachment semantics, and application-level fencing. |
