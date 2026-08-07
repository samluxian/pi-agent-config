---
name: service-delivery-topology
description: Map cross-repository service delivery and extraction impact across source dependencies, APIs, CI handoff, hosting or GitOps, routes, configuration, and state. Invoke manually for architecture-spanning analysis; do not use for one-repo troubleshooting, live health, or edits.
disable-model-invocation: true
---

# Service Delivery Topology

Build an evidence-backed cross-repository map without changing repositories or
live systems.

## Flow

1. Confirm the business capability, repositories, environments, extraction/split
   question, and required decision.
2. Inventory bounded evidence with `scripts/service_topology_inventory.sh` when
   applicable. Do not treat directory names as ownership proof.
3. Trace each relevant layer:
   - source/module and build ownership
   - synchronous and asynchronous API dependencies
   - CI artifact/image and downstream handoff
   - static hosting versus Kubernetes/GitOps delivery
   - routes, configuration references, identity, and state ownership
4. Use `references/dependency-mapping.md` for evidence classification and split
   impact. Mark facts, inferences, conflicts, and unknowns separately.
5. Identify cut boundaries, required coordinated changes, migration ordering,
   rollback constraints, and the repository that owns each action.
6. Stop when one missing contract prevents a reliable recommendation; name the
   exact evidence needed rather than widening the scan.

## Safety

Remain read-only. Do not infer runtime health, credentials, IAM grants, queue or
cache use, or deployment ownership from names alone. Do not turn the topology
analysis into implementation without a bounded proposal and approval.

## Output

```text
Topology:
- Repository/layer -> dependency -> evidence

Conflicts and unknowns:
- Unsupported or contradictory contracts

Split impact:
- Required changes, owners, order, and rollback constraints

Recommendation:
- One bounded next action
```
