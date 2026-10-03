# Helm Usage and Validation

Use this general reference for command semantics and a chart-specific validation
plan. Inspect the target chart, repository wrapper, CI, supported Helm version,
and Kubernetes compatibility before running checks. Commands described here are
not permission to install, upgrade, uninstall, roll back, run release tests, or
change a cluster. For authoring recommendations, read
`helm-chart-best-practice-baseline.md`.

## What each check proves

| Check | Evidence | Limits and side effects |
| --- | --- | --- |
| `helm lint` | Chart structure and convention checks; values/schema checks where applicable | Not cluster admission, controller behavior, or consumer compatibility |
| Local `helm template` | Manifest output for supplied values and template capabilities | No server-side API validation; cluster lookups are not live evidence; output may contain secrets |
| `helm dependency build` | Reconstructs dependencies from `Chart.lock` | Writes/downloads artifacts; without a lock behaves like update; not an automatic read-only check |
| `helm dependency update` | Resolves acceptable dependency versions and generates a lock | Changes selection, lock, and downloaded artifacts; only for explicitly scoped dependency maintenance |
| `helm test` | Executes test resources for an installed release | Cluster mutation; never an agent local validation step |

Inspect repository scripts and plugins before invoking them. A script named
lint, render, or test can also download dependencies, run install, access a
cluster, or write raw manifests. Do not infer safety from its name.

## Dependency preparation

- Establish the dependency source, alias, requested constraint, resolved lock
  version, and available artifacts. Use bounded metadata without reading registry
  credentials or secrets. Do not silently replace missing/private dependencies.
- Prefer existing permitted dependencies and the repository's preparation
  workflow. Do not run build/update or add `--dependency-update` to a render just
  to repair validation; first establish whether generation/downloads are allowed.
- If a lock is expected but absent or inconsistent, report it. Do not claim
  reproducibility or use build as a shortcut for an unapproved upgrade.
- Preserve unrelated `Chart.lock` and dependency artifacts. Do not add generated
  or ignored files to this public skills repository or a target repository when
  the workspace contract forbids them; an unavailable preparation path is a gap.

## Local render gate

1. **Record the target:** chart/consumer paths, supported CLI version, chart and
   dependency versions, release name, namespace, and intended environment. Read
   overrides and wrappers without accessing secret payloads.
2. **Trace effective inputs:** defaults, dependency name/alias, globals, ordered
   values files, and CLI/GitOps overrides. `--set` overrides values-file inputs;
   inspect the wrapper's complete precedence rather than one values file.
3. **Lint and schema:** use target-supported lint/schema checks for defaults and
   affected profiles. Do not use `--skip-schema-validation` or disable validation
   to hide an invalid input. Record warnings and actual validation coverage.
4. **Render affected modes:** defaults where supported, every changed override
   branch, enabled/disabled states, and representative consumers. If the chart
   intentionally needs required inputs, use documented non-secret fixtures and
   assert the intended missing-input failure instead of inventing working defaults.
5. **Assert behavior:** parse manifests and compare material fields, names,
   selectors, labels, permission scope, dependency presence, and changed workload
   settings. Add an explicit failure case for new required/rejected inputs. Include
   omitted, false/zero, null, and invalid types when relevant to the changed API.
6. **Report limits:** separate rendered intent, consumer compatibility, Kubernetes
   API/schema evidence, admission, controller behavior, and runtime health. State
   which checks were not run; no single passing render proves deployment readiness.

Use release name/namespace variations when identity changes. Where branching
uses `.Release.IsUpgrade`, render upgrade and install modes using the supported
`--is-upgrade` flag; that simulates template context, not a real upgrade.

Where branching uses `.Capabilities`, supported `--kube-version` and
`--api-versions` flags supply template inputs. They do not query the target cluster,
install CRDs, or verify admission/RBAC. Record these assumptions and inspect the
actual supported APIs read-only only when a readiness claim requires it.

For CRD-bearing charts, supported `--include-crds` includes static CRD documents
in render output. Check CRDs and custom resources separately; inclusion does not
prove discovery, upgrade compatibility, or acceptance by the target API server.
Flag availability and dry-run modes differ between Helm versions: check the
actual supported CLI/help instead of copying flags from current documentation.

## Cluster-facing behavior and sensitive output

- Local rendering cannot prove a live `lookup` result. Do not add server mode,
  cluster validation flags, or authenticated lookups to rescue an offline render.
  Treat the unavailable behavior as a gap and use bounded, non-secret evidence
  only when the workspace contract permits it.
- Helm 3 documents client and server install dry-run modes; server mode permits
  cluster connections. Install dry-run output can include Secrets. It is not
  this skill's default validation path or permission to invoke install/upgrade.
- Never render secret-backed profiles or print raw Secret data. Template output,
  debugging output, values supplied to `tpl`, ConfigMaps, notes, and errors can
  also expose sensitive content. Secret-hiding flags are not a comprehensive
  sanitizer; inspect input safety before running any render or summary helper.
- Use synthetic non-secret fixtures and bounded field assertions. Do not write
  raw rendered manifests to temp files, logs, or artifacts if they may contain
  secrets. A helper emitting compact output can still process or persist the
  full render internally; inspect it before use.
- `helm test` and hook execution create/run Kubernetes resources. Do not invoke
  them as local checks. Approved human-operated CI needs explicit resource
  ownership, permission scope, ordering, failure handling, and cleanup.

## Reporting

Name the affected chart and profiles, lint/schema/render outcomes, dependency
preparation and lock status, expected/actual field changes, negative cases,
consumer gaps, and migration/release impact. State Helm/Kubernetes assumptions
and whether evidence was local, consumer-specific, or read from a cluster.
Do not infer controller support, readiness, or effective IAM from rendered YAML.

## Official sources

- [Helm 3 lint](https://helm.sh/docs/v3/helm/helm_lint/)
- [Helm 3 template](https://helm.sh/docs/v3/helm/helm_template/)
- [Current template reference](https://helm.sh/docs/helm/helm_template)
- [Helm 3 dependency build](https://helm.sh/docs/v3/helm/helm_dependency_build/)
- [Helm 3 dependency update](https://helm.sh/docs/v3/helm/helm_dependency_update)
- [Helm 3 test](https://helm.sh/docs/v3/helm/helm_test/)
- [Helm 3 install and dry-run warnings](https://helm.sh/docs/v3/helm/helm_install/)
- [Chart tests](https://helm.sh/docs/v3/topics/chart_tests/)
- [Chart hooks](https://helm.sh/docs/v3/topics/charts_hooks)
- [Template functions and lookup](https://helm.sh/docs/v3/chart_template_guide/functions_and_pipelines/)
- [Template tips and tpl](https://helm.sh/docs/v3/howto/charts_tips_and_tricks/)

Official documentation describes command behavior, not the execution safety of a
particular wrapper or chart. Re-check version-sensitive semantics before use.
