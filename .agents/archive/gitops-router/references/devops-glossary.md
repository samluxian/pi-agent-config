# DevOps Glossary For GitOps Router

Use this only when the user wants beginner notes, concept explanations, or a learning-oriented report. Keep operational answers concise unless the user asks for teaching detail.

## Core Terms

- **Helm chart**: A package of Kubernetes templates plus default values. Helm renders it into Kubernetes manifests.
- **values.yaml**: The base input values for a chart or app. In app charts, this usually holds shared defaults.
- **values.<env>.yaml**: Environment-specific overrides, such as `values.dev.yaml`, `values.qa.yaml`, or `values.uat.yaml`.
- **values.ignore.<env>.yaml**: A preserved environment file that bootstrap discovery should not enable. Use it deliberately for migration prep or rollback reference.
- **Render**: The output of `helm template`. This is local proof of what Kubernetes manifests the repo inputs produce.
- **Manifest**: The Kubernetes YAML submitted to or stored in the cluster.
- **ArgoCD Application**: A GitOps deployment unit pointing to a repo path, target revision, value files, namespace, and sync policy.
- **Bootstrap / app-of-apps**: A parent ArgoCD Application or Helm chart that generates child Applications, often by scanning project paths and environment files.
- **Live object**: The Kubernetes object currently in the cluster, usually read with `kubectl get ... -o yaml`.
- **Source of truth**: The evidence source being trusted for a specific question. Repo values, render output, ArgoCD state, Kubernetes live state, and cloud resources answer different questions.

## Kubernetes Terms

- **Deployment**: Kubernetes controller that manages Pods and rollouts.
- **Pod**: The running unit that contains one or more containers.
- **Service**: Stable network endpoint for Pods.
- **ServiceAccount / KSA**: Kubernetes identity used by Pods.
- **GSA**: Google Service Account used for GCP API access.
- **Workload Identity**: GKE mechanism that maps KSA to GSA. Annotation alone is not proof that IAM permissions are correct.
- **ConfigMap**: Non-secret configuration. `flex-app` commonly renders `config.envs` into an env ConfigMap.
- **Secret**: Sensitive configuration such as credentials or tokens.
- **HPA**: HorizontalPodAutoscaler. It can own replica count when autoscaling is enabled.
- **PDB**: PodDisruptionBudget. `minAvailable` and `maxUnavailable` have different semantics and should be compared carefully during migration.
- **Probe**: Kubernetes health check, such as startup, readiness, or liveness.

## Common Confusions

- `ArgoCD Healthy` does not prove Redis, Pub/Sub, IAM, or app business behavior works.
- `helm template` success proves local render, not live sync success.
- `kubectl get ... -o yaml` shows live cluster state, which may include defaults or admission mutations not visible in repo values.
- Omitting a Helm map key can inherit a chart default; setting the key to `null` can explicitly clear it.
- A reference service is a pattern, not proof that another service should copy the exact same values.
- Cross-environment evidence is a hint, not target-environment proof.
