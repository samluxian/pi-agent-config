---
name: kubernetes-platform-guidance
description: Apply Kubernetes best practices and a fixed evidence-first workflow for resource configuration, workloads, GitOps/Helm integration, platform delivery, or cluster diagnosis. Use for Kubernetes tasks; never mutate live clusters.
---

# Kubernetes Platform Guidance

Use an evidence-first workflow for Kubernetes questions, diagnosis, and approved
repository changes. Do not infer deployed state from source or render alone.

## Flow

1. Identify the task type (explanation, diagnosis, or repository edit), target
   cluster/environment, namespace, component, repository, and desired-state owner.
   Establish actual client/server versions and relevant API/controller support
   when compatibility matters; never assume current docs match the target.
   For edits, check the actual target branch, staged and unstaged state; stop on
   protected/shared branches and resolve ownership before modifying files.
2. Start with supplied symptoms and relevant source. Trace resource ownership and
   callers: manifests, Helm values/templates, GitOps application/bootstrap, CI,
   and related defaults or schemas, only where applicable. Separate source intent,
   render, Argo CD status, live Kubernetes objects, and runtime evidence.
3. For diagnosis, perform bounded read-only inspections of a named or safely
   discovered context and resources. Compare desired and observed state, events,
   status, and relevant non-secret logs. Follow
   `references/kubernetes-usage-and-validation.md` for safe target discovery,
   field-selected queries, bounded logs, and symptom-to-evidence checks. Inspect
   outputs for sensitivity before retrieval; broad describe/spec dumps are not
   automatically safe. Identify evidence, hypotheses, gaps, and the smallest next
   check; do not treat a render as runtime readiness or current metrics as history.
4. For requested edits, identify exact owned files, behavior, compatibility and
   rollout impact. Review applicable resource/probe, selector, disruption/storage,
   scaling-owner, security/RBAC and network contracts using the baseline below.
   Ask before expanding scope to other components, IAM, CI, bootstrap, or
   live-system changes. Apply the smallest approved repository diff.
5. Validate against changed behavior: syntax/schema, repository-owned tests,
   relevant Helm render or GitOps discovery check, and final bounded diff/status.
   Separate parse/schema, render, admission, controller and runtime evidence.
   Do not use kubectl diff or server dry-run as read-only validation: they submit
   write-authorized API requests and exercise admission. Report skipped live
   checks and any unverified deployment claims separately.

Use `references/kubernetes-best-practice-baseline.md` for general workload,
availability, autoscaling, security and network recommendations, and
`references/kubernetes-usage-and-validation.md` for diagnosis and validation.
Use `references/gke-platform-guidance.md` only for confirmed GKE-specific
Autopilot, identity, dataplane or upgrade behavior. Official recommendations are
a comparison baseline, not permission to change an established platform or
assume an observed policy is enforced.

Read `references/keda-implementation.md` only for KEDA platform installation or
prerequisites in its supported layout; verify applicability before using any
layout-specific guidance. For chart template/schema behavior use
`$helm-chart-best-practices`. Service values and Kubernetes manifests remain in
scope when the task names their owning repository; chart ownership does not
follow from the presence of Helm values alone.

## Safety And Stop Conditions

Never mutate Kubernetes, Argo CD, Git remotes, cloud, or secrets. Do not invent
contexts, namespaces, identities, endpoints, revisions, or versions. Stop for
unresolved target/owner, conflicting evidence, or unapproved prerequisite or
blast-radius changes. User authorization covers only named repository edits,
not live operations. Do not use exec/debug/run/port-forward, node proxy,
Secret get/list/watch, raw kubeconfig, context switching, or cluster-facing test
workloads as diagnostic shortcuts. Official tutorials do not override these
limits; use permitted evidence and report the remaining gap.

## Domain Reporting

Name the affected resources, repository paths, environment, evidence layer,
validation results, client/server/API assumptions, GitOps/Helm relationship when
applicable, runtime gaps, and material resource, rollout, storage, identity,
network or compatibility risk. Distinguish official guidance, repository intent,
admission/defaulting effects and observed behavior.
