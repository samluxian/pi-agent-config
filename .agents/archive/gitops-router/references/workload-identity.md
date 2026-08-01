# Workload Identity Reference

Use this reference when Helm values create or change Kubernetes ServiceAccount settings for GKE Workload Identity, ADC, Pub/Sub, Cloud APIs, or errors such as `iam.serviceAccounts.getAccessToken denied`.

Check these items separately:

- Kubernetes ServiceAccount name in the rendered Deployment `serviceAccountName`.
- Rendered ServiceAccount annotation `iam.gke.io/gcp-service-account`.
- GSA project and environment match the target values file.
- IAM binding allows the KSA principal to impersonate the GSA with `roles/iam.workloadIdentityUser`.
- The Pod can read the metadata server service account email and obtain an access token.
- Any API-specific role is present, such as Pub/Sub subscriber/publisher, Cloud Monitoring, Trace, or Storage.

Prefer read-only verification. Do not rotate keys, publish Pub/Sub messages, mutate Redis, or change IAM unless the user explicitly asks.

## Read-Only Checks

Rendered or live Deployment KSA:

```bash
kubectl -n <namespace> get deploy <release> \
  -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'
```

KSA annotation:

```bash
kubectl -n <namespace> get sa <ksa> -o yaml
kubectl -n <namespace> get sa <ksa> \
  -o jsonpath='{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'
```

GSA IAM binding:

```bash
gcloud iam service-accounts get-iam-policy <gsa-email> \
  --project=<project>
```

Runtime identity from a selected Pod:

```bash
kubectl -n <namespace> exec <pod> -- \
  curl -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email

kubectl -n <namespace> exec <pod> -- \
  curl -H "Metadata-Flavor: Google" \
  http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
```

These `exec` commands are read-only, but they still touch a live Pod. Use them only when runtime identity proof is needed.

## Interpretation

| Evidence | Interpretation |
| --- | --- |
| KSA annotation exists but token returns `iam.serviceAccounts.getAccessToken denied` | IAM binding is missing, wrong, or attached to the wrong GSA/KSA member. |
| Pod metadata email is wrong | Deployment `serviceAccountName` is wrong, or the selected KSA lacks the intended annotation. |
| Token works but Pub/Sub fails | Workload Identity works; API-specific IAM role or topic/subscription/project config is likely missing. |
| Rendered KSA differs from live Deployment KSA | ArgoCD/live state has not converged, or another controller changed the workload. |
| JSON key mount remains after WI migration | Confirm the app supports ADC before removing `GOOGLE_APPLICATION_CREDENTIALS` and secret mounts. |
