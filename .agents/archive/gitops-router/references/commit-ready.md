# Commit Ready Gate

Use this before saying a GitOps branch is `commit-ready`, `branch-ready`, `merge-ready`, or `MR-ready`.

A GitOps branch is commit-ready only when every applicable gate is passed or explicitly marked not applicable. Missing checks produce `not commit-ready`, not a softer approval.

| Gate | Required proof |
| --- | --- |
| Branch check | Target repo is identified, branch is non-shared, and git operations are read-only. |
| Dirty file scope | Dirty files are classified as target scope, requested cleanup, out of scope, or unknown. |
| Service/env scope | The change is limited to the requested service and environment, or broader impact is intentional and documented. |
| Dependency state | `Chart.yaml`, `Chart.lock`, dependency alias, and packaged dependency state are valid or the mismatch is documented. |
| Render | Helm/Kustomize render succeeds with the same release, namespace, and values that GitOps will use. |
| Resource inspection | Rendered Deployment, ConfigMap/Secret refs, ServiceAccount, Service, HPA, and PDB are inspected when they exist. |
| Bootstrap | Added, deleted, renamed, or ignored values files are proven to create/update exactly the intended child Application. |
| CI handoff | Service repo CI trigger path, env rules, downstream branch, and legacy direct deploy path are verified when CI changes are involved. |
| ArgoCD/live state | ArgoCD and Kubernetes live checks are completed when required for risk, or explicitly marked not run with reason. |
| Runtime dependencies | IAM, Workload Identity, Redis, Pub/Sub, OTEL, secrets, and mounted files are verified when touched or runtime-critical. |
| Risk | Rollback, traffic, IAM, CI, controller ownership, and cleanup risks are listed. |

## Progress Labels

Use progress labels to communicate useful intermediate states without weakening the hard gate.

| Progress | Meaning |
| --- | --- |
| `analysis-only` | Evidence was collected, but no readiness claim is being made. |
| `render-ready` | Local render passed and key rendered resources were inspected, but bootstrap, CI, ArgoCD, live, or runtime gates remain incomplete. |
| `MR-draft-ready` | The change can be opened for review, but must not be described as merge-ready or commit-ready. |
| `commit-ready` | Every applicable gate passed or the remaining gap is explicitly accepted as risk. |

## Output Format

```text
Commit readiness:
- branch check: pass | fail | not run | n/a
- dirty file scope: pass | fail | not run | n/a
- service/env scope: pass | fail | not run | n/a
- dependency state: pass | fail | not run | n/a
- helm/kustomize render: pass | fail | not run | n/a
- rendered resource inspection: pass | fail | not run | n/a
- bootstrap discovery: pass | fail | not run | n/a
- CI handoff: pass | fail | not run | n/a
- ArgoCD/live state: pass | fail | not run | n/a
- runtime dependencies: pass | fail | not run | n/a
- risk section: pass | fail | not run | n/a
Result: commit-ready | not commit-ready
Progress: analysis-only | render-ready | MR-draft-ready | commit-ready
Blocker: <first missing or failed required gate>
```

## Hard Rules

- Do not use `commit-ready` when render did not run.
- Do not use `commit-ready` when bootstrap discovery is relevant but unverified.
- Do not hide live-state gaps behind ArgoCD `Synced` or `Healthy`.
- Do not treat a dry-run branch hardcode as commit-ready until formal branch flow is restored.
- If a tool, credential, cluster, network, or sandbox limitation blocks a check, write `not run` and explain the accepted risk.
