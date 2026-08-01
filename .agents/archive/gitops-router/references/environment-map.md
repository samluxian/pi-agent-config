# Environment Map

Use this as workspace-specific context only. Verify current Kubernetes context and GCP project before relying on it for live checks.

Expected project mapping:

| Environment | GCP project |
| --- | --- |
| dev | `aile-main-development` |
| qa | `aile-main-qa` |
| uat | `aile-main-uat` |
| prod | `aile-419002` |

Read-only verification:

```bash
kubectl config current-context
gcloud config get-value project
```

If context and project disagree with the requested environment, report both values separately and stop before interpreting live evidence.
