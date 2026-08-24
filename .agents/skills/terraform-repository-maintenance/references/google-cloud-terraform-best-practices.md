# Google Cloud Terraform Best-Practice Baseline

Use this reference when reviewing or designing Terraform layout, root modules,
reusable modules, state boundaries, CI operations, or repository architecture in
a supported Terraform repository.

Google's live documentation is authoritative. This file is an operational digest,
not a frozen substitute. Re-check the official pages before making a material
version, security, state, or organization-wide architecture decision.

Keep these evidence layers separate:

1. Google recommendation
2. repository-specific contract or deliberate exception
3. current implementation

Do not describe a local convention as a Google requirement. Do not treat an
architecture document as implementation truth without checking the repository.

## Root modules and environments

- Keep each application or independently managed service under one service
  directory, including its subdirectories.
- Split a multi-environment service into:

  ```text
  <service>/
  ├── OWNERS
  ├── modules/
  │   └── <service>/
  │       ├── main.tf
  │       ├── variables.tf
  │       ├── outputs.tf
  │       ├── versions.tf
  │       └── README.md
  └── environments/
      ├── dev/
      │   ├── backend.tf
      │   ├── main.tf
      │   ├── terraform.tfvars
      │   └── .terraform.lock.hcl
      └── prod/
          ├── backend.tf
          ├── main.tf
          ├── terraform.tfvars
          └── .terraform.lock.hcl
  ```

- Treat each environment directory as an executable root with independent state.
  Use only Terraform's `default` workspace in that root.
- Keep a root state below 100 managed resources and preferably to a few dozen.
  Count both configuration blocks and expanded state instances when judging risk.
- Put backend configuration in `backend.tf` and instantiate the service module
  from `main.tf`.
- Put predictable root inputs in committed `terraform.tfvars`. Avoid ad-hoc
  `-var` and alternate `-var-file` options as an operating model.
- Pin each root provider to a minor version in `versions.tf`, for example
  `~> 7.43.0`, and review pins regularly.
- Commit each executable root's `.terraform.lock.hcl`. Do not put dependency lock
  files in reusable modules.
- Re-export useful child-module outputs from the root so dependent roots can
  consume a stable public contract.

## Reusable module contract

- Follow Terraform's standard module structure. Use `main.tf`, `variables.tf`,
  `outputs.tf`, `versions.tf`, and `README.md`; group resources by purpose in
  descriptive files rather than one file per resource.
- Keep additional documentation in `docs/` and examples in `examples/<name>/`
  with their own README files.
- Do not configure providers or backends in a reusable module. Declare minimum
  provider requirements and receive provider configurations from the caller.
- Give every variable a description and explicit type. Do not default
  environment-specific values such as `project_id`.
- Expose labels through the module interface when contained resources support
  them.
- Give every managed resource at least one useful resource-derived output, with a
  description. Do not merely pass an input variable back as an output.
- If a module activates project APIs, expose an `enable_apis` switch that defaults
  to `true` and ensure APIs are not disabled on module destroy.
- Include `OWNERS` or the repository's equivalent ownership metadata for shared
  modules. Do not invent an owner identity when the repository has none.
- Release broadly shared modules with SemVer and pin registry consumers to a
  compatible major version.
- Use `moved` blocks for representable resource-address refactors. Load
  `state-handoffs-and-recovery.md` for state migration and rollback procedure.

## Style, dependencies, and resource safety

- Use underscore-delimited, singular Terraform identifiers. Avoid repeating the
  resource type in the local name; use `main` for a true singleton when clear.
- Include units in numeric variable names and prefer positive boolean names such
  as `enable_external_access`.
- Keep expression complexity bounded and use `terraform fmt`.
- Prefer implicit dependencies through resource or module output attributes.
  Use `depends_on` only for a hidden dependency that cannot be expressed through
  a value reference, and document why it is needed.
- Protect stateful resources such as databases with deletion protection and
  `prevent_destroy` where supported and operationally appropriate.
- Prefer `google_*_iam_member` or a reviewed IAM module when policy ownership is
  shared. Authoritative policy or binding resources require proof that the root
  owns the complete policy. Load `iam-review-checklist.md` for IAM review.

## State and cross-configuration communication

- Use a remote GCS backend. Restrict state access to the build system and
  explicitly authorized administrators, and keep local state files out of Git.
- Assume state can contain sensitive plaintext. Avoid managing secret payloads,
  private keys, or other sensitive material through resources that persist those
  values in state. Mark any necessary sensitive outputs as `sensitive`.
- For infrastructure managed by another Terraform root, consume reviewed root
  outputs through `terraform_remote_state` rather than rediscovering resources by
  name with provider data sources.
- Use provider data sources for resources that Terraform does not manage.
- Preserve one active state owner per remote object. Use the state handoff
  reference for ownership transfers; never infer ownership from resource names.
- A bucket per environment is a valid local isolation design, but Google does not
  require that exact topology. Record bucket layout and access policy as a
  repository decision.

## Operations, security, and testing

- Always create and review a plan before apply. In automation, save the reviewed
  plan artifact and apply that exact plan after owner approval.
- Use credentials injected by the Google-hosted execution platform. For CI
  outside Google Cloud, prefer Workload Identity Federation; do not download
  service account keys. Use Application Default Credentials for local work.
- Avoid imports where practical. Never edit a state file manually. Follow the
  state handoff reference for approved import or state recovery work.
- Run a pre-apply policy check such as `gcloud terraform vet` or an equivalent
  reviewed control, then run continuous security audits after apply.
- Test from least to most expensive: formatting and `terraform validate`, static
  analysis, isolated module integration, then environment-level end-to-end tests.
  Use isolated test projects or folders and clean up all test resources.
- Protect the primary branch and use reviewed feature or fix branches. Google
  recommends environment branches for directly deployed roots; if the repository
  uses a different promotion model, document that as an explicit governance
  decision rather than presenting it as Google guidance.
- Review Terraform, provider, module, and execution-image pins regularly. Never
  use `latest` where reproducibility is claimed.

## Repository-specific decisions

The following can be valid local policies but are not mandatory Google Terraform
best practices:

- one state bucket per environment
- one VPC, GKE cluster, or CI runner per environment
- GCP project ID or product family as the top-level directory
- an `infra-` folder prefix
- project-local module duplication
- a custom Terraform container image

Evaluate these decisions for ownership, blast radius, cost, isolation, and CI
compatibility. Label them as repository decisions in architecture documentation.

## Review method

For an architecture or best-practice comparison:

1. Confirm the named repository, root, environment, backend, branch, and status.
2. Read the target architecture document and inspect the current layout. Do not
   blend documented intent with implementation evidence.
3. Compare only the applicable official rules. Classify each finding as aligned,
   missing, conflicting, or repository-specific.
4. Identify exact file paths and evidence. Do not infer runtime deployment,
   state ownership, IAM effectiveness, or CI behavior from layout alone.
5. Prioritize state safety, root boundaries, version reproducibility, exact-plan
   apply, IAM ownership, and secret handling before style-only differences.
6. For a proposed migration, require moved-address coverage and a plan with no
   unexpected add, change, replace, or destroy actions.

## Official sources

- [General style and structure](https://cloud.google.com/docs/terraform/best-practices/general-style-structure)
- [Root modules](https://cloud.google.com/docs/terraform/best-practices/root-modules)
- [Reusable modules](https://cloud.google.com/docs/terraform/best-practices/reusable-modules)
- [Dependency management](https://cloud.google.com/docs/terraform/best-practices/dependency-management)
- [Cross-configuration communication](https://cloud.google.com/docs/terraform/best-practices/cross-config-communication)
- [Working with Google Cloud resources](https://cloud.google.com/docs/terraform/best-practices/working-with-resources)
- [Version control](https://cloud.google.com/docs/terraform/best-practices/version-control)
- [Operations](https://cloud.google.com/docs/terraform/best-practices/operations)
- [Security](https://cloud.google.com/docs/terraform/best-practices/security)
- [Testing](https://cloud.google.com/docs/terraform/best-practices/testing)
