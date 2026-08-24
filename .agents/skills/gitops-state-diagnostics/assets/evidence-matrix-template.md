# GitOps Evidence Matrix

## Scope

- service:
- environment:
- namespace:
- release / application:
- target baseline:
- allowed write scope:

## Evidence Sources

| Source | Command / Path | What It Proves | Key Findings | Gaps / Risk |
| --- | --- | --- | --- | --- |
| service repo |  | image, CI, runtime env usage, dependency ownership |  |  |
| GitOps repository values |  | GitOps source values and env overlay intent |  |  |
| shared chart |  | supported schema, defaults, template behavior |  |  |
| Helm render |  | manifest produced from repo inputs |  |  |
| ArgoCD Application |  | repo path, revision, values files, sync/health |  |  |
| Kubernetes live object |  | actual cluster spec/status after controllers/admission |  |  |
| runtime logs / in-pod checks |  | app behavior and dependency connectivity |  |  |
| cloud control plane |  | IAM, Redis, Pub/Sub, or other external resource truth |  |  |

## Difference Classification

- values-only:
- shared-chart gap:
- bootstrap / ArgoCD wiring:
- external dependency / IAM:
- accepted difference:
- needs team confirmation:

## Verification Result

- commit-ready / not commit-ready:
- blocking evidence:
- checks not run:
