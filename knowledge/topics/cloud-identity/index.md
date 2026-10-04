# cloud-identity

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Evaluate Google Cloud IAM access by policy layer](../../notes/fundamentals/gcp-iam-policy-evaluation.md) | fundamental | stable | verified | Google Cloud access depends on principal identity, inherited allow policies, applicable deny policies, principal access boundaries, and service-specific support rather than one role binding alone. |
| [Authorize a Kubernetes CI runner to push to Artifact Registry](../../notes/fundamentals/runner-identity-for-artifact-registry.md) | fundamental | stable | verified | A Kubernetes CI job can use its service account and Workload Identity Federation to obtain short-lived credentials while repository-level IAM authorizes Artifact Registry pushes. |
| [Prefer workload identity over service account key files](../../notes/fundamentals/workload-identity-over-service-account-keys.md) | fundamental | stable | verified | Workload Identity Federation for GKE supplies short-lived workload credentials while IAM policies retain explicit authorization boundaries. |
