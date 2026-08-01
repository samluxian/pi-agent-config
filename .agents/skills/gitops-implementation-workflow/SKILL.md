---
name: gitops-implementation-workflow
description: "Implement an explicitly approved repo-file change to GitOps desired state, Helm values, CI handoff, or workspace guidance. Use only after approval covers the exact patch. Do not use for read-only diagnosis, static audits, architecture mapping, or MR description writing."
---

# GitOps Implementation Workflow

Use this skill only when the task includes repo-file implementation. For
read-only checking, troubleshooting, or review, use `$gitops-diagnostics-workflow`.
For static inventory before deciding whether to patch, use `$gitops-repo-audit`.

## Rules

- Prefer service-owned values over shared chart or discovery changes unless the
  approved scope explicitly requires the shared surface.
- Read `references/helm-alias-overlays.md` when values use `common`, `stable`,
  `beta`, or another dependency-alias split.
- Read `.agents/shared/gitops/references/gke-autopilot-resource-requests.md`
  before changing GKE Autopilot CPU or memory requests.
- Use `$gitops-mr-summary` when the user asks for MR copy.

## Implementation Flow

1. Prove approval and scope. Run the workspace approval and branch/status gate
   from `AGENTS.md`; identify the target repo, requested behavior, intended
   files, affected environments, and pre-existing dirty changes. Complete when
   explicit approval covers the exact patch and every existing change is
   preserved or named as a blocker.
2. Inspect ownership and callers. Read the current values, templates, schemas,
   CI handoff, discovery rules, and adopting services that can change the
   result. Complete when every intended behavior change has one owning file and
   every affected caller is accounted for.
3. Apply the smallest approved patch. Do not reformat, rename, reorder, or clean
   adjacent content. Complete when the working diff contains only approved
   behavior and unavoidable documentation synchronization.
4. Prove each changed branch. Use the deterministic helper below, then add only
   the narrow checks needed for changed Helm, CI, documentation, or workspace
   guidance behavior. Complete when every affected environment or branch has
   fresh evidence, or an exact validation gap is reported.
5. Review and hand off. Account for every changed file, run `git diff --check`,
   and report deployment, IAM, CI, runtime, or documentation risk. Complete
   when the user can review the patch and run any remaining user-operated
   delivery step without reconstructing missing context.

## Deterministic Helper

Use the wrapper first when the target repo and optional Helm chart inputs are
known:

```bash
.agents/skills/gitops-implementation-workflow/scripts/implementation_flow.sh [--allow-main] [--chart <chart-path> --release <release> --namespace <namespace> --env <env>] [--changed-path <path>] <repo-path>
```

What the wrapper does:

1. Run repo preflight.
2. Check Helm dependency artifacts when `--chart` is provided.
3. Check values overlay risks when base and environment values files exist.
4. Render the chart to a temp file and output a compact JSON manifest summary
   when Helm inputs are complete.
5. Run post-patch review when `--changed-path` is provided.

If the wrapper lacks a needed input, run the narrow existing script directly
from this skill's `scripts/` directory and report the gap.

Use `.agents/shared/gitops/scripts/render_helm_values.sh` for new Helm render
checks. The adjacent `render_flex_app.sh` remains a compatibility shim.

## Optional KEDA Work

When the user explicitly chooses KEDA/event-driven autoscaling, read
`references/keda-implementation.md` before editing infra charts, shared app
charts, service values, or HPA handoff paths. Treat KEDA as opt-in; do not assume
it should be installed or enabled for unrelated autoscaling work.

## Output

Lead with the completed behavior, not the editing narrative. Make successful
validation visible, keep each remaining action bounded, and name only one
immediate next step.

```text
Summary:
Changed files:
Validation:
Risk:
Next step:
```

For branch-ready delivery work, also include a suggested commit message,
validation gaps, and any render-to-live diff command needed for reviewer
verification. Use `$gitops-mr-summary` when the user wants the MR description
itself.
