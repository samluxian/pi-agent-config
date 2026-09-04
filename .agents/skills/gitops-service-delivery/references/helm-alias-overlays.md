# Helm Alias Overlays

Use these rules when editing service values split across dependency
aliases such as `common`, `stable`, and `beta`.

- Treat `common` as the intersection: keep a value there only when both aliases
  accept it and every affected environment should inherit it.
- Keep legacy-only keys under `stable` and target-chart-only keys under `beta`.
- When compatibility is uncertain, keep the value alias-specific until render
  evidence proves it belongs in `common`.
- Do not remove a `common` value solely because `beta` no longer needs it. Move
  it to `stable` when the legacy chart still requires it.
- Preserve non-target environments during a beta rollout.
- Identify tag ownership before changing a dependency. Environment enablement
  belongs to the repository's bootstrap fleet/environment declaration and its
  effective tag set; chart-version selection belongs to mutually exclusive
  fleet tags such as `stableFleet` and `betaFleet`.
- Do not copy environment tags onto stable and beta dependencies when the
  bootstrap already controls environment enablement. Helm treats multiple tags
  on one dependency as OR conditions, so an environment tag can enable both
  chart versions even when their fleet tags are mutually exclusive.
- Before renaming a Kubernetes ServiceAccount, prove from the pinned chart's
  defaults, schema, templates, and render that the override controls the
  ServiceAccount name, workload `serviceAccountName`, and every RBAC subject.
  If the pinned chart lacks that API, use `$helm-dependency-upgrade` and scope
  the compatible alias/version to the affected fleet; preserve the existing
  version for other fleets.
- For an identity rename, keep the Kubernetes ServiceAccount, workload/RBAC
  references, cloud identity annotation, and workload-identity principal as one
  migration contract. Present both cutover choices before implementation:
  temporarily authorize old and new principals for an overlap migration, or
  directly replace the principal with an explicit acceptance of the interval
  before GitOps rollout completes. Do not classify the accepted direct-replace
  interval as a blocker.
- Render every affected environment after changing aliases, tags, or shared
  values. For a shared base, render `dev`, `qa`, `uat`, and `prod` unless the
  unchanged environments are proven unaffected. Use the repository's bootstrap
  discovery and value-file order instead of assuming every service has a
  fleet-named values file.
- Review branch-ready behavior against the remote merge-request head and base.
  Report local-only commits or working-tree changes separately; do not include
  them in the merge-request verdict.
- In branch-ready notes, distinguish retained stable values, target-chart
  defaults, beta-only values, the selected identity cutover, and any accepted
  rollout interval.
