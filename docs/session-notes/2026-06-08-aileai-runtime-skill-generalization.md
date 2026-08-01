# AileAI Runtime Skill Generalization

## Purpose

- Preserve AileAI-specific runtime knowledge after replacing the project-specific
  `aileai-runtime-ops` skill with generic `runtime-dependency-ops`.

## Current Status

- Status: project-specific skill removed from active routing.
- Working directory: `/home/samlu/skills`
- Branch: workspace root branch at time of note.

## Completed

- AileAI runtime workflow was generalized into `runtime-dependency-ops`.
- AileAI-specific service/env names were intentionally kept out of the generic
  skill to avoid stale project coupling.

## Changed Files

- Deleted `.agents/skills/aileai-runtime-ops/**`.
- Added `.agents/skills/runtime-dependency-ops/**`.
- Updated `AGENTS.md` and `README.md` routing.

## Verification

- Prior smoke test used:

```bash
.agents/skills/runtime-dependency-ops/scripts/runtime_desired_state_inventory.sh \
  --root /home/samlu/devops-repos/k8s-deploy/aileai \
  --services ai-gateway,asset-management-service \
  --envs dev,qa
```

- The generic inventory returned image repository, env image tags, GSA email,
  Secret Manager remoteRef names, envName, and bucket references without reading
  secret payloads.

## Next Steps

- For AileAI runtime questions, use `runtime-dependency-ops` with explicit
  context/project/namespace supplied by current repo or live evidence.
- For AileAI cross-repo source/CI/GitOps topology questions, use
  `service-delivery-topology` first.

## Risks And Notes

- Historical AileAI env map and six-service list can stale. Re-discover from
  desired state or live evidence before reporting current facts.
- Known dependency categories from the AileAI review: Kubernetes Pod/Deployment,
  HPA/Event, Lease/worker, ServiceAccount/WI, Secret Manager references,
  MongoDB, Pub/Sub topic/subscription/filter/deadletter, Redis/Memorystore/
  Valkey, and GCS bucket references.

## Suggested Skills

- `runtime-dependency-ops`
- `service-delivery-topology`
- `gitops-diagnostics-workflow`
