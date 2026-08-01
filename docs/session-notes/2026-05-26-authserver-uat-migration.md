# 2026-05-26 Authserver UAT Migration

## Purpose

- Analyze newly pulled `authserver` service and plan UAT migration from legacy Helm CI deployment to `k8s-deploy` flex-app managed by ArgoCD.

## Current Status

- Status: investigation checkpoint, no migration patch applied.
- Working directory: `/home/samlu/repos`
- Service repo: `workspace-repos/authserver`, branch `release` and clean, protected/shared branch for edits.
- Deploy repo: `workspace-repos/k8s-deploy`, branch `main` and clean, protected/shared branch for edits.

## Completed

- Classified current UAT controller as legacy Helm CI, not ArgoCD.
- Confirmed `authserver/.gitlab-ci.yml` publishes UAT image on `uat-v...` tag and then runs `helm upgrade --install` for release `authserver-uat` in namespace `newaile`.
- Confirmed no `k8s-deploy/newaile/authserver` desired-state folder exists yet.
- Rendered the service-owned Helm chart locally for UAT with a placeholder image tag.
- Checked UAT live state after context switch:
  - context: `gke_aile-main-uat_asia-east1_newaile-uat`
  - live Deployment/Service: `newaile/auth-server`
  - Helm release: `authserver-uat`, chart `authserver-0.1.0`, revision 6, deployed
  - live image: `asia-docker.pkg.dev/aile-infra/aile-services/auth-server:uat-v5.0.0-202604031128`
  - Deployment ready: 2/2
  - ServiceAccount: `otel-collector`
  - referenced JWT Secret: `auth-jwt-config`, keys `private-key.pem` and `public-key.pem`
  - no matching ArgoCD Application found for `authserver`, `auth-server`, or `auth`
  - no HPA/PDB found for `app.kubernetes.io/name=auth-server`

## Changed Files

- Added this note only.

## Verification

- Ran repo preflight for `authserver`, `k8s-deploy`, and workspace root.
- Ran local `helm template` against `workspace-repos/authserver/helm/authserver` with UAT values and deployment-time overrides.
- Ran read-only UAT `kubectl get` checks for live Deployment, Service, ServiceAccount, Secret metadata/keys, HPA/PDB, and ArgoCD Application lookup.
- Ran read-only `helm list -n newaile --filter '^authserver-uat$'`.

## Next Steps

- Create non-protected work branches before patching:
  - in `workspace-repos/k8s-deploy`: `git switch -c DEVOPS-<id>/authserver-uat-flex-app`
  - in `workspace-repos/authserver`: `git switch -c DEVOPS-<id>/authserver-uat-gitops-handoff`
- Proposed downstream files:
  - `newaile/authserver/Chart.yaml`
  - `newaile/authserver/values.yaml`
  - `newaile/authserver/values.uat.yaml`
  - possibly `bootstrap/values.yaml` override for `authserver` namespace/releaseName.
- Proposed upstream CI change:
  - keep `publish-uat` image build/push.
  - replace or disable UAT legacy `helm upgrade` deploy path.
  - add k8s-deploy trigger/update job for `TARGET_FOLDER: newaile/authserver`, `DEPLOY_ENV: uat`, `NEW_TAG: $IMAGE_TAG`.
- Initial flex-app target should preserve legacy names/selectors:
  - ArgoCD Application folder/name: `authserver`
  - Helm releaseName override: `authserver-uat`
  - `nameOverride` and `fullnameOverride`: `auth-server`
  - Service name: `auth-server`
  - Deployment selector: `app.kubernetes.io/name=auth-server`, `app.kubernetes.io/instance=authserver-uat`
  - ServiceAccount create disabled, name `otel-collector`
  - HPA and PDB disabled initially to avoid behavior drift from legacy chart.

## Risks And Notes

- `gcloud config get-value project` still returned `aile-main-development`; use explicit `--project aile-main-uat` or switch gcloud project before GCP prerequisite checks.
- Sensitive environment values exist in the service-owned Helm/Nacos files. Do not copy sensitive values into `k8s-deploy` ConfigMaps; use ExternalSecret or an agreed existing-secret reference.
- The current JWT keys are in an existing Kubernetes Secret. Migration can either mount existing `auth-jwt-config` to minimize cutover risk, or move to flex-app `secretFiles` backed by Secret Manager after GCP prerequisites are proven.
- UAT Service has NEG annotation/status on `auth-server`; keep service name, port, selector, and annotation behavior stable.
- One unsafe Secret query accidentally requested `.data` during investigation. The final report and this note do not include secret values. Consider rotation if policy treats agent-side secret exposure as requiring rotation.

## Suggested Skills

- `gitops-delivery-workflow`
- `session-memory`
