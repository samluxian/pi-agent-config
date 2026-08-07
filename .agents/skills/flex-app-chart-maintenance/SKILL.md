---
name: flex-app-chart-maintenance
description: Maintain shared flex-app chart API, defaults, schema, templates, KEDA, globals, compatibility, or release notes. Use for shared chart behavior. Do not use for service-only values or wrapper upgrades.
---

# Flex App Chart Maintenance

Treat chart values and templates as a public contract. Preserve compatibility
unless the requested change explicitly introduces and documents a migration.

## Core Flow

1. Confirm the shared chart repository, branch, status, current version, requested
   behavior, consumers, and whether release-note work is in scope.
2. Inspect the existing values, schema, templates, helpers, tests, and reference
   consumers before proposing a change.
3. Classify ownership:
   - public API/defaults: `references/api-and-values-contract.md`
   - autoscaling/KEDA: `references/keda-autoscaling-contract.md`
   - compatibility/review: `references/compatibility-and-review.md`
   - release notes: `references/release-notes.md`
   - validation: `references/validation.md`
4. Reconcile values, schema, templates, selectors, app-of-apps globals, and
   rendered behavior. Surface conflicts rather than guessing intent.
5. Propose exact files, compatibility impact, migration, validation, and release
   implications; wait for approval before editing.
6. Apply the smallest coherent contract change and validate affected profiles and
   representative consumers.

For release notes, derive claims from the exact tag diff and validation evidence.
Separate new capability, behavior change, breaking change, migration, and known
limitations. Do not advertise unverified compatibility.

## Stop Conditions

Stop and ask when the target version/tag, ownership surface, expected default,
consumer compatibility, or release boundary is unresolved. Never publish,
tag, push, or mutate GitLab.

## Output

```text
Summary:
- Shared chart contract or release-note change

Compatibility:
- Defaults, consumers, migration, and breaking-change status

Validation:
- Lint, schema, render, tests, and gaps

Risk:
- Chart API, KEDA, app-of-apps, or rollout risk

Next step:
- One concrete action
```
