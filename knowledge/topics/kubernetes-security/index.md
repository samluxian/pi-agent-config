# kubernetes-security

| Concept | Type | Status | Evidence status | Description |
| --- | --- | --- | --- | --- |
| [Combine Kubernetes tenancy boundaries instead of trusting namespaces alone](../../notes/fundamentals/kubernetes-namespace-service-account-and-tenancy-boundaries.md) | fundamental | stable | verified | Kubernetes namespaces scope names and policy objects, but workload tenancy also depends on ServiceAccounts, RBAC, network policy, quotas, admission, and node or control-plane isolation. |
