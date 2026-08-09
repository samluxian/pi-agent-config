---
name: k8s-infra-delivery
description: Deliver Kubernetes platform changes. Use for bootstrap, infrastructure, or platform CI. Do not use for service delivery.
---

# Kubernetes Infrastructure Delivery

Apply the smallest approved repository change to Kubernetes platform desired
state. Approval never covers adjacent services or unrelated cleanup.

## Preconditions

- Identify the target repository, branch, working tree, staged state,
  environment, platform component, and desired-state owner.
- Stop on `main`, `master`, `release`, protected, or shared branches for delivery
  files. Restate approved files, behavior, validation, and platform risk.
- Separate bootstrap/App-of-Apps, infrastructure chart, CI handoff, rendered
  manifest, and live-system evidence.

## Delivery Flow

1. Read target files, bootstrap callers, defaults, templates, schemas, CI rules,
   and one relevant infrastructure pattern.
2. Confirm discovery path, project, namespace, target revision, environment
   enablement, sync policy, and dependency prerequisites from repository evidence.
3. Propose the exact patch and wait for approval. Ask again if evidence changes
   component, environment, IAM, CI, or bootstrap scope.
4. Apply surgical edits only. Do not stage, commit, push, deploy, or overwrite
   unrelated user changes.
5. Validate syntax, bootstrap/discovery behavior, one relevant render or
   deterministic check, and final bounded diff/status.
6. Stop if validation exposes a service configuration, shared chart API, live
   mutation, or unapproved prerequisite change.

Read `references/keda-implementation.md` only when approved scope includes KEDA
platform installation or prerequisites. Use `.agents/shared/gitops/scripts/`
for repository preflight and compact render evidence when its helpers match.
Use `$k8s-service-delivery` for service-owned flex-app wrappers and values, and
`$flex-app-chart-maintenance` for shared chart behavior.

## Safety

Never modify secrets, credentials, kubeconfigs, `.env` files, remote Git,
clusters, Argo CD, GitLab, or GCP. Do not run direct deployment operations or
invent environments, namespaces, identities, endpoints, versions, or branches.

## Output

```text
Summary:
- Platform files and intended behavior changed

Validation:
- Commands, results, and skipped checks

Risk:
- Bootstrap, infrastructure, IAM, CI, compatibility, or runtime risk

Commit message:
- Suggested concise message

Next step:
- One concrete user action
```
