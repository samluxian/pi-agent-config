---
name: flex-app-version-upgrade
description: Assess a k8s-deploy wrapper upgrade between flex-app versions using release notes, exact chart sources, renders, selectors, and globals. Use for wrapper upgrades. Do not use for shared chart authoring or unrelated dependencies.
---

# Flex App Version Upgrade

Reconcile published intent with actual chart behavior before changing a service
wrapper. Release notes are inputs, not deployment truth.

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
6. Compare release-note claims, source, renders, and—when requested—read-only live
   selector/state evidence. Surface every conflict.
7. Produce a bounded migration plan. For edits, hand off to the approved
   implementation workflow and do not change files before approval.

## Stop Conditions

Stop when a release note or exact chart source is unavailable, current/target
versions are ambiguous, rendered ownership cannot be resolved, or live evidence
would be required but is not authorized. Do not publish, tag, push, or deploy.

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
