---
name: tf-services-terraform-maintenance
description: Inspect, explain, plan-review, or maintain Terraform in a named tf-services repo. Use for its GCP IAM, Workload Identity, network, VM, Secret Manager reference, or state work. Do not use for Terraform elsewhere or runtime diagnosis.
---

# tf-services Terraform Maintenance

Use beginner-safe, plan-first Terraform practice in a user-identified
`tf-services` repository. GCP and remote state remain read-only.

## Flow

1. Confirm repository, service/environment, branch/status, task type, backend,
   and whether the user requests inspection, plan review, or an approved edit.
2. Run `scripts/tf_services_preflight.sh` or inspect equivalent bounded evidence.
   Read `references/repo-map.md` when layout or ownership is unclear.
3. Trace variables -> locals -> modules/resources -> outputs and state address.
   Explain unknown values and replacement risk without guessing provider behavior.
4. For edits, propose exact files, plan expectation, IAM/network/runtime risk, and
   validation; wait for explicit approval and require a non-protected branch.
5. Apply the smallest approved change. Never run `apply`, import, state mutation,
   workspace mutation, or remote Git operations.
6. Validate with formatting, affected-root validation, and a user-operated plan.
   Use `scripts/run-terraform.sh` only for its documented safe modes.

Load deeper guidance only when needed:

- `references/beginner-runbook.md` for command meaning and plan review.
- `references/iam-review-checklist.md` for least-privilege IAM/WI.
- `references/firewall-review-checklist.md` for network exposure and rules.

## Stop Conditions

Stop on unresolved target root/workspace, missing initialization/provider access,
state lock, credential request, unexpected replacement/destruction, broad IAM,
or a plan that exceeds approved scope. Never print sensitive state or secrets.

## Output

```text
Summary:
- Root/service/environment and intended change or finding

Plan evidence:
- Add/change/destroy/replace summary and important unknowns

Validation:
- fmt, validate, plan status, and gaps

Risk:
- IAM, network, state, replacement, and runtime risk

Next step:
- One user-operated command or review action
```
