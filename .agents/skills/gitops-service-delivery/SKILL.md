---
name: gitops-service-delivery
description: Deliver services through a GitOps adapter. Use for flex-app values, app-config, discovery, or renders in k8s-deploy. Do not use for charts, platform changes, or other layouts.
---

# GitOps Service Delivery

Configure every service through one reviewable delivery contract, from repository
values to Argo CD discovery and rendered Kubernetes resources.

## Supported Adapter

This skill currently supports only the `k8s-deploy` flex-app service layout. Stop
for another layout until its ownership, discovery, render, and validation adapter exists.

## Preconditions

- Identify the target repository, branch, working tree, staged state, service,
  environments, current chart version, and Argo CD project/discovery path.
- For delivery files, stop on `main`, `master`, `release`, protected, or shared
  branches. Require exact approval before editing.
- Treat the service's pinned flex-app dependency as its API; do not infer support
  from the latest shared chart checkout.

## Service Contract

Read `references/flex-app-service-config-contract.md` before proposing or
implementing service configuration. Use Authserver as the structural reference,
not as a source of service-specific values.

- Keep deployment baseline in `values.yaml`.
- Keep environment deployment differences in `values.<env>.yaml`.
- Keep application/runtime parameters in
  `app-config/values.<env>-<config-name>.yaml`.
- Treat `app-config/values.<env>-common.yaml` as optional and create it only for
  proven shared application configuration.
- Never copy identities, endpoints, secret references, resources, probes, image
  versions, or environment enablement from the reference service.

## Delivery Flow

1. Read the service files, bootstrap value-file order, pinned chart defaults and
   schema, CI image-tag path, and one compliant repository pattern.
2. Classify every proposed value as deployment baseline, environment deployment
   override, application config, secret reference, or unsupported/ambiguous.
3. Propose the exact files, values ownership, validation, migration impact, and
   risk.
4. Apply only the approved change. Preserve disabled environments as
   `values.ignore.<env>.yaml` and never enable an environment by assumption.
5. Validate syntax, dependency artifacts, bootstrap discovery, effective
   value-file order, and one behavior-proving render per affected environment.
6. Review the bounded diff and status. Stop if a chart, bootstrap, CI, IAM, or
   secret contract requires an unapproved change.

Run `scripts/check_service_config_contract.py` for every affected enabled
environment. Use `scripts/implementation_flow.sh` for fixed preflight, overlay,
render, and post-patch checks. Read `references/helm-alias-overlays.md` when
aliases such as `stable` and `beta` coexist. Use `$helm-dependency-upgrade` for
version changes and `$shared-helm-chart-maintenance` for shared chart API changes.

## Safety

Never read or expose secret values or invent deployment identifiers. Secret-backed
settings contain references only and remain in the approved application-config
surface.

## Output

```text
Summary:
- Service files and delivery behavior changed

Validation:
- Contract, discovery, render, and skipped checks

Risk:
- Deployment, config ownership, CI, compatibility, or runtime risk

Commit message:
- Suggested concise message

Next step:
- One concrete user action
```
