# GitOps Router

This context defines the language used for the user's GitOps work across service repos, `k8s-deploy`, shared Helm charts, ArgoCD, Kubernetes, GitLab CI/CD, and GCP runtime dependencies.

## Language

**GitOps Router**:
The compatibility entrypoint that routes broad GitOps requests to the narrow implementation, diagnostics, audit, or memory workflow.
_Avoid_: Helm migration, deploy script

**Desired State**:
The deployment intent recorded in Git, usually in `k8s-deploy`, Helm values, Kustomize overlays, bootstrap configuration, or CI files.
_Avoid_: Live config, current deployment

**Render Evidence**:
The manifests produced from desired-state inputs by tools such as Helm or Kustomize before they are applied to a cluster.
_Avoid_: Live manifest

**Live State**:
The Kubernetes resources, ArgoCD Application state, pod logs, events, and runtime configuration currently observed from a cluster.
_Avoid_: Repo state, desired state

**Runtime Evidence**:
Observed behavior from running workloads or cloud control-plane resources, such as pod logs, identity, Redis, Pub/Sub, IAM, or API access.
_Avoid_: Render evidence

**Source of Truth**:
The evidence source that is authoritative for a specific question, such as Git for desired state or Kubernetes for current live resources.
_Avoid_: Single truth

**Bootstrap Application**:
The parent ArgoCD layer that discovers or generates child Applications from project folders and environment values.
_Avoid_: Deployment app

**Child Application**:
The ArgoCD Application that points to one service chart or overlay and renders workload resources.
_Avoid_: Parent app

**Workload Resources**:
The Kubernetes objects rendered by a child Application for a service, such as Deployment, Service, ConfigMap, ServiceAccount, HPA, and PDB.
_Avoid_: App config

**flex-app**:
The shared Helm application chart used as a reusable target shape for service deployments.
_Avoid_: Custom app chart

**Environment Overlay**:
The environment-specific desired-state values for one deployment target, such as `values.dev.yaml`, `values.qa.yaml`, or `values.uat.yaml`.
_Avoid_: Global values

**Ignored Environment Overlay**:
An environment values file intentionally excluded from bootstrap discovery while preserving migration or rollback evidence.
_Avoid_: Disabled config

**Helm-to-ArgoCD Handoff**:
The transition where a workload previously controlled by Helm becomes controlled by ArgoCD desired state.
_Avoid_: Helm cleanup

**Approval Gate**:
The point where the agent must stop after analysis and wait for explicit user approval of the exact files, behavior, validation, and risk before editing.
_Avoid_: Best effort approval

**Branch-to-Branch Dry Run**:
A safe test path where upstream CI and downstream GitOps changes both target feature branches instead of shared deployment branches.
_Avoid_: Tag deploy test

## Relationships

- A **GitOps Router** starts from broad GitOps intent and selects a narrow workflow.
- **Desired State** produces **Render Evidence** before it becomes **Live State**.
- **Runtime Evidence** can confirm or contradict assumptions made from **Desired State**, **Render Evidence**, or **Live State**.
- A **Bootstrap Application** creates or manages one or more **Child Applications**.
- A **Child Application** renders **Workload Resources** for exactly one deployment target.
- An **Environment Overlay** can enable discovery, while an **Ignored Environment Overlay** preserves values without enabling discovery.
- A **Helm-to-ArgoCD Handoff** changes the controller of **Workload Resources** from Helm to ArgoCD.
- An **Approval Gate** must be passed before the agent edits **Desired State**.

## Example Dialogue

> **Dev:** "Can we say this is deployed after the Helm render passes?"
> **Domain expert:** "No. The render is **Render Evidence** only. We still need ArgoCD and Kubernetes **Live State** before saying the change is deployed."

## Flagged Ambiguities

- "GitOps skill" means the router plus narrower GitOps implementation, diagnostics, and audit workflows, not only Helm chart migration.
- "live manifest" should mean **Live State** from the cluster, not **Render Evidence** from `helm template`.
- "source of truth" must name the question it answers; Git, render output, ArgoCD, Kubernetes, and GCP are authoritative for different questions.
