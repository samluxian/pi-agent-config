---
name: service-delivery-topology
description: "Map cross-repo service delivery topology and service extraction/split impact across source dependencies, APIs, CI handoff, hosting or GitOps, routes, configuration, and state. Use when the question spans repository boundaries. Do not use for one-repo troubleshooting, live health checks, or implementation."
---

# Service Delivery Topology

Use this skill when a task asks how an application is wired across repositories
or what would be affected by splitting, extracting, migrating, or isolating a
service. It is meant to build the dependency map before GitOps implementation
or runtime diagnosis.

## Rules

- Confirm similarly named repos before drawing conclusions. If two names differ
  only by punctuation or suffix, treat them as separate until proven otherwise.
- For extraction impact, distinguish direct compile dependency, HTTP/API
  contract dependency, gateway/routing dependency, data dependency, secret/config
  dependency, and operational dependency.

## Quick Flow

1. Identify all candidate repos and reject near-name collisions. Complete when
   every included repo has an evidence-backed identity and role.
2. Inspect git branch/status in each actual repo. Complete when evidence is tied
   to the correct branch and dirty state for every repo used.
3. Identify CI entrypoints and handoff:
   - static hosting or Firebase deploy
   - Docker image build/push
   - downstream GitOps trigger
   - direct legacy deploy
   Complete when each built artifact has an identified delivery destination or a
   named missing handoff.
4. Identify app-to-app dependencies:
   - frontend env/config and network calls
   - BFF datasource/base URL/GraphQL/REST calls
   - backend controller/routes/Feign clients/shared modules
   - gateway, Ingress, NEG, LoadBalancer, or URL map references
   Complete when each dependency has producer, contract, consumer, and evidence.
5. Identify state and config coupling:
   - data collections/tables
   - Redis/locks
   - Pub/Sub or queues
   - Secret Manager / ExternalSecret references
   - Firebase/hosting targets
   Complete when each state/config dependency has an owner and environment.
6. For extraction questions, classify blast radius as:
   - compile-time impact
   - route/API compatibility impact
   - data/config/runtime impact
   - CI/GitOps delivery impact
   Complete when every discovered dependency is assigned to one or more blast
   radius categories and unknowns are explicit.

Use the bundled inventory script for compact local evidence across arbitrary
repos:

```bash
.agents/skills/service-delivery-topology/scripts/service_topology_inventory.sh <repo-or-path> [repo-or-path...]
```

The script reads local files and git refs only. It does not read secret
payloads.

## References

- For dependency mapping patterns, extraction impact categories, and reusable
  command shapes, read `references/dependency-mapping.md`.

## Output

```text
結論:
Scope checked:
Topology:
Impact:
Evidence:
Risk:
Next narrow check:
```

If a fix requires mutation, report the smallest patch or user-operated runbook
and switch skills only after approval.
