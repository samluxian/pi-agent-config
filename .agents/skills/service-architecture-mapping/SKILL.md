---
name: service-architecture-mapping
description: Map cross-repo service delivery or extraction impact across source dependencies, APIs, CI, hosting/GitOps, routes, configuration, and state. Use for architecture questions spanning repositories. Do not use for one-repo troubleshooting, live health, or implementation.
---

# Service Architecture Mapping

Build an evidence-backed cross-repository map.

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

Do not infer runtime health, credentials, IAM grants, queue or cache use, or
deployment ownership from names alone. Return implementation requests as bounded
proposals for the appropriate delivery skill.

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
