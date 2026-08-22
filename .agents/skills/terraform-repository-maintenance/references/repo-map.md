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
<family>/<service>/
├── main.tf
├── vars.tf
├── outputs.tf            optional
├── environments/
│   └── <env>.backend.tfvars
└── <resource-concern>.tf
```

A service root stays exactly two levels below the repository root because the
change-detection and execution scripts discover `<family>/<service>`. Shared
modules stay under `<family>/modules/`.

`environments/<env>.backend.tfvars` selects the remote GCS backend state for that
service/environment. The backend file is not normal input variables; it tells
Terraform where to read and write state. Its presence is also the service's
source of truth for enabled environments.

## Default root and configuration conventions

Before editing, compare the closest existing root in the same family. Apply the
following defaults unless that evidence shows a necessary exception:

- `main.tf` owns the `terraform` block, GCS backend declaration, shared defaults
  module, and provider configuration. Preserve required Terraform/provider
  constraints when they exist, but do not create a separate `versions.tf` by
  default.
- `vars.tf` is the configuration surface. Do not introduce `variables.tf` when
  the family uses `vars.tf`.
- `env_name` is a required string without a default or a hard-coded environment
  validation. `Makefile` and CI call the repository scripts, which pass it with
  `-var="env_name=<env>"`; the matching backend file decides whether that
  service/environment is enabled.
- Put operator-controlled inventories and defaults in `vars.tf`. Examples
  include exact Secret Manager IDs, Workload Identity mappings, namespaces,
  regions, service lists, and environment-specific database or cache settings.
- Resource files consume `var.*` values and keep fixed provider/resource
  behavior visible. Use `locals` only for derived filtering, flattening, naming,
  or transformations rather than as a second configuration inventory.
- Name resource files by concern, such as `secrets.tf`, `service-accounts.tf`,
  `instances.tf`, or `databases.tf`. Follow the closest same-family root when
  that family already has a stable name.
- A structure-only change must preserve resource addresses, `for_each` keys,
  exact resource identifiers, IAM roles, and GSA/KSA bindings. If any must
  change, treat it as a behavior or state-handoff change instead.
- Regenerate generated README sections after variable or provider metadata
  changes. Keep Terraform README prose and generated descriptions in Traditional
  Chinese while preserving technical identifiers.

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
