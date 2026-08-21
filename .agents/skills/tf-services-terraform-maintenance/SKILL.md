---
name: tf-services-terraform-maintenance
description: Inspect, explain, plan-review, or maintain Terraform in a named tf-services repo. Use for its GCP IAM, Workload Identity, network, VM, Secret Manager reference, or state work. Do not use for Terraform elsewhere or runtime diagnosis.
---

# tf-services Terraform Maintenance

Use beginner-safe, plan-first Terraform practice in a user-identified
`tf-services` repository. GCP and remote state remain read-only.

## Flow

1. Confirm repository, exact editable roots, service/environment, branch/status,
   task type, backend, and whether the user requests inspection, plan review, or
   an approved edit. Treat every unapproved source or legacy root as read-only
   evidence; cross-project IAM ownership does not widen the edit boundary.
2. Run `scripts/tf_services_preflight.sh` or inspect equivalent bounded evidence.
   Before root authoring or maintenance, read `references/repo-map.md` and
   compare the closest existing root in the same family. For a Google Cloud
   architecture, root-layout, or module best-practice review, load
   `references/google-cloud-terraform-best-practices.md` and keep official
   guidance, repository policy, and current implementation separate.
3. Trace variables -> locals -> modules/resources -> outputs and state address.
   Apply the repo map's root, file, and configuration-ownership conventions by
   default. Keep a deviation only when concrete same-family evidence requires it.
   Explain unknown values and replacement risk without guessing provider behavior.
   Write Terraform README prose, section headings, and generated input/output
   descriptions in Traditional Chinese; preserve commands and identifiers.
   For imports, ownership transfers, saved plans, or failed applies, load
   `references/state-handoffs-and-recovery.md` before proposing commands.
4. For edits, propose exact files, plan expectation, IAM/network/runtime risk, and
   validation; wait for explicit approval and require a non-protected branch.
5. Apply the smallest approved change. During structural cleanup, preserve state
   addresses, `for_each` keys, and exact infrastructure identifiers. Never run
   `apply`, import, state mutation, workspace mutation, or remote Git operations.
6. After the final repository edit, give a fresh reviewer every exact affected
   root/environment. The reviewer must run formatting, affected-root validation,
   and an unsaved remote-state plan with
   `scripts/run-terraform.sh plan <service-path> <env>` for each pair. Require an
   add/change/destroy/replace summary and explicit unexpected-drift findings.
   Accept Terraform `No changes.` or an explicit zero-action summary as no-op.
   Continue independent root plans after a root-local failure; stop related roots
   on shared authentication, state-lock, backend, ownership, or safety failure.

Load deeper guidance only when needed:

- `references/google-cloud-terraform-best-practices.md` for Google Cloud root,
  module, state, CI, security, and testing architecture guidance.
- `references/beginner-runbook.md` for command meaning and plan review.
- `references/state-handoffs-and-recovery.md` for import, cross-root ownership,
  saved-plan, state-lock, and partial-apply procedures.
- `references/iam-review-checklist.md` for least-privilege IAM/WI.
- `references/firewall-review-checklist.md` for network exposure and rules.

## Stop Conditions

Stop on unresolved target root/workspace/environment, missing initialization or
provider access, unknown state owner, active or unexplained state lock, unresolved
partial apply, credential request, unexpected replacement/destruction, broad IAM,
or a plan that exceeds approved scope. Do not retry authentication or state-lock
failures. Never save plan files or print sensitive state, plan output, or secrets.

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
