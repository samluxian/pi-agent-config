---
name: shared-helm-chart-maintenance
description: Maintain shared Helm chart APIs, schemas, templates, compatibility, or releases. Use for a supported application-chart contract. Do not use for service values, wrapper upgrades, or unrelated charts.
---

# Shared Helm Chart Maintenance

Treat chart values and templates as a public contract. Preserve compatibility
unless the requested change explicitly introduces and documents a migration.

## Supported Adapter

This skill supports a shared application chart contract. Stop for another chart
layout until its values, render, compatibility, and test adapter exists.

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
   implications.
6. Apply the smallest approved contract change and validate affected profiles
   and representative consumers.

For release notes, derive claims from the exact tag diff and validation evidence.
Separate new capability, behavior change, breaking change, migration, and known
limitations. Do not advertise unverified compatibility.

## Stop Conditions

Stop and ask when the target version/tag, ownership surface, expected default,
consumer compatibility, or release boundary is unresolved.

## Domain Reporting

In the workspace report, include defaults, consumers, migration, breaking-change,
chart API, KEDA, app-of-apps, rollout, and compatibility findings.
