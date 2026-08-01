# GitOps CI Branch Testing

Use when changing an upstream service repo CI pipeline that updates `k8s-deploy`, especially tag-triggered deployments, `TARGET_FOLDER`, `DEPLOY_ENV`, `K8S_DEPLOY_REF`, or update-values templates.

Official environment tags such as `qa*`, `uat*`, or `prod*` are deployment entrypoints, not safe dry-run tools. Do not recommend testing with such tags if the pipeline can still update `k8s-deploy` `main` or a branch watched by shared ArgoCD environments.

## Trigger Convention Discovery

Do not assume an environment is tag-triggered or branch-triggered. Before
changing rules, inspect the current service repo and one or two sibling
services that already use the target GitOps flow:

```bash
rg -n "build-docker|update-k8s-deploy|deploy-.*|CI_COMMIT_TAG|CI_COMMIT_REF_NAME|DEPLOY_ENV" .gitlab-ci.yml .gitlab/ci
```

Classify each target environment as one of:

- branch push, such as `release`, `main`, or `master`
- environment tag, such as `qa-*` or `uat-*`
- legacy direct Helm deploy, such as `deploy-<env>` jobs or `helm upgrade`
- already GitOps-only through `update-k8s-deploy`

Align the final rules with the current project convention, not with the last
temporary dry-run shape. If sibling services use `main` push for a production
environment, do not keep a stale `deploy-prod-*` GitOps update rule unless the
user explicitly wants tag-based production updates.

## Safe Branch-to-Branch Path

- Ask the user to create or switch to an upstream feature branch before proposing CI file edits; do not create or switch branches yourself.
- Ask the user to create or switch to a corresponding `k8s-deploy` feature/test branch before proposing deployment/template edits.
- Present the exact CI/deployment files and branch-target changes, then wait for explicit approval before patching.
- In the upstream feature branch, include the `k8s-deploy` CI template from the `k8s-deploy` test branch, not `main`.
- Ensure the included template triggers the `k8s-deploy` test branch; a variable such as `K8S_DEPLOY_REF` can carry the target branch from upstream to downstream.
- Ensure downstream update jobs read and write values from the same branch. Check repository-file reads such as `raw?ref=...` and API commit writes such as the `branch` field.
- If using a tag to exercise tag-pipeline behavior, ask the user to create the tag on the upstream feature branch HEAD so the tag pipeline uses the modified upstream `.gitlab-ci.yml`; do not create tags yourself.
- Prefer an obvious test tag pattern unless production rules must be tested exactly, and only after proving the write target is not `main`.

Keep branch target logic explicit. If the template defaults `K8S_DEPLOY_REF` to `main` and upstream can override it for dry runs, prefer `EFFECTIVE_TARGET_BRANCH="${K8S_DEPLOY_REF}"` over fallback chains such as `${K8S_DEPLOY_REF:-${CI_COMMIT_REF_NAME:-main}}`; `CI_COMMIT_REF_NAME` describes where the pipeline runs, not necessarily the intended update target.

## Dry Run Minimal Patch

For a one-off single-service dry run, it is acceptable to hardcode the test branch instead of adding a reusable `K8S_DEPLOY_REF` variable. Keep the patch temporary and remove it before the final MR:

- Upstream service `.gitlab-ci.yml`: set the `aile_cloud/k8s-deploy` include `ref` to the `k8s-deploy` test branch.
- `k8s-deploy/.gitlab/ci/trigger-k8s-update.gitlab-ci.yml`: set `.trigger-k8s-update.trigger.branch` to the same test branch.
- `k8s-deploy/.gitlab/ci/update-values.gitlab-ci.yml`: in `.update-values`, set both repository-file read `raw?ref=...` and commit API `branch` to the same test branch.
- For a single-service test, do not edit `.update-values-v2-batch` unless the upstream uses the batch trigger.
- After the dry run, propose reverting the branch-local CI files back to the formal refs and wait for approval before patching; do not use Git restore/reset.

Before testing, ask the user to push the `k8s-deploy` test branch. If it is not on GitLab, the upstream CI lint or pipeline include can fail because the include `ref` does not exist.

Changing downstream branch targets only controls where the update writes after
the upstream bridge runs. If the user wants to test with an upstream feature
branch push, also add or replace the upstream `build-docker.rules` and
`update-k8s-deploy.rules` entry so that the feature branch actually builds an
image and triggers the intended `DEPLOY_ENV`. Remove this temporary upstream
rule after the dry run.

## Feature Branch Dev Test

When testing a dev flow without merging into `release`, prefer replacing the existing `release` dev rule with the upstream feature branch rule instead of adding a second dev entrypoint. Change both sides together:

- `build-docker.rules`: replace the `release` branch rule with the feature branch rule so the image tag exists.
- `update-k8s-deploy.rules`: replace the `release` push rule with the same feature branch push rule and keep `DEPLOY_ENV: dev`.
- Do not restore an old `deploy-dev` direct Helm job for a migrated GitOps dev environment.
- Keep UAT or prod tag rules unchanged unless the test is explicitly for those environments.

After the test, propose editing the branch-local CI rule back to `release` and wait for approval before patching; do not use Git restore/reset.

## Retry Caveat

GitLab resolves CI includes when the pipeline is created. If the `k8s-deploy` template branch or include ref changes after a failed pipeline was created, retrying the old job can still use the old resolved config. Ask the user to create a new upstream pipeline with a new commit or empty commit after pushing the corrected template branch; do not retry, cancel, run, or trigger pipelines yourself.

## Tag Rule Review

Before changing tag rules, inspect sibling services and align with current project convention, such as `uat-*` versus `deploy-uat-*`. Update all related rules together:

- env extraction
- build job rules
- old direct deploy rules
- GitOps trigger rules

When a migrated environment no longer uses direct Helm deploy, delete the old deploy job block instead of leaving a dead `rules: when: never` job.

## Formalization Cleanup

After a branch-to-branch dry run succeeds, convert the branch-local test shape
back to the formal production path before MR handoff:

- upstream include ref returns to the formal `k8s-deploy` template branch
- downstream trigger branch returns to the formal target branch
- repository-file reads such as `raw?ref=...` return to the formal read branch
- API commit payload `branch` returns to the formal write branch
- temporary upstream feature branch rules are removed
- dry-run image tags or branch-specific comments are removed from MR-ready docs

For migrated environments that no longer use direct Helm deploy, remove dead
CI leftovers instead of keeping misleading variables or templates:

```bash
rg -n "extends: \\.deploy_template|\\.deploy_template|verify_deployment|helm upgrade|deploy-prod|DEPLOYMENT_NAME|NAMESPACE" .gitlab-ci.yml
```

Keep `TARGET_FOLDER`, `DEPLOY_ENV`, `NEW_TAG`, registry variables, and build
rules that are still needed by the GitOps update path.

## Remote Verification

Use only read-only remote checks before asking the user to tag. Do not run `git fetch`, `git pull`, `git push`, `git tag`, or branch-changing commands.

```bash
git ls-remote --heads origin <branch>
glab api "projects/<project-id>/repository/files/.gitlab-ci.yml/raw?ref=<branch>"
glab api "projects/<project-id>/repository/files/.gitlab%2Fci%2Ftrigger-k8s-update.gitlab-ci.yml/raw?ref=<branch>"
glab api "projects/<project-id>/repository/files/.gitlab%2Fci%2Fupdate-values.gitlab-ci.yml/raw?ref=<branch>"
glab api "projects/<project-id>/repository/files/<url-encoded-target-folder>%2Fvalues.<env>.yaml/raw?ref=<branch>"
```

For branch-to-branch dry runs, explicitly inspect these exact targets before asking the user to push or retry:

```bash
glab api "projects/<k8s-deploy-project-id>/repository/files/.gitlab%2Fci%2Ftrigger-k8s-update.gitlab-ci.yml/raw?ref=<k8s-deploy-test-branch>"
glab api "projects/<k8s-deploy-project-id>/repository/files/.gitlab%2Fci%2Fupdate-values.gitlab-ci.yml/raw?ref=<k8s-deploy-test-branch>"
glab api "projects/<k8s-deploy-project-id>/repository/files/<url-encoded-target-folder>%2Fvalues.<env>.yaml/raw?ref=<k8s-deploy-test-branch>"
```

Use GitLab CI lint when available. If CLI auth blocks lint, report that lint was not run and fall back to remote file inspection of `include.ref`, trigger branch/ref, `TARGET_FOLDER`, `DEPLOY_ENV`, image tag path, and update branch.

For GitLab dry-run result verification, trace the full chain:

```bash
glab ci list --scope tags -P 10 -F json
glab api projects/<upstream-project-id>/pipelines/<pipeline-id>/jobs
glab api projects/<upstream-project-id>/pipelines/<pipeline-id>/bridges
glab api projects/<k8s-deploy-project-id>/pipelines/<downstream-pipeline-id>/jobs
glab api "projects/<k8s-deploy-project-id>/repository/commits?ref_name=<k8s-deploy-test-branch>&per_page=6"
glab api "projects/<k8s-deploy-project-id>/repository/files/<url-encoded-target-folder>%2Fvalues.<env>.yaml/raw?ref=<k8s-deploy-test-branch>"
```

Dry-run success means the upstream tag pipeline succeeded, the build job succeeded, the bridge job triggered a downstream `k8s-deploy` pipeline on the test branch, the downstream update job succeeded, and a bot commit on the test branch changed only the intended image tag in the intended `values.<env>.yaml`.

If the upstream bridge fails, inspect both the bridge and downstream pipeline. A downstream `ref: main` during a branch dry run means the trigger template used by that pipeline still resolved to `main`, often because the `k8s-deploy` test branch was not pushed before the upstream pipeline was created.

Validation should prove both positive and negative outcomes:

- The upstream pipeline uses the feature branch CI config and expected `include.ref`.
- The downstream `k8s-deploy` pipeline runs on the test branch.
- The resulting commit changes only the intended `values.<env>.yaml` path and image tag.
- `k8s-deploy` `main` has no commit containing the test tag or pipeline URL.
- Existing ArgoCD QA/UAT/prod Applications do not change revision, image tag, or rollout state during the dry run.

If the user wants to see ArgoCD behavior during a safe test, recommend a separate sandbox Application/namespace whose `targetRevision` points at the `k8s-deploy` test branch. Do not point an existing shared QA/UAT/prod Application at the test branch unless the user explicitly accepts that it will affect the shared live environment.

## Common Pitfalls

- Running `git add .` from a service subdirectory does not stage repo-root `.gitlab/ci/*` changes.
- A `values.<env>.yaml` file must exist on the branch that `.update-values` reads, or the repository file API returns 404.
- A dry-run image tag from a test pipeline is not automatically the live baseline; restore or document the intended final tag before MR notes.
- Do not use official environment tags as dry-run shortcuts unless the write target and live impact are proven isolated.
