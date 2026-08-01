# Dependency Mapping

Use this reference when mapping how a product feature or service is delivered
across app repos, BFF repos, backend microservices, GitOps desired state,
hosting, and runtime dependencies.

## What To Prove

Build the map in layers. Do not blend evidence:

| Layer | Evidence to inspect | Typical finding |
| --- | --- | --- |
| Repo identity | `git remote -v`, branch, status, similarly named directories | Which repo is actually in scope. |
| Frontend intent | env constants, HTTP clients, GraphQL clients, Firebase config, hosting config | Which public endpoints the app calls and where it deploys. |
| BFF intent | datasource classes, base URL env vars, GraphQL resolvers, REST clients | Which backend services the BFF proxies to. |
| Backend API | controllers, route annotations, Feign clients, shared API modules | Which microservices own the API contract. |
| Build/CI | `.gitlab-ci.yml`, `.gitlab-ci.yaml`, includes, Dockerfile, package scripts | Whether delivery is static hosting, image push, GitOps handoff, or direct deploy. |
| Desired state | Helm values, Kustomize, chart metadata, ExternalSecret refs, Service/Ingress annotations | What GitOps will deploy and which image tag/config it uses. |
| Runtime | Argo CD, Kubernetes, GCP/Firebase, logs, Pub/Sub, Redis, DB | Deployment truth and runtime dependency health. |

## Extraction Impact Categories

When a user asks whether a service can be split into a separate repo or
monorepo, classify impact instead of answering yes/no:

| Category | What to check |
| --- | --- |
| Compile-time impact | Other modules importing classes/models from the target module, Gradle/Maven/project dependencies, generated API packages. |
| API contract impact | BFF/frontend/gateway calls to existing paths; need to preserve route prefixes or update clients. |
| Gateway/routing impact | Gateway route table, Ingress, GCLB backend service, NEG, URL map, DNS, Firebase rewrites. |
| Config/secrets impact | `.env` references, Secret Manager names, ExternalSecret remote refs, Nacos/config server keys, service account names. |
| Data impact | DB schemas/collections, shared tables, migration ownership, Redis keys, locks, queues. |
| Runtime dependency impact | Feign/HTTP calls, Pub/Sub, Redis, object storage, third-party APIs, scheduled jobs. |
| Delivery impact | CI build path, Docker image repository, GitOps target folder, Argo CD app, release tags, protected branches. |

Prefer a staged split when possible:

```text
1. Extract build/repo while preserving old API paths and gateway routes.
2. Move runtime config/secrets and deploy independently.
3. Update clients or route prefixes only after compatibility is proven.
```

## Generalized Lessons From Aicard Review

These are reusable patterns, not Aicard-only rules:

- A frontend deployed to Firebase/static hosting can still depend on a BFF and
  direct backend endpoints. Hosting success does not prove backend readiness.
- A BFF image push can be successful while deployment is still pending or broken
  in GitOps/Argo CD/Kubernetes.
- A service embedded in a SpringCloud monorepo may have little direct compile
  impact on sibling services, but still carry route, config, data, and runtime
  dependencies.
- Similar repo names can refer to unrelated products. Confirm exact repo path
  before using prior memory or naming assumptions.
- If a BFF calls a single environment-driven base URL, map route prefixes to
  backend service ownership instead of guessing the final host.
- Direct frontend calls to attachment/OCR/static backend endpoints must be
  separated from BFF GraphQL calls when assessing blast radius.

## Useful Commands

Repo identity:

```bash
git -C <repo> branch --show-current
git -C <repo> status --short --untracked-files=all
git -C <repo> remote -v
```

CI entrypoints:

```bash
find <repo> -maxdepth 3 -type f \( -name '.gitlab-ci.yml' -o -name '.gitlab-ci.yaml' -o -name '*gitlab*' -o -name 'Dockerfile' \) | sort
rg -n "firebase deploy|docker build|docker push|trigger:|include:|helm|kubectl|argocd|deploy" <repo>
```

Frontend/BFF endpoints:

```bash
rg -n "VITE_|REACT_APP|NEXT_PUBLIC|BASE_URL|GRAPHQL|axios|fetch\(|RESTDataSource|baseURL|process.env" <repo>
```

Backend routes and service dependencies:

```bash
rg -n "@RequestMapping|@GetMapping|@PostMapping|@FeignClient|Controller|Router|routes:|baseUrl|service:" <repo>
rg -n "implementation project\('|api project\('|compile project\('|<dependency>|import .*api" <repo>
```

Desired state and route handoff:

```bash
rg -n "repository:|tag:|remoteRef:|ExternalSecret|ServiceAccount|cloud.google.com/neg|Ingress|HTTPRoute|Gateway|loadBalancerIP" <gitops-path>
```
