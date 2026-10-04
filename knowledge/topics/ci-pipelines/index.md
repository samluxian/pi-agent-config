# ci-pipelines

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Bound CI concurrency without widening retry scope](../../notes/fundamentals/bounded-ci-concurrency-and-retry.md) | fundamental | stable | verified | CI capacity, job acquisition, mutual exclusion, parallel expansion, and retry are separate controls that must be sized and validated independently. |
| [Separate CI execution from Kubernetes target selection](../../notes/fundamentals/ci-runner-agent-and-cluster-context-boundaries.md) | fundamental | stable | verified | A GitLab runner executes a job, while an authorized GitLab Agent connection supplies Kubernetes contexts that select separate cluster identities and targets. |
| [Recognize the Node 24.15 and Yarn PnP EBADF regression](../../notes/fundamentals/node-24-15-yarn-pnp-ebadf.md) | fundamental | stable | verified | Node 24.15.x changed ESM loader filesystem behavior in a way that triggered Yarn PnP EBADF failures; Yarn 4.14.1 worked around it and Node 24.16.0 restored compatibility. |
| [Build and push images with rootless BuildKit in GitLab CI](../../notes/fundamentals/rootless-buildkit-in-gitlab-ci.md) | fundamental | stable | verified | GitLab CI can run daemonless rootless BuildKit and push directly to a registry when runner security policy, credential helpers, and build context are configured explicitly. |
