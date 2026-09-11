---
id: terraform-resource-ownership-migration
title: Preserve resource identity during Terraform ownership migrations
type: fundamental
status: verified
topic: terraform-state
summary: Terraform migrations must preserve one state binding per remote object and prove the source and destination plans before ownership changes.
when_to_read: Renaming a Terraform address, moving a resource into a module or separate state, importing existing infrastructure, or reviewing a migration that should not recreate the object.
keywords: [import, moved-block, removed-block, resource-address, state, terraform]
aliases: [cross-state-migration, state-refactor, terraform-ownership]
scope: public-source
created: 2026-09-11
updated: 2026-09-11
---

# Preserve resource identity during Terraform ownership migrations

## TL;DR

A Terraform resource migration changes management ownership, not only file
layout. Terraform state maps each configured resource instance to a remote
object, and Terraform expects each remote object to be bound to one resource
instance. Duplicate bindings make that mapping ambiguous and can produce
unexpected behavior. [S1]

Use a `moved` block for an address refactor represented within one configuration
and state lineage. Use configuration-driven `removed` and `import` blocks for the
documented migration between separate state files. [S4] [S6] In both cases,
review the proposed state action and every remote-object change. An address move
can avoid recreation while an unrelated configuration difference still proposes
an update or replacement.

## When To Read

- Use when renaming a resource or module address.
- Use when moving a resource into or out of a child module.
- Use when splitting one Terraform state into separate configurations.
- Use when importing an existing object or handing its management to another
  Terraform root.
- Do not use a file rename as proof that state ownership moved.
- Do not use a successful import as proof that configuration matches the remote
  object.
- Do not execute a migration until the exact source state, destination state,
  resource address, remote identity, dependency boundary, and operation order
  are known.

## Knowledge

### Three Evidence Layers

Treat a managed resource as three related but separate facts:

```text
configuration address
  ↕
state binding
  ↕
remote object identity and attributes
```

The configuration describes the desired resource instance. State records the
binding between that instance and a remote object. The provider reads and changes
the remote object. Terraform needs state because configuration alone does not
identify every real object. [S1]

A safe migration preserves all three relationships:

1. the destination configuration names the intended instance;
2. exactly one state binding owns the remote object after handoff;
3. the remote object remains the intended object with the intended attributes.

A clean configuration diff establishes only the first item. A state operation
establishes only the second. A refreshed plan and provider evidence are needed to
check the third.

### One Remote Object, One Resource Instance

Terraform expects one remote object to be bound to one resource instance. It
warns that binding one object to several instances makes state mapping ambiguous
and can cause unexpected behavior. [S1]

This invariant applies across configurations as an operational ownership rule.
If the source and destination states both bind the same cloud object, either root
can propose changes against it. If neither state binds it, Terraform temporarily
stops managing it. Cross-state migration therefore requires an explicit choice
between a short unmanaged window and a more specialized state-transfer method.

### Address Refactoring With `moved`

Terraform normally interprets an address change as deleting the old resource and
creating a resource at the new address. A `moved` block tells Terraform to update
the state association before planning the destination, and the address change
itself does not destroy the remote object. [S4]

```hcl
resource "example_service" "current" {
  # Provider-specific arguments omitted.
}

moved {
  from = example_service.legacy
  to   = example_service.current
}
```

This pattern applies to renames and supported moves within a module package,
including moves involving child modules. A module can declare moves only for its
own objects and objects in its child modules. [S4]

A `moved` block protects an address transition; it does not suppress real
configuration differences. The plan can still contain in-place updates or
replacement actions if provider arguments, type compatibility, or lifecycle
rules changed.

Keep historical `moved` blocks in reusable modules. HashiCorp calls their removal
a breaking change because a consumer whose state still uses the old address can
plan deletion instead of a move. [S4]

### Import Establishes A Binding, Not Configuration Equality

An `import` block identifies the destination resource address through `to` and
the existing remote object through a provider-specific `id` or `identity`. The
`to` address must match a configured resource block. [S2]

```hcl
resource "example_service" "current" {
  # Provider-specific arguments omitted.
}

import {
  to = example_service.current
  id = "synthetic-resource-001"
}
```

Import reads the existing object's attributes into state. The destination
configuration still needs the provider arguments that describe the intended
settings. HashiCorp warns that omitted non-default arguments can make state and
remote infrastructure differ, causing the next plan to propose updates or even
destruction. [S3]

Review the import plan and revise configuration until every proposed action is
understood. Generated configuration is a starting template, not proof of a safe
or complete resource contract.

### Relinquishing Ownership With `removed`

Deleting a resource block alone normally tells Terraform that the tracked remote
object should be destroyed. A `removed` block with `destroy = false` tells
Terraform to remove the binding from state without destroying the object. After
that state change, the source configuration no longer manages the infrastructure.
[S5]

```hcl
removed {
  from = example_service.legacy

  lifecycle {
    destroy = false
  }
}
```

The `destroy = false` line is the safety-critical part. The documented default
for a `removed` block is to remove the state entry and destroy the actual
resource. [S5]

### Moving Between Separate State Files

HashiCorp documents two cross-state approaches: configuration-driven remove and
import, or direct movement with the legacy state-move workflow. It recommends
`removed` and `import` blocks for new migrations because they retain
configuration history. This approach requires Terraform 1.7 or newer. [S6]

The documented configuration-driven order is:

1. identify dependencies and the provider-specific import identity;
2. replace the source resource block with `removed { destroy = false }`;
3. verify that the source plan forgets ownership without destroying or changing
   the remote object;
4. apply the source state removal;
5. define the destination resource and matching `import` block;
6. verify that the destination plan imports the object without unexpected add,
   change, destroy, or replace actions;
7. apply the destination import;
8. run final source and destination plans and verify that neither proposes
   infrastructure changes. [S6]

This order creates a temporary unmanaged window between source removal and
destination import. Keep the window bounded, prevent concurrent infrastructure
changes, and define a stop condition before starting. Do not reverse the order
casually: importing first would temporarily bind the same object in two states,
contrary to Terraform's one-object-to-one-instance expectation. [S1]

A direct state-file move can reduce the unmanaged interval, but the official
workflow classifies it as legacy and warns that manual remote-state updates carry
state-corruption risk. [S6] It requires separate authorization, backups, exact
state identities, backend-specific handling, and recovery planning. Do not select
it merely to avoid a two-step configuration review.

### Dependency Boundaries

Splitting state also removes direct references between resources in the old root.
HashiCorp requires identifying dependencies before migration and recommends
dynamic cross-configuration references rather than copied values. [S6]

Classify every dependency before moving ownership:

- configuration reference that must become a provider data lookup or published
  output;
- create/delete ordering that no longer exists in one Terraform graph;
- provider alias or account context associated with the state entry;
- lifecycle rule that protected the resource in the source root;
- secret or sensitive output that must not be widened through state sharing;
- CI ownership and permissions for the destination backend.

The migration is incomplete if the object moved but its consumers now depend on
hard-coded identifiers or unrestricted state access.

### Plan Evidence

A Terraform plan previews proposed actions; the plan command alone does not carry
them out. [S7] For a migration, classify every source and destination action:

```text
expected: address move or state-only remove/import
acceptable only when reviewed: in-place update
stop: unexpected create, destroy, or replace
```

A speculative plan can become stale as remote systems or state change. HashiCorp
recommends checking the final non-speculative plan before apply. [S7] After a
cross-state handoff, the official workflow calls for plans in both source and
destination configurations that propose no infrastructure changes. [S6]

Saved plan files can contain sensitive values in cleartext even when terminal
output obscures them. Treat saved plans as sensitive artifacts and do not publish
or retain them in ordinary documentation. [S7]

### State Locking

Terraform automatically locks state for operations that could write it when the
backend supports locking. If lock acquisition fails, Terraform stops. Not every
backend supports locking. [S8]

A lock failure is a stop condition, not permission to disable locking or force an
unlock. A forced unlock against another active writer can corrupt state. Verify
the lock owner and backend behavior before any recovery action.

### Validation Checklist

Before migration:

- confirm Terraform and provider versions;
- identify the exact source and destination roots, backends, workspaces, resource
  addresses, and remote object identity;
- record dependencies, provider aliases, lifecycle controls, and downstream
  consumers;
- obtain current plans for every affected root;
- stop on existing drift, unknown ownership, an active lock, or an unexpected
  destructive action.

During migration:

- change only one ownership boundary at a time;
- keep `moved`, `removed`, and `import` declarations in version-controlled
  configuration;
- verify the plan immediately before each state-changing apply;
- stop if the remote identity differs, state changed since review, or the plan
  contains an unapproved action.

After migration:

- prove the source state no longer binds the object;
- prove the destination state binds the intended address to the same object;
- run fresh source and destination plans;
- require zero unexpected add, change, destroy, or replace actions;
- verify dependent configurations resolve through the new contract;
- retain migration blocks when they preserve history or upgrade compatibility.

### Boundaries

- `moved` protects an address refactor represented in one configuration lineage;
  the cited cross-state documentation instead prescribes remove/import or the
  legacy direct state-move workflow. [S4] [S6]
- `removed { destroy = false }` prevents remote deletion during source removal;
  it does not make the destination own the object. [S5]
- `import` establishes destination state ownership; it does not prove zero drift
  or correct configuration. [S3]
- A no-change plan is evidence for one root at one time. It does not verify other
  roots, later state, provider-side policy, or runtime behavior.
- State can contain sensitive infrastructure data. Do not copy raw state or saved
  plans into tickets, repositories, chat, or knowledge notes. [S7]

### Common Mistakes

- **Moving only the HCL file:** file layout does not establish a new state
  binding.
- **Renaming an address without `moved`:** Terraform can interpret the change as
  destroy at the old address and create at the new address. [S4]
- **Importing before resolving duplicate ownership:** two states can then manage
  the same object, which Terraform warns can behave unexpectedly. [S1]
- **Assuming import is a no-op:** incomplete destination arguments can produce an
  update or destructive plan. [S3]
- **Omitting `destroy = false`:** a `removed` block is destructive by default.
  [S5]
- **Checking only the destination plan:** the source can still retain ownership
  or propose a destructive action. [S6]
- **Deleting historical `moved` blocks:** older module consumers can lose their
  safe upgrade path. [S4]
- **Bypassing a state lock:** concurrent writers can corrupt state. [S8]
- **Publishing a saved plan for review:** sensitive values may be stored in
  cleartext. [S7]

### Minimal Decision Model

```text
Only the resource or module address changes in one state lineage?
  → Use a moved block.
  → Review address movement and any separate resource changes.

An existing unmanaged object enters Terraform?
  → Define the destination resource and import block.
  → Reconcile configuration before apply.

Ownership moves between separate state files?
  → Prefer configuration-driven removed/import for new migrations.
  → Make the unmanaged window and operation order explicit.
  → Verify both roots before and after the handoff.

The remote object should leave Terraform management entirely?
  → Use removed with destroy=false.
  → Verify that no other configuration still expects Terraform ownership.
```

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [HashiCorp Terraform state purpose](https://developer.hashicorp.com/terraform/language/state/purpose) | 2026-09-11 | State mappings and the one-remote-object-to-one-resource-instance expectation |
| S2 | [HashiCorp Terraform import block reference](https://developer.hashicorp.com/terraform/language/block/import) | 2026-09-11 | Import destination address and provider-specific object identity |
| S3 | [HashiCorp import existing resources](https://developer.hashicorp.com/terraform/language/import/single-resource) | 2026-09-11 | Destination configuration, import planning, and configuration mismatch risk |
| S4 | [HashiCorp refactor modules](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring) | 2026-09-11 | `moved` semantics, module scope, non-destructive address updates, and compatibility |
| S5 | [HashiCorp removed block reference](https://developer.hashicorp.com/terraform/language/block/removed) | 2026-09-11 | State removal, destructive default, and `destroy = false` handoff behavior |
| S6 | [HashiCorp refactor Terraform state](https://developer.hashicorp.com/terraform/language/state/refactor) | 2026-09-11 | Cross-state migration methods, dependencies, ordering, and source/destination verification |
| S7 | [HashiCorp terraform plan command reference](https://developer.hashicorp.com/terraform/cli/commands/plan) | 2026-09-11 | Plan behavior, final-plan freshness, and sensitive saved-plan handling |
| S8 | [HashiCorp Terraform state locking](https://developer.hashicorp.com/terraform/language/state/locking) | 2026-09-11 | Backend-dependent locking, lock-failure behavior, and forced-unlock risk |

## Related Notes

- None.
