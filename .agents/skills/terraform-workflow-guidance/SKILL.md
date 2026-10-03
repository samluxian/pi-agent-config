---
name: terraform-workflow-guidance
description: Use a plan-first Terraform workflow to inspect, explain, review, or maintain infrastructure across repositories. Discover root, backend, ownership, provider, and validation conventions before edits; never apply or mutate state.
---

# Terraform Workflow Guidance

Use evidence-first, plan-first Terraform practice in a user-identified repository.
Cloud and remote state remain read-only. Do not assume one repository's root,
backend, CI, language, or helper conventions apply to another.

## Flow

1. Confirm task type, repository, branch/status, exact root/workspace/environment,
   source ownership, state/backend owner, provider and available non-secret
   validation path. For requested edits, require a branch allowed by the workspace
   contract and exact owned files; its repository-specific exceptions apply only
   within their stated scope. Treat other roots as read-only evidence.
2. Discover the target repository's root layout, backend configuration (without
   reading secrets/state), variables, modules, provider constraints, CI and local
   wrappers. Compare the closest same-family root. Use `references/repo-map.md`
   and `scripts/terraform_repository_preflight.sh` only when their documented
   layout matches; otherwise derive the workflow from target evidence, not that
   adapter. If ownership or backend cannot be established, stop before editing.
3. Trace variables -> locals -> modules/resources -> outputs and state addresses.
   Distinguish official provider guidance, repository convention, plan evidence,
   and observed infrastructure. For replacement or immutable fields, read
   `references/plan-replacement-review.md`, inventory active references, and
   assess add-before-destroy versus destroy-before-create ordering.
4. Before edits, identify exact files, expected plan actions, drift, IAM/network/
   state risk, compatibility, and validation. Resolve scope/safety gaps with the
   user; preserve resource addresses, `for_each` keys, and identifiers unless an
   approved migration explains the transition.
5. Apply only the smallest approved repository change. Never run `apply`, import,
   state/workspace mutation, or remote Git changes. For import, ownership
   transfer, saved plan, or failed apply, read
   `references/state-handoffs-and-recovery.md` before suggesting user actions.
6. For every affected root/environment, run repository-appropriate fmt and
   validate plus an unsaved plan when backend/provider access and safety permit.
   Read `references/terraform-usage-and-validation.md` for command semantics,
   initialization side effects, version locks, and test safety. Inspect wrappers,
   data sources, and test runs before execution; never assume a plan or test is
   offline or mutation-free. Do not upgrade dependencies, migrate backends,
   disable locking, or run apply-based tests as validation.
   In the documented adapter, use the repository's
   `scripts/run-terraform.sh plan <service-path> <env>` helper. Else use the
   discovered repository workflow; never guess an initialization or backend
   command. Use `scripts/summarize_terraform_plan.py` for supported text plans.
   Record addresses, action order, warnings/errors, add/change/destroy/replace
   counts, unknown values, and unexpected drift, not raw sensitive output.
   If plan cannot safely run, report the validation gap; do not claim readiness.
7. When an MR/pipeline identifier is supplied, inspect its actual CI plan
   read-only. Compare status, commit SHA and plan actions to local evidence;
   never trigger/retry a job, approve, merge, or apply.

Use `references/terraform-usage-and-validation.md` for general Terraform usage,
version constraints, sensitive values, and testing. Load
`references/google-cloud-terraform-best-practices.md`,
`references/iam-review-checklist.md`, or `references/firewall-review-checklist.md`
only for relevant Google Cloud, IAM, or network work. Treat Google recommendations
as a comparison baseline, not permission to replace an established repository
workflow or backend. Use
`references/beginner-runbook.md` for basic plan interpretation; its Google Cloud
Storage retirement procedure applies only to that resource and layout. Follow
the target repository's documentation language conventions.

## Stop Conditions

Stop on unresolved root/workspace/backend/state owner, missing access, active or
unexplained state lock, partial apply, credential request, unexpected destruction
or replacement, broad IAM, or a plan beyond approved scope. Do not retry
state-lock or authentication failures. Never save plan files or print sensitive
state, plan output, credentials, or secrets.

## Domain Reporting

Name each affected root/environment, fmt/validate/plan status or gap, action
counts, unexpected drift, unknowns, replacement/state/IAM/network risk, and
CI comparison when available. Name validation/test modes and whether providers
were mocked or real; static checks and mocked tests do not prove cloud readiness.
A successful format check alone is not a plan.
