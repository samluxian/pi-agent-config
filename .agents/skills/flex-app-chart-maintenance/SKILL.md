---
name: flex-app-chart-maintenance
description: "Maintain the shared `flex-app` deployment API: chart values, defaults, schemas, templates, KEDA profiles, app-of-apps globals, compatibility, and release guidance. Pair with gitops-implementation-workflow for approved edits or gitops-repo-audit for static audits."
---

# Flex App Chart Maintenance

Treat `flex-app` as a shared deployment API for service owners. Use this skill
for changes to the shared chart or to a new chart contract consumed by service
values. Use `$flex-app-version-upgrade` instead when only upgrading an existing
service wrapper.

Pair with `$gitops-implementation-workflow` for approved edits and
`$gitops-repo-audit` for static consistency checks.

## Contract

- Keep user-facing defaults and supported shapes visible in `values.yaml`.
- Keep `values.yaml`, `values.schema.json`, helpers, templates, and examples in
  lockstep.
- Keep environment facts in app-of-apps globals, service intent in service
  values, and deterministic derivation in helpers.
- Do not globalize language-specific behavior, runtime dependencies, secret
  references, private endpoints, or one service's conventions.
- Prefer one canonical key and fail fast on removed duplicate inputs.
- Preserve compatibility unless the user approves a versioned breaking change
  and every affected caller has a migration path.

Read the relevant reference before proposing the contract:

- For values ownership, schema alignment, pattern extraction, and app-of-apps
  globals, read `references/api-and-values-contract.md`.
- For KEDA or event-driven autoscaling, read
  `references/keda-autoscaling-contract.md`.
- For compatibility, validation details, and reviewer-comment interpretation,
  read `references/compatibility-and-review.md`.

## Core Flow

1. Establish scope.
   - Identify the target branch, dirty state, requested chart behavior, affected
     callers, and whether bootstrap/app-of-apps must change.
   - Complete when chart behavior, service values, bootstrap ownership, and live
     runtime truth are explicitly separated.
2. Classify the value contract.
   - Classify each value as chart default, opt-in profile, service value,
     language-specific value, or app-of-apps global.
   - Complete when every new or moved value has one owner and exceptions are
     named.
3. Propose the public API before editing.
   - State the values shape, defaults, validation, deprecated inputs, affected
     files, expected render differences, and migration risk.
   - Complete when a service owner can understand the contract from
     `values.yaml` without reading templates.
4. Implement the smallest approved change.
   - Update values, schema, helpers, templates, docs/examples, bootstrap, and
     adopting service values only where the approved contract requires them.
   - Complete when every contract surface accepts and rejects the same shapes
     and unrelated callers remain unchanged.
5. Prove the contract.
   - Before this step, read `references/validation.md` and select only the gates
     for changed contract branches.
   - Render default, accepted, rejected, and adopting-service cases relevant to
     the change. Use compact summaries before raw manifests.
   - Complete when each intended difference is observed, each compatibility
     claim has render evidence, and validation gaps are reported.

## Output

```text
Summary:
Contract change:
Affected callers:
Validation:
Compatibility risk:
Next step:
```
