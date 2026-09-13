# ci-pipelines Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| bounded-ci-concurrency-and-retry | fundamental | verified | concurrency, gitlab-ci, resource-group, retry, runner, scheduling | ci-capacity, job-throttling, retry-isolation | CI capacity, job acquisition, mutual exclusion, parallel expansion, and retry are separate controls that must be sized and validated independently. | [Note](../../notes/fundamentals/bounded-ci-concurrency-and-retry.md) |
| ci-runner-agent-and-cluster-context-boundaries | fundamental | verified | gitlab-agent, gitlab-ci, kubeconfig, kubernetes, runner | cluster-context, kas, runner-routing | A GitLab runner executes a job, while an authorized GitLab Agent connection supplies Kubernetes contexts that select separate cluster identities and targets. | [Note](../../notes/fundamentals/ci-runner-agent-and-cluster-context-boundaries.md) |
