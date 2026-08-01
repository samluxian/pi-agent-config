---
name: flex-app-version-upgrade
description: "Assess an existing `k8s-deploy` wrapper upgrade between two `flex-app` versions. Use when current and target chart versions must be compared for render differences and migration risk. Do not use for shared chart authoring, generic Helm review, or unrelated dependency upgrades."
---

# Flex App Version Upgrade

Use this skill before changing an existing service wrapper from one `flex-app`
version to another. Use `$flex-app-chart-maintenance` when changing the shared
chart; use `$gitops-implementation-workflow` only after this assessment and
user approval.

## Upgrade Flow

1. Establish the upgrade inputs.
   - Identify the wrapper path, dependency alias, current and target chart
     versions, target environments, and the exact source for each chart.
   - Complete when each version and environment is evidence-backed.
2. Compare chart contracts.
   - Compare the current and target `values.yaml`, schema, helpers, and templates
     only for fields the wrapper can render: workload, selectors, ServiceAccount,
     env/config, probes, Service/PDB, and HPA/KEDA.
   - Classify every material difference as inherited, overridden, irrelevant, or
     requiring a wrapper-value change.
   - Complete when the required wrapper changes and compatibility risks are
     explicit.
3. Render both versions with effective inputs.
   - Render each target environment with the same values files and injected
     globals that Argo CD receives. Summarize material fields before raw YAML.
   - Complete when current-versus-target render differences are recorded for
     every target environment, or a missing input is reported.
4. Check live compatibility only when an existing immutable or risky resource
   changes.
   - Read live Deployment selectors before changing rendered selectors.
   - Preserve an immutable live selector exactly, or specify a user-operated
     delete/recreate migration. Check Service and PDB selectors separately.
   - Complete when every risky difference has one action: preserve, change a
     values layer, or user-operated recreate.
5. Stop at the upgrade decision.
   - List only required wrapper changes, validation commands, and migration
     actions. Hand implementation to `$gitops-implementation-workflow`.
   - Complete when no material difference is unclassified.

## Render Summary

Use the generic helper for one effective render when a compact resource summary
is needed:

```bash
.agents/skills/flex-app-version-upgrade/scripts/render_flex_app_upgrade_summary.sh \
  <release> <chart-path> -n <namespace> -f <base-values> -f <env-values> \
  --set global.envName=<env>
```

Run it once per current/target version and environment. Add only the values
files and globals the deployment controller actually supplies.

Read `references/version-ownership-matrix.md` only when it contains either
version. It is a history aid; chart source and render output remain authoritative.

## Output

```text
Summary:
- current -> target flex-app version
- wrapper and environments

Material differences:
- chart difference -> rendered effect -> required wrapper change

Compatibility:
- resource -> live/render result -> action

Validation:
- commands run or required

Next step:
- implementation handoff or user-operated migration
```
