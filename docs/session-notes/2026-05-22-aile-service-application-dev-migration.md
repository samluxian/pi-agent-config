# 2026-05-22 Aile Service Application Dev Migration

## Purpose

- Migrate `aile-service-application` dev delivery from the legacy `springcloud-aile` Helm release path to `k8s-deploy/newaile/aile-service-application` managed by Argo CD and `flex-app`.

## Current Status

- Status: local desired-state and CI handoff changes are prepared and rendered successfully; not committed or pushed.
- `k8s-deploy` working directory: `/home/samlu/repos/workspace-repos/k8s-deploy`
- `k8s-deploy` branch: `DEVOPS-149/aile-service-application-dev-flex-app`
- `springcloud-aile` working directory: `/home/samlu/repos/workspace-repos/springcloud-aile`
- `springcloud-aile` branch: `feature/DEVOPS-149-aile-service-application-ci-update`

## Completed

- Confirmed dev cluster context was `gke_aile-main-development_asia-east1_newaile-dev`.
- Confirmed `gcloud` active project was still `aile-main-uat`; all GCP checks were run with explicit `--project=aile-main-development`.
- Confirmed `dev-aile-service-application@aile-main-development.iam.gserviceaccount.com` exists.
- Confirmed Workload Identity binding on that GSA for `serviceAccount:aile-main-development.svc.id.goog[newaile/aile-service-application]`.
- Confirmed runtime roles on the GSA: `roles/pubsub.editor`, `roles/logging.logWriter`, `roles/monitoring.metricWriter`, and `roles/cloudtrace.agent`.
- Confirmed Secret Manager secret `dev-aile-service-application` exists with an enabled version; secret value was not read.
- Confirmed `ClusterSecretStore/gcp-secret-manager` is Ready, points at `aile-main-development`, uses KSA `external-secrets/external-secrets`, and the annotated GSA `dev-external-secrets@aile-main-development.iam.gserviceaccount.com` has Secret Manager access.
- Added dev values for `newaile/aile-service-application`.
- Updated `values.cm-config.yaml` so OTEL exports to `aile-main-development` for dev and `aile-main-uat` for uat.
- Updated `springcloud-aile` dev CI handoff so GitOps updates include `aile-service-application`, and legacy `deploy-dev` excludes/disables `application`.

## Changed Files

- `workspace-repos/k8s-deploy/newaile/aile-service-application/values.dev.yaml` created.
- `workspace-repos/k8s-deploy/newaile/aile-service-application/values.cm-config.yaml` modified.
- `workspace-repos/springcloud-aile/.gitlab-ci.yml` modified.

## Verification

- `helm dependency list newaile/aile-service-application` returned `flex-app` 3.0.2 status `ok`.
- `helm lint newaile/aile-service-application -f values.yaml -f values.cm-config.yaml -f values.dev.yaml` passed; only chart icon recommendation.
- `helm template aile-service-application newaile/aile-service-application -n newaile -f values.yaml -f values.cm-config.yaml -f values.dev.yaml` rendered successfully to `/tmp/aile-service-application-dev-render.yaml`.
- `check_values_overlay.py` reported no null overrides and no env-only unsupported keys; expected image tag override from `x.y.z` to `e7338f26`.
- `check_flex_app_defaults.py` reported 8 rendered docs, `aile-service-application-env` ConfigMap/Secret envFrom, `LOG_LEVEL=info`, ServiceAccount `aile-service-application`, HPA min 2 max 5, PDB minAvailable 1, and Service `aile-service-application` on `8009`.
- `helm template bootstrap bootstrap -n argocd -f bootstrap/values.dev.yaml` rendered successfully and emitted one `Application` for `newaile/aile-service-application` with `values.cm-config.yaml` and `values.dev.yaml`.
- `yq '.' .gitlab-ci.yml` passed.
- `git diff --check` passed in both `k8s-deploy` and `springcloud-aile`.

## Next Steps

- Review and commit the local changes in both nested repos.
- Open separate MRs or the agreed repo flow for `k8s-deploy` and `springcloud-aile`.
- After merge/sync, verify Argo CD child Application `aile-service-application` source path, target revision, value files, sync/health, and resource tree.
- Verify live Deployment image, ServiceAccount annotation, ExternalSecret sync, generated Kubernetes Secret key presence, Pod rollout, Nacos bootstrap logs, Pub/Sub health, and OTEL export behavior.
- Ensure legacy `aile-dev` Helm path no longer renders `application` after the CI handoff runs with `HELM_DISABLED_SERVICES=account,admin,application`.

## Risks And Notes

- Secret value correctness was not verified because secret values must not be read or printed by the agent.
- Rendered flex-app dev state creates HPA and Service resources for `aile-service-application`; live legacy dev currently did not have an application-specific Service or HPA before migration.
- Rendered flex-app PDB name is `aile-service-application`; legacy live PDB name was `aile-service-application-pdb`. Controller handoff should ensure the old PDB is removed by the legacy Helm disabled-service path or otherwise reviewed for duplicate selector impact.
- `gcloud` active project remained `aile-main-uat`; future GCP checks should keep using explicit `--project=aile-main-development` or switch config intentionally.
- Shell startup emitted sandbox noise from envman trying to touch `/home/samlu/.config/envman/*`; it did not affect repo checks.

## Suggested Skills

- `gitops-delivery-workflow`
- `session-memory`
