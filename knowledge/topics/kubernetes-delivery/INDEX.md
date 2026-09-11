# kubernetes-delivery Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| migration-job-rollout-ordering | fundamental | verified | argocd, hooks, job, migration, sync-phase, sync-wave | database-migration-job, presync-job, rollout-ordering | A one-time migration Job needs one lifecycle owner, explicit retry and cleanup behavior, and application-level validation before workload rollout proceeds. | [Note](../../notes/fundamentals/migration-job-rollout-ordering.md) |
| stateful-volume-safe-rollouts | fundamental | verified | deployment, persistentvolume, pvc, readwriteonce, rollout, statefulset | multi-attach, rwo-rollout, volume-safe-deployment | Stateful rollout safety depends on revision overlap, identity, readiness, volume access and attachment semantics, and application-level fencing. | [Note](../../notes/fundamentals/stateful-volume-safe-rollouts.md) |
