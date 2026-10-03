# Google Cloud Terraform Best-Practice Baseline

Use this reference when reviewing or designing Terraform layout, root modules,
reusable modules, state boundaries, CI operations, or repository architecture in
a supported Terraform repository.

Google's live documentation is authoritative for its recommendations. This file
is an operational digest, not a frozen substitute. Re-check the official pages
before making a material version, security, state, or organization-wide
architecture decision. Use `terraform-usage-and-validation.md` for HashiCorp CLI
semantics. Neither vendor guidance authorizes agent apply, import, state mutation,
credential setup, or live integration tests.

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
- Google recommends no more than 100 resources in one state, ideally a few
  dozen, as a refresh-cost and blast-radius heuristic, not a Terraform limit.
  Count expanded instances as well as configuration blocks when judging risk;
  do not split state solely to satisfy the number without a migration review.
- Put backend configuration in `backend.tf` and instantiate the service module
  from `main.tf`.
- Google recommends predictable root inputs in a default `terraform.tfvars`
  rather than ad-hoc CLI variable arguments. Commit only non-secret values;
  retain a reviewed repository var-file workflow instead of silently replacing it.
- Google recommends root provider constraints that allow patches within the
  selected minor line. A three-component `~> major.minor.patch` constraint has
  that scope; a two-component constraint allows later minor versions. Retain
  the repository's supported version and review upgrades separately.
- Commit each executable root's `.terraform.lock.hcl`. Do not put dependency lock
  files in reusable modules. The lock file records provider selections and
  checksums, not remote module selections; review module versions separately.
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
  `prevent_destroy` where supported and operationally appropriate. Treat these
  as safeguards, not backups; `prevent_destroy` does not protect a resource
  after its configuration is removed.
- Prefer `google_*_iam_member` or a reviewed IAM module when policy ownership is
  shared. Authoritative policy or binding resources require proof that the root
  owns the complete policy. Load `iam-review-checklist.md` for IAM review.

## State and cross-configuration communication

- Google recommends a remote GCS backend for Google Cloud deployments. Retain
  an established backend unless a migration is explicitly scoped. Restrict state
  access to the build system and explicitly authorized administrators, and keep
  local state files out of Git. HashiCorp's GCS backend supports state locking
  and recommends object versioning for recovery; verify both through bounded
  non-secret configuration evidence rather than assuming they are enabled.
- Assume state can contain sensitive plaintext. Avoid managing secret payloads,
  private keys, or other sensitive material through resources that persist those
  values in state. Mark any necessary sensitive outputs as `sensitive`.
- For infrastructure managed by another Terraform root, Google recommends
  reviewed root outputs rather than rediscovering resources by name. Before using
  `terraform_remote_state`, confirm the consumer may access the full state
  snapshot: output-only configuration does not enforce output-only access. If
  that access is inappropriate, use an explicitly published, non-secret output
  contract with separate permissions instead; do not grant broader state access.
- Use provider data sources for resources that Terraform does not manage.
- Preserve one active state owner per remote object. Use the state handoff
  reference for ownership transfers; never infer ownership from resource names.
- A bucket per environment is a valid local isolation design, but Google does not
  require that exact topology. Record bucket layout and access policy as a
  repository decision.

## Operations, security, and testing

- Always create and review a plan before apply. Approved user-operated automation
  should protect a saved plan artifact and apply that exact plan after owner
  approval. The agent uses unsaved speculative plans only; it does not create or
  inspect saved-plan artifacts. Follow `state-handoffs-and-recovery.md`.
- Use Application Default Credentials (ADC). For local work, Google's guidance
  includes user ADC or service-account impersonation. On Google Cloud, prefer
  an attached user-managed service account; outside Google Cloud, prefer
  Workload Identity Federation over service-account keys. Use only existing
  authenticated sessions; the agent does not log in, create keys, or change IAM.
- Avoid imports where practical. Never edit a state file manually. Follow the
  state handoff reference for approved import or state recovery work.
- Use the repository's pre-apply policy control and continuous security audits.
  Google lists `gcloud terraform vet` as an example, not a required tool; verify
  current availability and input sensitivity before adopting a tool.
- Test from least to most expensive: formatting and `terraform validate`, static
  analysis, isolated module integration, then environment-level end-to-end tests.
  Live integration and end-to-end tests belong to approved human-operated CI:
  use isolated state and test projects, unique names, bounded IAM, and cleanup.
  Terraform test runs default to apply; inspect every run before considering
  plan-only or mocked tests. Do not invoke live apply tests from the agent.
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

Recommendations above were checked against official Google and HashiCorp pages;
these sources describe behavior and recommendations, not target readiness.

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
- [Authentication for Terraform](https://cloud.google.com/docs/terraform/authentication)
- [HashiCorp GCS backend](https://developer.hashicorp.com/terraform/language/backend/gcs)
- [HashiCorp remote-state data source](https://developer.hashicorp.com/terraform/language/state/remote-state-data)
- [HashiCorp lifecycle reference](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)
