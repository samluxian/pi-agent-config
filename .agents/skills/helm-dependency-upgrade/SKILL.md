---
name: helm-dependency-upgrade
description: Assess Helm dependency upgrades from release notes, exact chart sources, renders, selectors, and globals. Use for the flex-app/k8s-deploy adapter. Do not use for chart authoring or other dependencies.
---

# Helm Dependency Upgrade

Reconcile published intent with actual chart behavior before changing a service
wrapper. Release notes are inputs, not deployment truth.

## Supported Adapter

This skill currently supports `k8s-deploy` wrappers pinned to `flex-app`. Stop for
another dependency until its release, ownership, render, and compatibility adapter exists.

## Upgrade Flow

1. Confirm the wrapper repository, service/environment scope, current and target
   chart versions, branch/status, and whether work is assessment or approved edit.
2. Read every release note in the upgrade interval. Record breaking changes,
   defaults, migrations, KEDA behavior, globals, selectors, and known limits.
3. Obtain exact current and target chart sources. Do not substitute `main` or an
   unverified local checkout for a released version.
4. Inspect wrapper chart metadata, aliases, values, app-of-apps inputs, CI handoff,
   and existing selector/resource assumptions.
5. Render current and target effective values with
   `scripts/render_flex_app_upgrade_summary.sh`. Use
   `references/version-ownership-matrix.md` when ownership is unclear.
6. Compare resource presence and the emitted spec fields. Check Deployment
   selectors, pod labels, affinity and KSA; Service selectors, type and ports;
   PDB availability; HPA or ScaledObject bounds and metrics; and GSA annotations.
7. Compare release-note claims, source, renders, and—when requested—read-only live
   selector/state evidence. Surface every conflict.
8. Produce a bounded migration plan. Hand edits to the appropriate implementation
   workflow.

## Stop Conditions

Stop when a release note or exact chart source is unavailable, current/target
versions are ambiguous, rendered ownership or spec-level compatibility cannot be
resolved, or live evidence would be required but is not authorized.

## Output

```text
Scope:
- Wrapper, service/environment, current -> target

Required changes:
- File/value and evidence-backed reason

Compatibility:
- Defaults, globals, selectors, KEDA, and migration findings

Validation:
- Source/tag verification, current/target render, and gaps

Risk:
- Deployment and runtime impact

Next step:
- One concrete action
```
