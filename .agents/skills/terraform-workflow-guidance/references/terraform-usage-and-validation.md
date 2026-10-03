# Terraform Usage and Validation

Use this cloud-independent reference for CLI usage, reproducibility, sensitive
values, and tests. Discover the actual root, environment, backend, Terraform and
provider versions, and repository wrapper first. These are command semantics,
not permission to initialize arbitrary roots or execute infrastructure changes.
For Google Cloud architecture and authentication recommendations, also read
`google-cloud-terraform-best-practices.md`.

## Choose the check by what it proves

| Check | Evidence it provides | Limits and side effects |
| --- | --- | --- |
| `terraform fmt -check` | Canonical formatting without rewriting files | Does not validate configuration or cloud behavior; restrict recursive scope to owned roots |
| `terraform init` | Installs modules/providers and initializes the working directory/backend | Writes local metadata and can change dependency selections or initiate state migration; inspect the repository wrapper first |
| `terraform validate` | Syntax, argument types, and internal configuration consistency | Needs installed module/provider schemas; does not validate remote APIs, state, or actual environment inputs |
| Unsaved `terraform plan` | Proposed actions for the selected inputs, state, and provider reads | Normally refreshes remote objects and can acquire a state lock; not offline, not proof an eventual apply will succeed |
| Reviewed plan-only or mocked tests | Assertions about planned behavior or simulated provider results | Inspect every run and setup module; mocks do not prove real provider/API behavior |

A successful check only supports its own evidence layer. Run the affected-root
fmt/validate/plan gate after infrastructure edits; a mocked test is not a plan
against the actual environment. Report unavailable checks rather than filling the
gap with a different environment or guessed backend.

## Initialization and dependency control

- Use the discovered repository execution path. Review shell hooks, working
  directory, environment selection, backend arguments, and whether the wrapper
  saves a plan or invokes apply before running it.
- HashiCorp documents `init -backend=false` for validation without accessing the
  configured backend. It is not a side-effect-free command: provider/module
  installation and local metadata writes remain. Use only a repository-approved
  validation context; if local generated files are disallowed, report that gap.
- Ordinary initialization is different from `init -upgrade`, backend
  `-migrate-state`, and `-reconfigure`. Do not introduce these flags as a repair
  for validation failures, or accept a backend migration prompt. Never overwrite
  user initialization or lock selections.
- Roots own backend/provider configuration and supported Terraform constraints.
  Reusable modules declare provider requirements and accept caller configuration.
  Check installed versions against the root's `required_version` and
  `required_providers`; do not select a new version without upgrade scope.
- Commit the executable root's `.terraform.lock.hcl`: it records chosen provider
  versions and checksums. Version constraints describe allowed versions, not the
  exact selection. Remote module selections are not locked by this file; use
  explicit reviewed registry versions or immutable VCS references when exact
  reproducibility is required. Preserve the repository's upgrade policy.
- Check dependency changes separately from infrastructure changes. Review provider
  release notes, module compatibility, lock-file changes, and every affected root
  plan; do not automatically add an upgrade to an unrelated edit.

## Plan review and exceptional modes

1. Confirm exact root/environment, input source, backend identity, state owner,
   supported versions, execution principal, and absence of competing writers.
2. Check configuration and wrappers for external programs, data sources, or hooks
   that could cause side effects. Normal plans read provider APIs; they can fail
   without read permissions even when validation passes.
3. Run only the approved unsaved speculative plan. Do not request `-out`, raw
   plan JSON, state dumps, or saved-plan inspection. Use the existing summary
   helper only for its supported non-secret text-plan path.
4. Record addresses and actions, replacement ordering, warnings, unknowns,
   unexpected drift, and add/change/destroy totals. Read
   `plan-replacement-review.md` for replacement and `state-handoffs-and-recovery.md`
   for imports, handoffs, locks, saved plans, or partial apply.
5. Stop on unexpected actions or access/lock failures; do not change input scope,
   disable locking, or use `-target` to make the plan look safe.

`-refresh-only` proposes reconciliation of state/outputs with remote objects; it
is not the normal desired-state change plan. `-refresh=false` omits current remote
evidence and can produce an incomplete plan. `-target` is an exceptional recovery
mechanism, not a routine validation shortcut. Do not use alternate modes to claim
normal-plan readiness, and never run the mutating `terraform refresh` command.

CLI workspaces provide multiple states for one configuration/backend, not strong
credential or access isolation. Follow the existing environment model; never
create or select workspaces to resolve an ambiguous target. Separate roots and
backends are appropriate when independent access boundaries are required.

## Testing without accidental apply

- `terraform test` run blocks default to `command = apply`: a test can create and
  destroy real infrastructure. Do not run tests solely because they are named
  unit tests or include some mocks.
- Inspect every selected run, provider/alias, alternate module, setup/teardown,
  and wrapper. Only consider tests whose complete execution is proven plan-only
  or fully mocked and cannot mutate infrastructure. `command = plan` does not
  make real provider reads or external data sources offline.
- Add assertions for the changed module contract, variable validation, outputs,
  and expected resource attributes when supported by the installed version and
  repository test convention. Do not add a new test framework without need.
- Real module integration and end-to-end tests require an approved human-operated
  delivery system, isolated test state/projects, unique resource names,
  least-privilege credentials, and explicit cleanup. Report these as unexecuted
  when only static, plan-only, or mocked tests are available.

## Sensitive values and state boundaries

- `sensitive = true` redacts ordinary CLI display; it does not encrypt or exclude
  values from state/saved plans. Avoid secret payloads in Terraform-managed state
  and never inspect secrets, credential files, raw state, or raw sensitive plans.
- HashiCorp documents ephemeral values for Terraform 1.10+ and write-only resource
  arguments for 1.11+. Provider support and allowed expression contexts still
  matter. Verify the installed version and resource schema before recommending
  either feature; do not upgrade Terraform implicitly to obtain them.
- Keep secrets out of committed `.tfvars`, backend configuration, command-line
  arguments, fixtures, and public documentation. Use existing approved identity
  and secret-delivery mechanisms without reading their secret contents.
- `terraform_remote_state` exposes root outputs to configuration, but credentials
  sufficient to read those outputs can read the entire state snapshot. Use it
  only where full-state access is authorized; otherwise consume separately
  published non-secret outputs with independently scoped permissions.

## Official sources

- [fmt](https://developer.hashicorp.com/terraform/cli/commands/fmt)
- [init](https://developer.hashicorp.com/terraform/cli/commands/init)
- [Backend configuration](https://developer.hashicorp.com/terraform/language/backend)
- [validate](https://developer.hashicorp.com/terraform/cli/commands/validate)
- [plan](https://developer.hashicorp.com/terraform/cli/commands/plan)
- [Dependency lock file](https://developer.hashicorp.com/terraform/language/files/dependency-lock)
- [CLI workspaces](https://developer.hashicorp.com/terraform/cli/workspaces)
- [test command](https://developer.hashicorp.com/terraform/cli/commands/test)
- [Test run configuration](https://developer.hashicorp.com/terraform/language/tests)
- [Sensitive data](https://developer.hashicorp.com/terraform/language/manage-sensitive-data)
- [Remote-state data source](https://developer.hashicorp.com/terraform/language/state/remote-state-data)

Official documentation establishes semantics, not the target repository's
execution safety or cloud readiness. Re-check sources for version-sensitive work.
