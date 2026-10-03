---
name: helm-chart-best-practices
description: Apply Helm chart best practices and a fixed validation workflow for chart values, schemas, templates, dependencies, render behavior, compatibility, and releases. Use for any Helm chart or chart consumer; discover ownership and conventions first.
---

# Helm Chart Best Practices

Treat chart values, templates, and rendered manifests as a consumer-facing
contract. A chart can be shared or service-specific; do not assume the layout,
resource kinds, or versioning policy before inspecting the target.

## Flow

1. Confirm task type, chart/consumer repository, branch/status, chart path and
   version, supported Helm CLI and Kubernetes versions, target environment and
   release, owning layer, and requested behavior. Inspect existing Chart.yaml,
   dependency declarations/lock/artifacts, values, schema (if present),
   templates/helpers, tests, wrappers, CI and relevant consumer overrides.
2. Trace effective values and override order into rendered resources. Separate
   chart defaults, wrapper/service values, GitOps-injected values, and live
   Kubernetes evidence. Identify the API surface and consumers for changes to
   public values, defaults, selectors, names, dependencies, and workload behavior.
   Identify capability/install/upgrade branches, lookup/tpl behavior, CRD ownership,
   hooks and test resources when present; offline rendering does not prove their
   live behavior. Use the general baseline below, not application-only assumptions.
3. For a requested edit, identify exact files, expected render diff, compatibility,
   migration and release impact. Preserve existing consumer behavior unless an
   approved change documents the migration; stop for unresolved ownership or
   breaking-change expectations.
4. Apply the smallest approved repository diff. Follow
   `references/helm-usage-and-validation.md` for dependency preparation,
   lint/schema, and local `helm template` checks of defaults and relevant profiles.
   Do not run dependency build/update or enable dependency downloads until their
   local writes are permitted; a missing lock can make build behave like update.
   Assert affected fields and negative cases for new required/rejected values,
   including false/zero/null when relevant. Check representative consumers when
   the change affects their contract. Never use helm test, install/upgrade dry-run,
   schema bypass, or cluster-facing render flags as a shortcut for local checks;
   record any unavailable consumer or runtime validation as a gap.
5. For releases, derive claims from the exact source/tag diff and validation
   evidence. Separate capability, changed behavior, breaking change, migration,
   and limitations. A render proves intent, not deployed health.

Use `references/helm-chart-best-practice-baseline.md` for general official chart
recommendations and `references/helm-usage-and-validation.md` for CLI semantics,
version-aware validation, sensitive output, and dependency/test safety. Compare
recommendations with the target's contract; do not impose a CLI upgrade, chart
format, values layout, dependency source, or release workflow without scope.

Use `references/api-and-values-contract.md` and
`references/compatibility-and-review.md` only when their application-chart
patterns match the target. Use `references/keda-autoscaling-contract.md` only
for applicable KEDA behavior; `references/release-notes.md` for a shared chart
release; `references/validation.md` for application-chart-specific test matrices
and helper examples. For other charts derive equivalent checks from their own
contracts instead of applying those assumptions blindly.

## Safety And Reporting

Only edit owned repository files on an allowed branch. Do not run mutating
`helm`, `kubectl`, Argo CD, Git remote, or cloud operations, or read secrets.
Inspect render inputs and helpers before execution: compact summaries and dry-run
flags do not guarantee secret-safe output or side-effect-free execution.
Report changed chart API/defaults, CLI/capability assumptions, dependency lock and
preparation status, render evidence, consumer compatibility, migration/release
impact, and skipped checks; mention KEDA or GitOps only when relevant.
