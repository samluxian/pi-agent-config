# Helm Chart Best-Practice Baseline

Use this general baseline for chart design, review, and maintenance. Helm's
best-practice recommendations are not all chart-format requirements. Separate
official semantics, the target repository's contract, and rendered evidence.
Do not impose application-chart, GitOps, KEDA, or cloud-specific conventions on
unrelated charts. Read `helm-usage-and-validation.md` for command safety and the
validation gate.

Sources include versioned Helm 3 guidance and current chart documentation. Check
the Helm CLI version supported by the repository and CI before relying on a
flag or behavior; do not change the CLI major or chart format as an incidental
best-practice cleanup. Official sources do not prove deployed compatibility.

## Chart metadata and release contract

- Inspect `Chart.yaml`, including required `apiVersion`, `name`, and `version`.
  Chart `apiVersion` describes the chart format, not a Kubernetes API version or
  the installed Helm CLI version. Stable `v2` charts are the Helm 3+ format;
  preserve the supported format instead of assuming newest documentation applies.
- Chart `version` is the chart's SemVer release. Optional `appVersion` describes
  the application and is informational, not a dependency constraint; quote it to
  avoid YAML type conversion. Track chart, application, dependency, and container
  image versions separately.
- Review changes to values, defaults, names, selectors, permissions, dependencies,
  and resource ownership as compatibility changes, not merely template edits.
  Follow repository release policy and provide a migration for breaking behavior.
- Keep README examples and supported values aligned with the actual chart. Do not
  claim a value is supported only because an example or release note mentions it.

## Values, schema, and template design

- Helm recommends lower-camel-case values and shallow structures where practical.
  Use maps for stable named entries when appropriate, document user-facing values,
  and retain an established API rather than renaming keys for style alone.
- Make types deliberate. Quote strings where needed, distinguish string IDs from
  numeric counts, and keep booleans boolean. Do not quote numeric Kubernetes
  fields simply to match a string-oriented values convention.
- `default` and `required` consider `false`, `0`, empty collections/strings, and
  `nil` empty. Use key-existence and explicit type/schema checks when false or
  zero is valid. Test omitted, false/zero, null, and invalid-type cases separately
  for changed inputs; do not silently replace a valid disabled setting.
- `values.schema.json` is optional. When present it validates final merged values,
  including subchart schemas, rather than only the text in `values.yaml`.
  Align schema, templates, defaults, and examples; distinguish required structure
  from fields required only when a feature is enabled. Do not bypass schema to
  make a failing render pass.
- Trace defaults, parent overrides, values files, and CLI/GitOps-injected inputs.
  Test effective values rather than reading one file in isolation. Helm documents
  null as removing a default key during merging; do not infer list behavior from
  map examples. Inspect the actual consumer's merge/render path.
- Namespace named templates with the chart name: helper names are global across
  parent and child charts. Pass the intended scope and use `include`/`nindent`
  where appropriate for YAML structure; test actual parsed fields.
- Prefer predictable render output. Random/time-dependent functions and live
  `lookup` calls can change output between runs or execution modes. Treat `tpl`
  inputs as template logic, not inert strings, and review who can supply them.

## Dependencies and shared values

- Declare dependencies and intentional version constraints in `Chart.yaml`.
  SemVer ranges describe acceptable versions, not a resolved selection. When the
  repository uses dependency locking, keep `Chart.lock` consistent with the
  declaration and review dependency upgrades as explicit changes.
- `dependency build` reconstructs the lock selection; without `Chart.lock` it
  behaves like update. Both commands can write/download local dependency files.
  Use the repository's permitted preparation path rather than automatically
  upgrading or generating artifacts during validation.
- Aliases support separate instances of a dependency. Trace overrides through the
  actual name or alias, and check resource identity/collisions for multiple
  instances. `condition` and tags can control optional dependencies; test both
  enabled and disabled behavior when their contract changes.
- Subcharts cannot read arbitrary parent values directly. Use the dependency's
  value namespace for overrides and `global` for deliberately shared values.
  Global values are an interface with consumer impact, not a shortcut for every
  repeated setting.
- For OCI dependencies or provenance verification, follow the existing artifact
  source and integrity policy. Do not change repositories, log in, or read
  credentials to resolve a missing dependency. Authenticity is not runtime proof.

## Kubernetes identity, permissions, and lifecycle

- Keep Deployment/StatefulSet and Service selectors consistent with Pod labels.
  Use stable identity labels; do not put changing chart/app versions into
  selectors. Review resource names and selectors explicitly across upgrades.
- Make ServiceAccount and RBAC ownership clear. Helm recommends separate creation
  controls so consumers can supply existing identities; retain the target's
  contract and use least-privilege, appropriate namespaced/cluster-scoped rules.
  A rendered Role does not prove effective permissions.
- Helm 3's `crds/` entries are static, not templated. Helm installs them before
  other chart resources but does not upgrade or delete them. Establish the CRD
  owner and an explicit upgrade process; use a separate chart when appropriate.
  Existing CRDs and dependent custom resources need separate compatibility proof.
- Hook Jobs/Pods have lifecycle ordering, readiness, and cleanup behavior distinct
  from normal release resources. Hook resources are not managed like ordinary
  release resources; review deletion policies or Job TTL and retained artifacts.
  A successful render does not prove hook execution, cleanup, or CRD discovery.
- Chart test hooks can create resources in a deployed release. Review test
  manifests locally; actual test execution belongs to approved user-operated
  delivery workflows, not agent validation.

## Review priorities

Prioritize ownership and secret handling, stable identity/selectors, dependency
reproducibility, accepted/rejected values, and consumer compatibility before
style-only changes. Compare each applicable recommendation as aligned, missing,
conflicting, or repository-specific, with exact files and render evidence.
Report unavailable cluster/consumer evidence rather than declaring readiness.

## Official sources

- [Charts and schema](https://helm.sh/docs/topics/charts/)
- [General conventions](https://helm.sh/docs/v3/chart_best_practices/conventions/)
- [Values](https://helm.sh/docs/v3/chart_best_practices/values/)
- [Values files](https://helm.sh/docs/v3/chart_template_guide/values_files/)
- [Template function list](https://helm.sh/docs/v3/chart_template_guide/function_list/)
- [Named templates](https://helm.sh/docs/v3/chart_template_guide/named_templates/)
- [Template tips and tricks](https://helm.sh/docs/v3/howto/charts_tips_and_tricks/)
- [Dependencies](https://helm.sh/docs/v3/chart_best_practices/dependencies/)
- [Subcharts and global values](https://helm.sh/docs/v3/chart_template_guide/subcharts_and_globals/)
- [Pods and PodTemplates](https://helm.sh/docs/v3/chart_best_practices/pods/)
- [Role-based access control](https://helm.sh/docs/v3/chart_best_practices/rbac/)
- [Custom resource definitions](https://helm.sh/docs/v3/chart_best_practices/custom_resource_definitions/)
- [Chart hooks](https://helm.sh/docs/v3/topics/charts_hooks)
- [Chart tests](https://helm.sh/docs/v3/topics/chart_tests/)
- [OCI registries](https://helm.sh/docs/v3/topics/registries)
