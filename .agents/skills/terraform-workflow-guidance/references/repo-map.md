# Terraform Repository Map

Target repository:

```text
<terraform-repository>
```

## Supported layout

```text
Makefile                  Optional local wrapper commands
.gitlab-ci.yml            CI entry point when GitLab is used
scripts/                  Discovery and Terraform execution helpers
<family>/                 Terraform roots and shared modules
docs/                     Human documentation
```

## Terraform root layout

Most roots follow this shape:

```text
<family>/<service>/
├── main.tf
├── vars.tf
├── outputs.tf            optional
├── environments/
│   └── <env>.backend.tfvars
└── <resource-concern>.tf
```

A service root stays exactly two levels below the repository root when the
repository change-detection and execution scripts discover
`<family>/<service>`. Shared modules stay under `<family>/modules/`. Confirm
these paths from repository scripts before relying on this adapter.

`environments/<env>.backend.tfvars` selects the remote backend state for one
service/environment. The backend file is not normal input variables; it tells
Terraform where to read and write state. When repository scripts use file
presence for discovery, it is also the source of truth for enabled environments.

## Default root and configuration conventions

Before editing, compare the closest existing root in the same family. Apply these
defaults only when repository evidence confirms the same convention:

- `main.tf` owns the `terraform` block, backend declaration, shared defaults
  module, and provider configuration. Preserve existing Terraform/provider
  constraints; do not introduce a separate `versions.tf` without evidence.
- `vars.tf` is the configuration surface when the family uses that name.
- `env_name` is a required string when repository wrappers pass
  `-var="env_name=<env>"`; the matching backend file decides whether that
  service/environment is enabled.
- Put operator-controlled inventories and defaults in the repository's existing
  configuration surface. Examples include Secret Manager IDs, Workload Identity
  mappings, namespaces, regions, service lists, and environment-specific data
  service settings.
- Resource files consume input values and keep fixed provider/resource behavior
  visible. Use `locals` for derived filtering, flattening, naming, or
  transformations rather than as a second configuration inventory.
- Name resource files by concern, such as `secrets.tf`, `service-accounts.tf`,
  `instances.tf`, or `databases.tf`, following the closest same-family root.
- A structure-only change preserves resource addresses, `for_each` keys, exact
  resource identifiers, IAM roles, and GSA/KSA bindings. Otherwise treat it as a
  behavior or state-handoff change.
- Regenerate generated README sections after variable or provider metadata
  changes. Preserve technical identifiers in generated documentation.

## Repository inventory

Do not keep a company service inventory in this public skill. Derive the current
root/environment pairs from the target repository:

```bash
bash scripts/list-services.sh
```

If that helper does not exist, inspect the repository's documented discovery
command. Do not invent roots or environments from this template.

## Shared defaults module

When the repository has a shared defaults module, verify how it maps environment
names to project IDs and labels. Before adding an environment, confirm the map
contains the environment and the intended project ID. Do not copy an identifier
from another root.

## Common risk areas

- human-access roots: broad user IAM roles and high blast radius
- workload-identity roots: service IAM roles, account existence, and KSA/GSA
  binding ownership
- firewall roots: exposure, priorities, broad source ranges, target tags, and
  Shared VPC placement
- `environments/*.backend.tfvars`: remote state target; a wrong bucket or prefix
  can select unrelated state
