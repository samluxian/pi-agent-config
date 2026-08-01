# Sam Lu - DevOps / GitOps Experience Profile

## Professional Summary

DevOps / GitOps engineer focused on Kubernetes delivery migration, CI/CD
modernization, Helm chart adoption, Argo CD operations, and GCP Workload
Identity integration.

Recent work centered on moving NewAile and related services from legacy
environment-specific Helm deploy jobs toward a GitOps delivery model:

```text
application CI -> image build/push -> k8s-deploy values update ->
Argo CD reconcile -> Kubernetes runtime verification
```

The work spans application repositories, `k8s-deploy` desired state, shared
`flex-app` Helm charts, GitLab CI/CD pipelines, GKE runtime state, External
Secrets, Secret Manager, and Workload Identity.

## Core Strengths

- GitOps migration for multi-repo, multi-environment Kubernetes services.
- Helm values design, render verification, and chart behavior analysis.
- Argo CD App-of-Apps and child Application troubleshooting.
- GitLab CI/CD migration from direct deploy jobs to downstream GitOps updates.
- GKE runtime verification with Deployment, Service, HPA, PDB, ServiceAccount,
  ConfigMap, Secret, and ExternalSecret evidence.
- GCP Workload Identity setup validation, including KSA/GSA/IAM binding and
  Secret Manager prerequisites.
- Mixed-controller handoff analysis across legacy Helm CI, GitOps desired
  state, Argo CD sync, and live Kubernetes manifests.
- Converting repeated operational lessons into reusable agent skills,
  deterministic scripts, and session handoff notes.

## Representative Project Work

### NewAile Java Services - GitOps Migration

Repositories:

- `springcloud-aile`
- `k8s-deploy`

Services handled:

- `aile-service-account`
- `aile-service-admin`
- `aile-service-application`
- `aile-service-base`
- `aile-service-integration`
- `aile-service-job`
- `aile-service-notice`
- `aile-service-room`
- `aile-service-tenant`
- `aile-service-gateway`

Responsibilities and outcomes:

- Added or reviewed `flex-app` values overlays in `k8s-deploy`.
- Updated upstream GitLab CI handoff so changed services update the correct
  downstream `k8s-deploy` folders.
- Removed or disabled legacy dev/UAT direct Helm deploy paths where the target
  delivery model was GitOps-only.
- Verified bootstrap discovery renders the expected Argo CD Application.
- Checked Helm dependency state, lint/template output, HPA/PDB behavior,
  ServiceAccount wiring, ExternalSecret generation, and live runtime shape.
- Diagnosed mixed-mode rollout behavior where legacy Helm deploys and GitOps
  updates coexisted during migration.

Key technical patterns:

- `CHANGED_SERVICES` and `TARGET_FOLDERS` matching.
- `DEPLOY_EXCLUDED_SERVICES` versus `HELM_DISABLED_SERVICES`.
- `values.yaml`, `values.<env>.yaml`, and `values.cm-*.yaml` split.
- Argo CD child Application valueFiles and release names.
- Nacos, OTEL, Pub/Sub, Secret Manager, and Workload Identity prerequisites.

### Authserver UAT GitOps Migration

Repositories:

- `authserver`
- `k8s-deploy`

Responsibilities and outcomes:

- Formalized UAT CI handoff from `publish-uat` to downstream
  `update-k8s-deploy-uat`.
- Preserved existing UAT image build behavior while moving desired state into
  `k8s-deploy/newaile/authserver`.
- Modeled the service with `flex-app 3.1.0` while preserving the existing
  workload name and release naming contract.
- Split runtime configuration into ConfigMap, ExternalSecret env refs, JWT
  file mounts, and ServiceAccount annotation.
- Verified GSA, Workload Identity binding, External Secrets controller GSA,
  Secret Manager API, and required secrets.
- Produced MR-ready render/live diff evidence with the correct UAT image tag
  and kube context.

Key technical patterns:

- Gradle Jib image build.
- UAT tag rule validation.
- `ConfigMap/auth-server-env`.
- `ExternalSecret/auth-server-files`.
- `ServiceAccount/authserver` annotated to the UAT GSA.
- `helm template ... | kubectl diff -n newaile -f -` as review evidence.

### BFF GitOps and CI Migration

Repositories:

- `webchatbff`
- `ailebff`
- `aileprobff`
- `k8s-deploy`
- `helm-chart`

Responsibilities and outcomes:

- Migrated BFF delivery paths across dev, QA, UAT, and prod toward GitOps.
- Updated GitLab CI rules and downstream `k8s-deploy` update behavior.
- Ran dry-run branch isolation so tests did not mutate `main`.
- Diagnosed tag-driven pipeline behavior and parser failures before build or
  GitOps update stages.
- Handled PDB/HPA render differences, live drift, and Argo CD sync concerns.
- Participated in `flex-app` compatibility work for BFF service behavior.

Key technical patterns:

- GitLab tag rules and branch-specific deployment rules.
- Downstream values update jobs.
- HPA/PDB values and flex-app defaults.
- Render diff versus live manifest comparison.
- Legacy Helm release to Argo CD handoff.

### Workspace DevOps Skill Engineering

Repository:

- `skills`

Responsibilities and outcomes:

- Versioned workspace-wide agent instructions and project-scoped skills.
- Split a broad GitOps workflow into narrower skills:
  - `gitops-router`
  - `gitops-implementation-workflow`
  - `gitops-diagnostics-workflow`
  - `gitops-repo-audit`
  - `session-memory`
- Added deterministic wrapper scripts and JSON summarizers to reduce large
  manifest/diff noise during reviews.
- Captured reusable lessons from real migrations into repeatable workflows.
- Added guidance to ask clarifying questions before widening implementation
  scope across shared templates, discovery logic, CI includes, chart structure,
  or secret wiring.

## Technical Skill Matrix

| Area | Evidence of Practical Use |
| --- | --- |
| Kubernetes | Deployment, Service, ServiceAccount, HPA, PDB, ConfigMap, Secret, ExternalSecret, pod readiness, live manifest comparison |
| Helm | Chart dependency checks, `helm lint`, `helm template`, values overlays, chart defaults, render troubleshooting |
| Argo CD | App-of-Apps bootstrap, child Application source/path/valueFiles, sync/health/diff review |
| GitLab CI/CD | Branch/tag rules, pipeline stages, downstream repo update jobs, dry-run refs, job trace diagnosis |
| GCP | GKE, Workload Identity, IAM policy checks, Secret Manager, Pub/Sub roles, OTEL project config |
| GitOps | Desired-state changes, controller handoff, render/live separation, MR-ready evidence |
| Runtime Config | Nacos, Redis, Pub/Sub, OTEL, envFrom ConfigMap/Secret, mounted secret files |
| Engineering Workflow | Repo preflight, dirty-state handling, branch safety, validation-first reporting, reusable skill/scripts |

## Problems Solved

### Legacy Helm and GitOps Running at the Same Time

Problem:

Legacy Helm CI and Argo CD could both affect the same namespace during
migration, making it unclear which controller owned the current workload.

Approach:

- Separated evidence layers: service CI, `k8s-deploy` values, Helm render,
  Argo CD Application, live Kubernetes resources, and Helm release history.
- Compared `CHANGED_SERVICES`, GitOps target folders, legacy Helm disable flags,
  Argo CD desired state, and live image tags.
- Used Helm revision and GitLab pipeline trace evidence before declaring a
  service migrated.

Result:

Produced a repeatable mixed-mode migration checklist and reduced the risk of
misreading shared commit SHA image tags as actual service rollouts.

### Dry-Run Changes Accidentally Touching Main

Problem:

Branch-to-branch GitOps dry runs can still read from or write to `main` if only
one ref is changed.

Approach:

- Verified upstream include ref, trigger ref, `K8S_DEPLOY_REF`, downstream
  repository-file read ref, and downstream commit branch separately.
- Removed temporary dry-run wiring after the test phase ended.

Result:

Created a safer dry-run pattern for validating CI/GitOps handoff without
polluting the formal branch flow.

### Tag-Driven Pipeline Failures Before Build

Problem:

Some UAT test tags matched broad CI rules but failed in pre-check because the
repository tag parser expected a stricter version format.

Approach:

- Identified the failing layer as tag parser/pre-check rather than Docker build
  or GitOps update.
- Captured parser rules from `manage-tags.sh`.
- Added GitLab pipeline summarization to detect this failure class quickly.

Result:

Improved diagnosis accuracy for tag-driven deployment failures and avoided
debugging the wrong pipeline layer.

### Workload Identity and Secret Manager Prerequisites

Problem:

GitOps values can render correctly while runtime access fails due to missing
GSA, KSA annotation, IAM binding, API enablement, or Secret Manager secrets.

Approach:

- Checked app GSA, External Secrets GSA, KSA annotation, IAM member string,
  Secret Manager API, and expected secret names separately.
- Kept secret value verification out of scope to avoid exposing credentials.

Result:

Built a consistent evidence model for declaring GCP/runtime prerequisites
complete or blocked.

## Selected Evidence From GitLab

Recent authored/updated merge requests visible through GitLab include:

- `k8s-deploy`: authserver UAT migration, aile service gateway/tenant/room/
  notice/job/integration/base/application/admin/account flex-app values,
  BFF prod/QA/dev migrations.
- `springcloud-aile`: CI handoff updates for service account, admin,
  application, base, integration, job, notice, room, tenant, gateway, and dev/UAT
  cleanup.
- `webchatbff`: UAT, dev, QA, and prod CI migration work.
- `ailebff`: QA and prod GitOps CI migration work.
- `aileprobff`: newaile CI update.
- `authserver`: UAT CI update.
- `helm-chart`: `flex-app` compatibility update for aileprobff UAT.

## Resume-Ready Bullets

- Migrated multiple Kubernetes services from legacy Helm deploy jobs to a
  GitOps model using `k8s-deploy`, Argo CD, and reusable `flex-app` Helm charts.
- Redesigned GitLab CI handoff paths so service repositories build images and
  update downstream GitOps values instead of directly mutating clusters.
- Validated GKE Workload Identity integrations by checking KSA/GSA bindings,
  IAM policy, Secret Manager prerequisites, and External Secrets behavior.
- Built Helm render and live Kubernetes verification workflows for Deployment,
  Service, HPA, PDB, ConfigMap, Secret, ExternalSecret, and ServiceAccount
  changes.
- Diagnosed mixed legacy Helm/GitOps controller behavior by separating CI,
  desired state, render output, Argo CD state, live manifests, and runtime
  dependencies.
- Created project-scoped automation skills and scripts that standardize GitOps
  implementation, diagnostics, repo audit, and session handoff practices.

## Interview Talking Points

- I can explain how to migrate one service from direct Helm deploy to Argo CD
  without losing rollback visibility or runtime proof.
- I can debug a GitLab deployment failure by identifying whether it failed in
  tag parsing, image build, registry push, GitOps update, Argo CD sync, or
  Kubernetes runtime.
- I can verify Workload Identity end to end without reading secret values.
- I can compare desired state, rendered manifests, Argo CD state, and live
  Kubernetes state without collapsing them into one unsupported claim.
- I can turn repeated operational failure modes into reusable checks and team
  documentation.

## Source Basis

This profile is based on:

- GitLab API summary for user `sam.lu` and recent project merge requests.
- Local git history under `/home/samlu/devops-repos`.
- Workspace session notes under `docs/session-notes/`.
- Consolidated Codex memory for completed GitOps migration work.
