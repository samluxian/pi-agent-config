# Beginner Terraform Runbook for tf-services

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
cd <tf-services-repo>
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
bash scripts/run-terraform.sh plan newaile/service-account-iam dev
```

This script does roughly:

```bash
cd newaile/service-account-iam
terraform init -backend-config=environments/dev.backend.tfvars
terraform plan -var="env_name=dev"
```

## Reading plan output

| Symbol | Meaning | Typical risk |
| --- | --- | --- |
| `+` | Create a new resource | Medium; confirm project/env/name |
| `~` | Update in place | Depends on field; IAM/firewall can be high risk |
| `-` | Destroy a resource | High risk; stop and confirm |
| `-/+` | Replace resource | High risk; may recreate VM/IP/IAM resource |

Never judge a plan only by the count. Read the exact resource addresses and the
important attributes: project, role, member, source range, ports, target tags,
service account email, VM name, and backend environment.

## Common tasks

### Add service account / Workload Identity access

Usually inspect:

```text
newaile/service-account-iam/vars.tf
newaile/service-account-iam/services.tf
```

Questions to answer before editing:

- Which Kubernetes service name will bind to the Google service account?
- Which envs need the account?
- What exact least-privilege GCP roles are required?
- Does the namespace/member format match `newaile/<service>`?

### Add or change human IAM access

Usually inspect:

```text
newaile/user-access/vars.tf
newaile/user-access/users.tf
```

Questions to answer before editing:

- Who is the user?
- Which env/project?
- What task requires the role?
- Can a narrower role replace `owner` or `editor`?

### Add or change firewall rules

Usually inspect:

```text
newaile/infra-firewalls/vars.tf
newaile/infra-firewalls/firewall-rules.tf
newaile/ippbx/firewall.tf
newaile/windows-builder/firewall.tf
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
- backend bucket/prefix looks different than expected;
- role includes `owner`, `editor`, project IAM admin, or secret manager admin;
- firewall source is `0.0.0.0/0` or very broad;
- a change touches multiple services or environments;
- Terraform asks for credentials or provider access that is not already present.
