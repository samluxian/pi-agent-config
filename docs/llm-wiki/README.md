# DevOps LLM Wiki

This wiki is the retrieval-friendly knowledge base for DevOps and GitOps work
owned from this workstation. Its job is to give an LLM stable facts, boundaries,
and evidence paths before it answers deployment questions.

The wiki is not the deployment authority. It points to the authority:

```text
application repo / CI -> k8s-deploy desired state -> shared chart/render ->
Argo CD -> Kubernetes live state -> runtime/GCP evidence
```

Use this wiki to answer:

- which repository owns a deployment fact;
- how `k8s-deploy` and `flex-app` fit together;
- which files should be inspected before changing a service;
- which evidence layer proves a claim;
- which commands or repo paths are safe first checks.

## Structure

| Path | Purpose |
| --- | --- |
| `evidence-layers.md` | Authority boundaries for source, desired state, render, Argo CD, live Kubernetes, and GCP/runtime facts. |
| `repos/` | Repository-level ownership, layout, and first-check guidance. |
| `charts/` | Shared Helm chart contracts such as `flex-app`. |
| `workflows/` | Cross-repo operating flows. |
| `indexes/` | Machine-readable lookup tables for LLM retrieval. |

## Current Scope

This first version covers:

- `/home/samlu/devops-repos/k8s-deploy`
- `/home/samlu/devops-repos/helm-chart`
- `charts/flex-app`
- one example service index entry for `aile-service-gateway`

Expand service pages only after the repo evidence is checked. Do not copy full
manifests, secrets, logs, or generated render output into this wiki.

## Update Rules

- Keep facts tied to source paths.
- Mark drift-prone facts such as branches, image tags, live status, and rollout
  results as time-specific.
- Prefer indexes for lookup and Markdown pages for explanation.
- Keep service-specific runtime dependencies separate from generic chart
  behavior.
- Never include secret values, kubeconfig content, private keys, tokens, or full
  `.env` content.
