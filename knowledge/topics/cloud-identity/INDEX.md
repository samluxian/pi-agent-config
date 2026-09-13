# cloud-identity Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| gcp-iam-policy-evaluation | fundamental | verified | allow-policy, deny-policy, gcp, iam, impersonation, resource-hierarchy | access-evaluation, iam-inheritance, policy-binding | Google Cloud access depends on principal identity, inherited allow policies, applicable deny policies, principal access boundaries, and service-specific support rather than one role binding alone. | [Note](../../notes/fundamentals/gcp-iam-policy-evaluation.md) |
| workload-identity-over-service-account-keys | fundamental | verified | gke, iam, kubernetes-service-account, service-account-key, token, workload-identity | keyless-workload-auth, wif-gke, workload-identity-federation | Workload Identity Federation for GKE supplies short-lived workload credentials while IAM policies retain explicit authorization boundaries. | [Note](../../notes/fundamentals/workload-identity-over-service-account-keys.md) |
