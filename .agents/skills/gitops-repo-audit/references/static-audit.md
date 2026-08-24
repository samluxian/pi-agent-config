# Static GitOps Audit

Use this reference for read-only repo audits. Keep source-of-truth layers
separate: application repo CI, GitOps desired state, shared chart defaults,
bootstrap/App-of-Apps wiring, rendered manifests, ArgoCD live state, and runtime
dependencies are different evidence sources.

## Desired-State Audit

Check service/env discovery without changing files:

```bash
rg --files | rg '(^|/)(apps|services|platform|infra)/[^/]+/values\.(dev|qa|uat|prod)\.yaml$'
rg --files | rg 'values\.ignore\.(dev|qa|uat|prod)\.yaml$'
rg -n "targetRevision|repoURL|path:|valueFiles|releaseName|namespace" bootstrap .
```

Look for:

- more than one enabled `values.<env>.yaml` for the same service/env across old
  and new paths
- prep files named `values.ignore.<env>.yaml` that are intentionally disabled
- child Application path, namespace, value files, and release name mismatches
- deleted or moved paths that still appear in bootstrap overrides
- project scanner or symlink references to retired top-level paths

## Chart And Values Audit

For Helm-based services:

```bash
rg --files | rg 'Chart.yaml|Chart.lock|values(\..*)?\.yaml$|templates/'
rg -n "dependencies:|repository:|version:|alias:|remoteRef|envFrom|serviceAccount|workloadIdentity|pdb|hpa|service:" .
```

Look for:

- chart dependency version drift between `Chart.yaml`, `Chart.lock`, and packaged
  charts
- explicit `null` overrides that intentionally clear chart defaults
- image tags set to `latest` without explicit approval
- ServiceAccount/GSA annotation, ExternalSecret, ConfigMap, HPA, PDB, Service,
  probe, resource, and rollout-strategy changes that require stronger proof
- secret-like values in ConfigMap or plain values files

Use `$gitops-state-diagnostics` for render/live verification after the static
audit identifies the risky surface.

## CI Handoff Audit

Inspect upstream service CI and downstream deployment templates separately:

```bash
rg -n "update-gitops|TARGET_FOLDER|DEPLOY_ENV|GITOPS_REF|CI_COMMIT_TAG|CI_COMMIT_REF_NAME|helm upgrade|trigger:" .gitlab-ci.yml .gitlab/ci
rg -n "raw\\?ref=|repository/files|branch|values\\.\\$|NEW_TAG|image.tag|imageTag" .gitlab-ci.yml .gitlab/ci
```

Check:

- build job and GitOps update job use compatible branch/tag rules
- template include `ref`, downstream trigger branch, repository-file read ref,
  and commit branch are intentionally aligned
- legacy direct Helm deploy jobs are removed or explicitly excluded after GitOps
  handoff
- monorepo service identifiers match the right naming convention, such as full
  service names versus chart keys
- dry-run branch hardcodes are removed before MR-ready handoff

## Review Audit

Before saying an audit is clean, report:

- target repo and branch
- dirty files and whether they are in audit scope
- service/env scope
- static issues found
- checks not run because they require Helm render, live cluster, GitLab auth, or
  GCP auth
- whether the finding should update an existing skill, create a new skill, or
  stay as session memory only

Do not claim readiness from static audit alone when changed surfaces require
rendered manifests, ArgoCD, Kubernetes, GitLab pipeline, or GCP runtime proof.
