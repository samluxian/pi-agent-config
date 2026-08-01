# GitOps Migration State Machine

Use this state machine for flex-app migrations, Helm-to-ArgoCD handoff, Service rename, environment overlay cleanup, and migration progress questions. Report the current stage, blocker, evidence source, and next required check.

Do not run every stage by default. Start at the stage that matches the question, then move forward only while the decision still needs more proof.

## Stage 0: Scope Discovery

Goal: prove what is being migrated and which controller currently owns it.

Required evidence:

- service, environment, namespace, release name, and intended GitOps path
- old path and new path, if this is a migration
- current controller: legacy Helm CI, ArgoCD, both, or unknown
- target branch and watched branch
- dirty worktree scope when repo edits or readiness are involved

Exit criteria:

- Scope is narrow enough to avoid touching sibling services or environments.
- Current controller is classified, or the unknown is reported as the blocker.

## Stage 1: Desired-State Readiness

Goal: prove `k8s-deploy` and chart files describe the intended target.

Required evidence:

- `values.yaml` and `values.<env>.yaml`
- `Chart.yaml`, `Chart.lock`, dependency alias, and flex-app version
- image tag source and release name
- ServiceAccount, Service, HPA, PDB, ConfigMap, Secret reference, and probe/resource intent

Exit criteria:

- Values are environment-scoped and do not silently alter unrelated envs.
- Omitted values versus explicit `null` overrides are classified.

## Stage 2: Render Readiness

Goal: prove Helm/Kustomize can render the desired state and expose risky diffs.

Required evidence:

- dependency status from `helm dependency list` or a user-approved dependency build
- `helm template` or equivalent render result
- rendered Deployment, Service, ConfigMap, ServiceAccount, HPA, and PDB
- old versus new render diff when migrating from a legacy chart

Exit criteria:

- Render succeeds.
- High-risk resource differences are listed, not hidden inside a full diff.

## Stage 3: Bootstrap Readiness

Goal: prove the desired state will be discovered by ArgoCD exactly once.

Required evidence:

- `values.<env>.yaml` discovery behavior
- `values.ignore.<env>.yaml` disabled or ignored paths
- no duplicate child Application from old and new paths
- parent Application targetRevision and child path convention

Exit criteria:

- The intended child Application path/revision/value files are predictable.
- Prune/delete risk is understood when old paths are disabled or removed.

## Stage 4: CI Handoff Readiness

Goal: prove upstream CI writes or triggers the intended GitOps state only.

Required evidence:

- service repo deploy jobs, tag rules, and branch rules
- `TARGET_FOLDER`, `DEPLOY_ENV`, `K8S_DEPLOY_REF`, and included template refs
- downstream trigger branch, repository-file read ref, and commit branch
- dry-run branch hardcodes classified as temporary scaffolding

Exit criteria:

- Legacy direct Helm deploy and new GitOps path cannot race unnoticed.
- Official env tags will not accidentally mutate the watched branch during a dry run.

## Stage 5: ArgoCD Takeover

Goal: prove ArgoCD sees the intended Git source and can reconcile it.

Required evidence:

- child Application source repo, path, targetRevision, valueFiles, and releaseName
- sync status, health status, operation state, conditions, and failed resources
- Helm release role: active controller, rollback artifact, or cleanup candidate

Exit criteria:

- ArgoCD desired source matches the branch/path under review.
- Any sync blocker is tied to an exact resource and message.

## Stage 6: Live Verification

Goal: prove the workload and runtime state match the intended delivery result.

Required evidence:

- live Deployment image, env/envFrom, ServiceAccount, probes, resources, labels, and selectors
- live Service, endpoints, and NEG/load-balancer binding if exposed
- HPA and PDB specs/status
- logs and runtime dependency checks for Redis, Pub/Sub, OTEL, GSA identity, or API roles when relevant

Exit criteria:

- Live state is either verified or explicitly marked not run with reason and risk.

## Stage 7: Cleanup

Goal: remove stale delivery surfaces only after ownership is proven.

Required evidence:

- old path disabled or deleted intentionally
- stale Service, PDB, or Helm release metadata classified
- rollback impact and user-operated cleanup step documented

Exit criteria:

- Cleanup is not used as the first fix for an unproven takeover.
- Destructive cleanup remains user-operated.

## Progress Report Format

```text
Stage: <number and name>
Result: commit-ready | not commit-ready | investigation-only
Blocker: <one sentence>
Evidence:
- <source>: <fact>
Next check:
- <smallest read-only check or approval-gated patch>
```
