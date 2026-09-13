---
name: gitops-state-diagnostics
description: Diagnose mismatches across GitOps desired state, Helm render, Argo CD, Kubernetes, GitLab handoff, or GCP prerequisites. Use for read-only expected-versus-actual checks. Do not use for edits, static audits, MR prose, or dependency wiring.
---

# GitOps State Diagnostics

Find the first evidence-backed divergence without mutating delivery or runtime
systems. Keep application, desired-state, render, control-plane, live, and
runtime evidence separate.

## Diagnostic Loop

1. Define expected behavior, actual symptom, target service/environment, time
   window, and known recent change. Analyze a supplied diagnostic packet first.
2. Confirm target repository branch/status or record why repository evidence is
   not needed.
3. Choose the first relevant evidence layer; do not traverse every layer by
   default:
   - application/CI handoff
   - desired state and chart metadata
   - effective Helm render
   - Argo CD status
   - Kubernetes live state
   - runtime/GCP prerequisites
4. Collect a bounded summary. Expand only for a concrete error, missing field,
   mismatch, or readiness claim.
5. Compare expected versus actual, identify the first divergence, and state what
   evidence would falsify the diagnosis.
6. Stop after the cause or next decisive check is supported. Hand repository
   fixes to the appropriate implementation workflow.

Use `references/troubleshooting-matrix.md` to select checks and
`scripts/diagnostics_flow.sh` for fixed repository diagnostics. For Helm, prefer
`.agents/shared/gitops/scripts/render_helm_values.sh`. Read
`references/source-runtime-contract.md` only after mapping a running image to its
deployed revision. For a concrete resource-admission or scheduling finding,
inspect workload resource requests and the relevant Kubernetes-layer evidence.

## Safety and Stop Conditions

- Never print Secrets or broad manifest/log dumps.
- Stop on unresolved target identity, missing authentication, stale refs that
  affect the conclusion, or a required mutation.
- Do not infer dependency usage, rollout causality, or source behavior from names
  alone.

## Output

```text
Finding:
- Expected versus actual and first divergence

Evidence:
- Layer, bounded command/source, and minimal result

Cause:
- Supported immediate cause; contributing factor separately

Uncertainty:
- Missing evidence or falsifying check

Recommended action:
- One safe next step; identify implementation handoff if needed
```
