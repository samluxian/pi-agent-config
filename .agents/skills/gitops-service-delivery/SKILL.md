---
name: gitops-service-delivery
description: Deliver services through a GitOps adapter. Use for service-owned Helm values, application config, discovery, or renders in a supported layout. Do not use for shared charts, platform changes, or other layouts.
---

# GitOps Service Delivery

Configure every service through one reviewable delivery contract, from repository
values to Argo CD discovery and rendered Kubernetes resources.

## Supported Adapter

This skill supports the Helm dependency-based service layout described in
`references/application-chart-service-config-contract.md`. Stop for another
layout until its ownership, discovery, render, and validation adapter exists.

## Preconditions

- Identify the target repository, branch, working tree, staged state, service,
  environments, current chart version, and Argo CD project/discovery path.
- For delivery files, stop on `main`, `master`, `release`, protected, or shared
  branches. Require exact approval before editing.
- Treat the service's pinned application chart dependency as its API; do not
  infer support from the latest shared chart checkout.

## Service Contract

Read `references/application-chart-service-config-contract.md` before proposing
or implementing service configuration. Use a repository-local compliant service
as the structural reference, not as a source of service-specific values.

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
5. Validate syntax, artifacts, discovery, effective value order, and one
   behavior-proving render per affected environment with the repository adapter.
6. Review the bounded diff and status. Stop if a chart, bootstrap, CI, IAM, or
   secret contract requires an unapproved change.

Run `scripts/check_service_config_contract.py --dependency <chart-name>` for every
affected enabled environment and `scripts/implementation_flow.sh` for fixed checks.
Read `references/helm-alias-overlays.md` for aliases; use `$helm-dependency-upgrade`
for version changes and `$shared-helm-chart-maintenance` for shared chart APIs.

## Safety

Never read or expose secret values or invent deployment identifiers. Secret-backed
settings contain references only and remain in the approved application-config
surface.

## Domain Reporting

In the workspace report, identify affected service files and include contract,
discovery, render, configuration-ownership, CI, and compatibility findings.
