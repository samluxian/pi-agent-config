# Beginner Terraform Repository Runbook

## Mental model

Terraform has three important inputs:

1. `.tf` files: the desired infrastructure code.
2. Remote state: Terraform's memory of resources it manages.
3. The cloud provider: real GCP resources.

`terraform plan` compares desired code plus state against GCP and proposes a
change. `terraform apply` performs the change. In this workspace, the agent must
not run apply; it should stop at plan review unless the human operates apply.

## Safe command sequence

Always start with repo status:

```bash
cd <terraform-repository>
git branch --show-current
git status --short --untracked-files=all
git diff --name-status HEAD
git diff --cached --name-status
```

List available service/env pairs:

```bash
bash scripts/list-services.sh
```

Check formatting without changing files:

```bash
terraform fmt -check -recursive .
```

Run a single service/env plan:

```bash
bash scripts/run-terraform.sh plan <family>/<service> <env>
```

This script does roughly:

```bash
cd <family>/<service>
terraform init -backend-config=environments/<env>.backend.tfvars
terraform plan -var="env_name=<env>"
```

## Reading plan output

| Symbol | Meaning | Typical risk |
| --- | --- | --- |
| `+` | Create a new resource | Medium; confirm project/env/name |
| `~` | Update in place | Depends on field; IAM/firewall can be high risk |
| `-` | Destroy a resource | High risk; stop and confirm |
| `-/+` | Replace resource | High risk; may recreate VM/IP/IAM resource |

Never judge a plan only by the count. A replacement contributes both an add and
a destroy. Read the exact resource addresses and the important attributes:
project, role, member, source range, ports, target tags, service account email,
VM name, and backend environment.

If automation saves a plan, keep plan and apply in the same repository wrapper
and working-directory contract, resolve the plan artifact path explicitly, and
apply only the artifact tied to the approved commit. Treat saved plans as
sensitive and invalidate them after configuration, state, provider, credential,
or partial-apply changes. For imports, state handoffs, locks, or failed applies,
follow `state-handoffs-and-recovery.md`.

## Retire a Google Cloud Storage bucket

Before proposing a bucket-removal apply, confirm the exact resource address,
state owner, current `deletion_policy`, `force_destroy`, and whether objects
must be retained. Stop if any of these facts are unknown.

| Condition | Required action |
| --- | --- |
| `deletion_policy = "ABANDON"` | Do not remove the resource. An apply would release state ownership without deleting the live bucket. Keep the resource, set `deletion_policy = "DELETE"`, apply that in-place update, then generate a fresh plan. |
| Bucket is expected to be empty | Keep `force_destroy = false`; independently confirm it is empty before reviewing the destroy plan. |
| Bucket has objects and their deletion is explicitly approved | Keep the resource, set `force_destroy = true`, apply that in-place update, then generate a fresh plan before removing the resource. |
| Bucket has objects that must be retained | Stop. Do not set `force_destroy = true` or remove the resource until the retention owner provides a separate cleanup or handoff plan. |

Do not change a shared deletion setting if it also controls another bucket.
After each policy update, require a fresh plan. The final destroy plan must name
the exact bucket address and contain no unexpected changes. `force_destroy = true`
allows Terraform to delete bucket objects; treat that as an irreversible,
user-approved data deletion.

## Common tasks

### Add service account / Workload Identity access

Usually inspect:

```text
<family>/<iam-root>/vars.tf
<family>/<iam-root>/<resource-file>.tf
```

Questions to answer before editing:

- Which Kubernetes service name will bind to the Google service account?
- Which envs need the account?
- What exact least-privilege GCP roles are required?
- Does the namespace/member format match the target repository evidence?

### Add or change human IAM access

Usually inspect:

```text
<family>/<human-access-root>/vars.tf
<family>/<human-access-root>/<resource-file>.tf
```

Questions to answer before editing:

- Who is the user?
- Which env/project?
- What task requires the role?
- Can a narrower role replace `owner` or `editor`?

### Add or change firewall rules

Usually inspect:

```text
<family>/<firewall-root>/vars.tf
<family>/<firewall-root>/<resource-file>.tf
```

Questions to answer before editing:

- Direction: ingress or egress?
- Source or destination CIDR?
- Ports and protocol?
- Target tags or target service accounts?
- Priority relative to existing allow/deny rules?

## Stop conditions

Stop and ask before continuing when:

- plan includes destroy or replace;
- state ownership is unknown or two roots may manage one remote object;
- an apply partially completed or an active lock owner is unresolved;
- backend bucket/prefix looks different than expected;
- role includes `owner`, `editor`, project IAM admin, or secret manager admin;
- firewall source is `0.0.0.0/0` or very broad;
- a change touches multiple services or environments;
- Terraform asks for credentials or provider access that is not already present.
