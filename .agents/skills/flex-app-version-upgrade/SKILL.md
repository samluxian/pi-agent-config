---
name: flex-app-version-upgrade
description: "Assess an existing `k8s-deploy` wrapper upgrade between two `flex-app` versions. Use when published release notes, exact chart sources, renders, and migration risk must be reconciled into a wrapper upgrade plan. Do not use for shared chart authoring, generic Helm review, or unrelated dependency upgrades."
---

# Flex App Version Upgrade

Use this skill before changing an existing service wrapper from one `flex-app`
version to another. Use `$flex-app-chart-maintenance` when changing the shared
chart; use `$gitops-implementation-workflow` only after this assessment and
user approval.

Before consuming release notes, read the Consumer Contract in
`../flex-app-chart-maintenance/references/release-notes.md`. Loading that
contract does not transfer ownership to chart maintenance: this skill still owns
the wrapper-specific upgrade decision.

## Upgrade Flow

1. Establish the upgrade inputs.
   - Identify the wrapper path, dependency alias, current and target chart
     versions, target environments, exact chart sources, and GitLab chart repo.
   - Complete when each version, environment, and release identity is
     evidence-backed.
2. Read the published release-note range.
   - Read every GitLab release note in `(current version, target version]`, not
     only the target note. Record a missing release, note, auth, or permission as
     missing evidence rather than no change.
   - Extract breaking changes, changed defaults, migration actions, design
     tradeoffs, known limitations, and explicitly unaffected contracts.
   - Complete when each note claim has a pending evidence status.
3. Compare and reconcile chart contracts.
   - Compare the current and target `values.yaml`, schema, helpers, and templates
     only for fields the wrapper can render: workload, selectors, ServiceAccount,
     env/config, probes, Service/PDB, and HPA/KEDA.
   - Map each release-note claim to chart evidence and classify every material
     difference as inherited, overridden, irrelevant, or requiring a
     wrapper-value change. Surface note/source conflicts; source wins.
   - Complete when required wrapper changes, compatibility risks, and release-note
     evidence gaps are explicit.
4. Render both versions with effective inputs.
   - Render each target environment with the same values files and injected
     globals that Argo CD receives. Summarize material fields before raw YAML.
   - Complete when current-versus-target render differences are recorded for
     every target environment, or a missing input is reported.
5. Check live compatibility only when an existing immutable or risky resource
   changes.
   - Read live Deployment selectors before changing rendered selectors.
   - Preserve an immutable live selector exactly, or specify a user-operated
     delete/recreate migration. Check Service and PDB selectors separately.
   - Complete when every risky difference has one action: preserve, change a
     values layer, or user-operated recreate.
6. Produce the upgrade plan and stop at the decision.
   - Order only the required wrapper changes, validation commands, release-note
     migration actions, and user-operated runtime steps. Include rollback or
     stop conditions for risky transitions.
   - Hand implementation to `$gitops-implementation-workflow` only after user
     approval.
   - Complete when no material difference or release-note claim is unclassified.

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

Release-note inputs:
- release -> claim -> chart/render evidence status

Material differences:
- chart difference -> rendered effect -> required wrapper change

Upgrade plan:
- ordered wrapper change -> validation -> migration or stop condition

Compatibility:
- resource -> live/render result -> action

Validation:
- commands run, required, or missing

Next step:
- implementation handoff or user-operated migration
```
