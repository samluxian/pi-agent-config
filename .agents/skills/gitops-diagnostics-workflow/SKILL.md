---
name: gitops-diagnostics-workflow
description: "Diagnose delivery-state mismatches across desired state, Helm render, Argo CD, Kubernetes, GitLab handoff, and GCP prerequisites. Use runtime-dependency-ops for application dependency wiring."
---

# GitOps Diagnostics Workflow

Use this skill for inspection and troubleshooting. Do not edit files here; if a
fix is needed, report the smallest patch and hand back to
`$gitops-implementation-workflow` after user approval.

## Diagnostic Loop

1. Frame the requested conclusion, expected versus actual behavior, affected
   environment, namespace, service/workload, and incident window or
   last-known-good baseline. Start from the user's diagnostic packet when one is
   provided. Complete when these fields are evidence-backed or the single fact
   blocking a reliable probe is named.
2. State one working hypothesis and the result that would reject it. For
   symptom-driven debugging, select one branch from
   `references/troubleshooting-matrix.md` before running tools. Complete when
   one evidence layer and one falsifying result are explicit.
3. Run the smallest read-only probe that separates the current hypothesis from
   its alternative. Complete when the probe returns bounded evidence or an
   exact tool, auth, context, or data-coverage gap.
4. Classify a completed probe as `supported`, `rejected`, `inconclusive`, or
   `no coverage`. Reserve `no coverage` for evidence that does not span the
   relevant scope or time; a probe blocked by tooling, auth, or context is an
   `inconclusive` validation gap. Complete when the result's meaning is explicit
   rather than inferred from an empty response.
5. Stop when one supported cause is sufficient for the requested conclusion.
   Cross to another evidence layer only when the result names that layer or is
   inconclusive; state the next hypothesis before the next probe. Complete when
   the conclusion is supported or the single next narrow check is named.

## Fixed Flow

Use the wrapper for common diagnostics:

```bash
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh repo <repo-path>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh helm <release> <chart-path> <namespace> <env> [helm args...]
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh helm-json <release> <chart-path> <namespace> <env> [helm args...]
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh manifest-json <manifest-path>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh diff-json [kubectl-diff-output-path]
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh gitlab-pipeline <project-path> <pipeline-id>
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh argocd <app> <namespace> [pod-label-selector]
.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh wi --project <project> --namespace <ns> --ksa <ksa> --gsa <gsa> [--deploy <deploy>] [--api <api>] [--secret <secret>]
```

The wrapper delegates to fixed read-only scripts for preflight, Helm readiness,
compact manifest JSON summaries, compact `kubectl diff` JSON summaries, ArgoCD
minimal health, compact GitLab pipeline summaries, and GCP/Workload Identity
prerequisites.

Use `.agents/shared/gitops/scripts/render_helm_values.sh` for new Helm render
checks. The adjacent `render_flex_app.sh` remains a compatibility shim. Use
`check_flex_app_defaults.py` only when the shared chart under review is actually
`flex-app` or compatible with its conventions.

JSON summary rule:

- Prefer `helm-json`, `manifest-json`, or `diff-json` before reading raw YAML or
  raw diff.
- Read raw artifacts only by targeted path and only for a specific finding that
  the JSON summary cannot explain.
- Quote only the minimal safe snippet needed for the user-facing answer.

GitLab pipeline completion criterion:

- Start from pipeline metadata and job status. Identify the failing layer before
  reading traces: pre-check, build, GitOps update, legacy deploy, or downstream.
- Use `gitlab-pipeline` to summarize failed job traces; do not load full traces
  unless the compact key lines are insufficient.
- Complete when the first failing delivery layer and its supporting job evidence
  are identified, or the exact missing trace/auth fact is reported.

Use direct targeted commands only when the wrapper cannot answer the question.
Report any missing tool, auth, cluster context, or sandbox escalation as a
validation gap.

For Argo CD `SyncFailed` or OutOfSync cases that mention GKE Warden, Autopilot
resource adjustment, CPU or memory request minimums, or pod anti-affinity, read
`.agents/shared/gitops/references/gke-autopilot-resource-requests.md` before
recommending a patch.

## Output

```text
結論:
Scope / incident window:
工作假設:
Probe:
判讀: supported | rejected | inconclusive | no coverage
Evidence budget:
證據:
風險:
Next narrow check:
Skill follow-up:
```

For recurring lessons, recommend exactly one: update an existing skill, create a
new skill, write session memory only, or no skill change.
