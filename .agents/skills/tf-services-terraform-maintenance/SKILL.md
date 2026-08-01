---
name: tf-services-terraform-maintenance
description: "Maintain or review tf-services Terraform for GCP IAM, Workload Identity, firewalls, VMs, Secret Manager resources, and backend/state with beginner-safe plan guidance."
---

# tf-services Terraform Maintenance

Use this skill when the user identifies a `tf-services` repository to learn,
inspect, plan, review, or safely maintain.

## Terraform Boundaries

Treat IAM, firewalls, VMs, backend/state, and provider-version changes as high
risk. Explain the blast radius before proposing edits. Default checks are
`terraform fmt -check`, `terraform validate -backend=false` when safe, and a
plan only after the target service and environment are explicit.

## Start

Run repo preflight in the user-identified target repo:

```bash
cd <tf-services-repo>
git branch --show-current
git status --short --untracked-files=all
git diff --name-status HEAD
git diff --cached --name-status
```

If editing is requested on `main`, stop and ask the user to create or switch to
a working branch. Complete when target repo, service, environment, branch, and
dirty state are known.

For a compact baseline, use:

```bash
.agents/skills/tf-services-terraform-maintenance/scripts/tf_services_preflight.sh <tf-services-repo>
```

## Beginner Flow

1. Identify one target service and environment. Complete when both are explicit.
2. Read the matching reference: `references/repo-map.md`,
   `references/beginner-runbook.md`, `references/iam-review-checklist.md`, or
   `references/firewall-review-checklist.md`. Complete when the selected command
   and its affected resource are understood.
3. Explain each suggested command, its evidence, and remaining risk. Prefer:

   ```bash
   bash scripts/run-terraform.sh plan <service-path> <env>
   ```

   Complete when the user can distinguish `+` create, `~` update, `-` destroy,
   and `-/+` replace in the plan.
4. Stop before apply and summarize risk, validation, and the next user decision.
   Complete when no mutating Terraform command has been run or proposed as an
   agent action.

## Output

```text
結論:
我檢查了:
概念說明:
建議操作:
風險:
下一步:
```
