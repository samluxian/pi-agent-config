# Deployment Flow

This page describes the default GitOps flow for services deployed by this team.

```text
application repo / CI
  -> image build and downstream values update
k8s-deploy
  -> wrapper chart, base values, environment values, bootstrap discovery
helm-chart / flex-app
  -> reusable chart behavior and render output
Argo CD
  -> sync from Git desired state to cluster
Kubernetes
  -> live workloads, Services, ScaledObjects, Pods, Events
Runtime/GCP
  -> IAM, Workload Identity, Secret Manager, Pub/Sub, Redis, buckets, LB
```

## Normal Question Routing

| Question | Start With |
| --- | --- |
| What will be deployed? | `k8s-deploy/newaile/<service>/values.yaml` and `values.<env>.yaml`. |
| Which chart behavior applies? | Wrapper `Chart.yaml`, then the matching `flex-app` chart version. |
| Why did a resource render this way? | Helm render summary plus `flex-app/templates/`. |
| Did GitOps sync it? | Argo CD app status. |
| Is it running? | Kubernetes live workload and Events. |
| Can it access secrets or GCP resources? | ServiceAccount annotation, Workload Identity binding, Secret Manager refs, and GCP resource metadata. |

## Safe Expansion Rule

Start with the smallest evidence that can answer the question. Expand to the
next layer only when the current layer shows:

- a concrete mismatch;
- a missing field;
- an error;
- a readiness claim that needs proof.

## Example: `aile-service-gateway`

The basic evidence chain is:

```text
springcloud-aile CI
-> k8s-deploy/newaile/aile-service-gateway
-> flex-app dependency alias stable
-> flex-app templates
-> Argo CD application
-> Deployment/Service/ScaledObject in Kubernetes
-> GCP Load Balancer / NEG / Workload Identity / Secret Manager
```

This wiki currently documents the `k8s-deploy` and `flex-app` parts. Application
repo CI, Argo CD, live Kubernetes, and GCP runtime evidence should be added as
separate pages or service sections after targeted inspection.
