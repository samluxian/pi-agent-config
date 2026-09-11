# LLM Wiki Topic Index

Select the topic that matches the current problem. Do not batch-load note bodies
from this index.

| Topic | Keywords | When to search | Index |
| --- | --- | --- | --- |
| ci-pipelines | concurrency, gitlab-ci, resource-group, retry, runner, scheduling | Diagnosing runner saturation, serializing critical jobs, sizing parallel work, or limiting retry scope | [Index](topics/ci-pipelines/INDEX.md) |
| cloud-identity | gke, iam, kubernetes-service-account, service-account-key, wif-gke, workload-identity | Designing GKE workload access, replacing exported service account keys, or reviewing Kubernetes-to-IAM authorization | [Index](topics/cloud-identity/INDEX.md) |
| gitops-delivery | applications-get, argocd, ci-cd, deployment, gitops, image-digest, rbac, reconciliation, status | Designing or migrating delivery flows where CI updates desired state, reads deployment status, or uses a GitOps controller | [Index](topics/gitops-delivery/INDEX.md) |
| helm-contracts | chart-api, helm, json-schema, semver, templates, values | Maintaining shared Helm values, schemas, templates, dependencies, and rendered-resource compatibility | [Index](topics/helm-contracts/INDEX.md) |
| kubernetes-delivery | hooks, job, migration, persistentvolume, rollout, statefulset | Ordering one-time Jobs or selecting workload rollout behavior around state and persistent volumes | [Index](topics/kubernetes-delivery/INDEX.md) |
| kubernetes-scaling | autoscaling, hpa, keda, replicas, scaledobject, scale-target | Designing or debugging workload autoscaling ownership, multi-metric scaling, KEDA handoffs, or unexpected replica changes | [Index](topics/kubernetes-scaling/INDEX.md) |
| llm-agents | agent, context-window, knowledge-retrieval, llm-wiki, markdown, progressive-disclosure, token | Designing or searching agent-readable Markdown knowledge, indexes, or context controls | [Index](topics/llm-agents/INDEX.md) |
| logging-observability | audit-logs, cloud-logging, exclusions, log-router, sampling, sinks | Changing log routing or sampling while preserving failure evidence and understanding missing query results | [Index](topics/logging-observability/INDEX.md) |
| runtime-diagnostics | connection-refused, incident, liveness, pod, probe, restart, root-cause, startup | Investigating runtime incidents, startup failures, evidence grades, falsifiers, or fix validation | [Index](topics/runtime-diagnostics/INDEX.md) |
| terraform-state | import, moved-block, ownership, removed-block, resource-address, state, terraform | Planning or reviewing resource address refactors, imports, cross-state ownership handoffs, or non-destructive state migrations | [Index](topics/terraform-state/INDEX.md) |
