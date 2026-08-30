---
name: kubernetes-platform-delivery
description: Deliver Kubernetes platform changes. Use for bootstrap, infrastructure, or platform CI. Do not use for service delivery.
---

# Kubernetes Platform Delivery

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
3. Propose the exact patch. Ask again if evidence changes component, environment,
   IAM, CI, or bootstrap scope.
4. Apply surgical edits only.
5. Validate syntax, bootstrap/discovery behavior, one relevant render or
   deterministic check, and final bounded diff/status.
6. Stop if validation exposes a service configuration, shared chart API, live
   mutation, or unapproved prerequisite change.

Read `references/keda-implementation.md` only when approved scope includes KEDA
platform installation or prerequisites. Use `.agents/shared/gitops/scripts/`
for repository preflight and compact render evidence when its helpers match.
Use `$gitops-service-delivery` for service-owned application-chart wrappers and values, and
`$shared-helm-chart-maintenance` for shared chart behavior.

## Safety

Do not invent environments, namespaces, identities, endpoints, versions, or
branches.

## Domain Reporting

In the workspace report, identify affected platform files and include bootstrap,
infrastructure, IAM, CI, compatibility, and runtime findings.
