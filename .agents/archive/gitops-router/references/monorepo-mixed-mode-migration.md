# Monorepo Mixed-Mode Migration

Use this reference when a monorepo is moving services one by one from a legacy
direct Helm deploy to per-service GitOps/ArgoCD, while developers continue to
deploy the shared environment.

## Core Model

Keep these ideas separate:

- Legacy Helm deploy is incremental by service. It uses `CHANGED_SERVICES` and
  usually updates only the matched `services.<key>.imageTag` entries while
  reusing existing Helm release values.
- GitOps update is incremental by target folder. It compares `TARGET_FOLDERS`
  with `CHANGED_SERVICES` and updates only matched `values.<env>.yaml` files.
- ArgoCD reconcile is full-app desired-state reconciliation. It compares the
  whole Application render, but it does not mean every service tag changes or
  every pod rolls out.
- A shared commit short SHA image tag across multiple services is normal in a
  monorepo. Prove deployment from `CHANGED_SERVICES`, values changes, Helm
  command flags, ArgoCD desired state, and live images.

## Mixed-Mode Checklist

For each migrated service and environment, verify all of these:

- `k8s-deploy` has the service folder and `values.<env>.yaml`.
- Bootstrap or App-of-Apps discovers exactly one ArgoCD Application for the
  service.
- Upstream GitOps update includes the service folder in `TARGET_FOLDERS`.
- Legacy deploy excludes the full service name in `DEPLOY_EXCLUDED_SERVICES`.
- Legacy Helm render disables the chart key in `HELM_DISABLED_SERVICES`.
- Current legacy Helm manifest no longer renders the migrated service.
- Live Kubernetes resources match the GitOps/flex-app shape and expected image.

## Pipeline Investigation

For a specific GitLab pipeline, collect:

```bash
glab api projects/<project-id>/pipelines/<pipeline-id>
glab api projects/<project-id>/pipelines/<pipeline-id>/jobs --paginate
glab api projects/<project-id>/jobs/<pre-check-job-id>/trace \
  | rg -n "Branch-based|Detected changed services|CHANGED_SERVICES|FROM_COMMIT|TO_COMMIT"
glab api projects/<project-id>/jobs/<gitops-update-job-id>/trace \
  | rg -n "CHANGED_SERVICES|TARGET_FOLDERS|queued|No GitOps target folders matched|TARGET_FILE|CURRENT_VALUE|UPDATED_VALUE"
glab api projects/<project-id>/jobs/<deploy-job-id>/trace \
  | rg -n "Deploying to environment|Services to deploy|helm upgrade|--set services\\.|imageTag|rollout|SUCCESS"
```

Interpretation:

- If a service is absent from `CHANGED_SERVICES`, its tag should not change.
- If no `TARGET_FOLDERS` match, the GitOps update job should skip without
  changing `k8s-deploy`.
- If legacy `helm upgrade` lacks `--set services.<migrated-key>.enabled=false`,
  that revision may temporarily render the migrated service again.
- If the later deployed Helm revision disables the service and the current live
  manifest is GitOps-shaped, treat the older revision as a past transient
  conflict rather than a current blocker.

## Helm Revision Investigation

When a pipeline may have raced with ArgoCD, compare the pipeline-time revision
with the current deployed revision:

```bash
helm history <legacy-release> -n <namespace> --max 10
helm get values <legacy-release> -n <namespace> --revision <suspect-revision> --all
helm get manifest <legacy-release> -n <namespace> --revision <suspect-revision> | rg -n "<service-name>"
helm get values <legacy-release> -n <namespace> --all
helm get manifest <legacy-release> -n <namespace> | rg -n "<service-name>"
kubectl -n <namespace> get deploy <service-name> \
  -o jsonpath='{.metadata.labels.helm\.sh/chart}{"\n"}{.metadata.annotations.meta\.helm\.sh/release-name}{"\n"}{.spec.template.spec.serviceAccountName}{"\n"}{.spec.template.spec.containers[*].image}{"\n"}{.status.readyReplicas}{"\n"}'
```

Report four facts separately:

- Whether the suspect pipeline actually rendered or deployed the migrated
  service.
- Whether it changed that service's image tag or only re-rendered an old tag.
- Whether a later Helm revision disabled the service again.
- Whether current live Kubernetes state has any remaining conflict.

## Reporting

Use this shape for mixed-mode findings:

```text
結論:
- current impact | past transient only | active conflict

證據:
- pipeline: CHANGED_SERVICES and key job result
- legacy Helm: suspect revision versus current revision
- GitOps/ArgoCD/live: current controller shape and image

流程影響:
- what still uses incremental legacy deploy
- what now uses GitOps update plus ArgoCD reconcile

下一步:
- smallest CI/values change or no action
```
