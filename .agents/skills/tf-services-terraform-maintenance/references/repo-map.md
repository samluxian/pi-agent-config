# tf-services Repo Map

Target repo:

```text
<tf-services-repo>
```

## Top-level layout

```text
Makefile                  Local wrapper commands
.gitlab-ci.yml            Currently secret detection only
scripts/                  Helper scripts for discovery and Terraform execution
newaile/                  Terraform services and shared module
docs/                     Human documentation
```

## Terraform service layout

Most services follow this shape:

```text
newaile/<service>/
├── main.tf
├── vars.tf
├── outputs.tf            optional
├── environments/
│   └── <env>.backend.tfvars
└── other resource files
```

`environments/<env>.backend.tfvars` selects the remote GCS backend state for that
service/environment. The backend file is not normal input variables; it tells
Terraform where to read and write state.

## Current services

| Service | Environments | Main responsibility |
| --- | --- | --- |
| `newaile/aileai-brainhub` | `dev` | Secret Manager secret shell |
| `newaile/infra-firewalls` | `infra` | Shared VPC firewall rules |
| `newaile/ippbx` | `dev` | IPPBX VM, public IP, SSH/IAP, VoIP firewall |
| `newaile/service-account-iam` | `dev`, `qa`, `uat`, `prod` | Google service accounts, Workload Identity, service IAM roles |
| `newaile/user-access` | `dev`, `qa`, `uat`, `prod`, `infra` | Human user project IAM bindings |
| `newaile/windows-builder` | `dev` | Windows builder VM, public IP, RDP/IAP firewall |

Confirm this list with:

```bash
bash scripts/list-services.sh
```

## Shared defaults module

`newaile/modules/defaults` maps `env_name` to GCP project IDs and default labels.
All services that use it derive `module.defaults.project_id` from `var.env_name`.
Before adding a new environment, confirm the environment exists in this map and
has the correct project ID.

## Common risk areas

- `user-access/vars.tf`: human IAM roles; high blast radius when `owner`,
  `editor`, or project IAM admin roles appear.
- `service-account-iam/vars.tf`: service IAM roles and Workload Identity service
  account existence.
- `infra-firewalls/vars.tf`, `ippbx/firewall.tf`, `windows-builder/firewall.tf`:
  firewall exposure, priorities, `0.0.0.0/0`, target tags, and Shared VPC
  project placement.
- `environments/*.backend.tfvars`: remote state target. Wrong bucket/prefix can
  point Terraform at the wrong state.
