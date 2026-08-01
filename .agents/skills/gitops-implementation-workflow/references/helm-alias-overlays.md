# Helm Alias Overlays

Use these rules when editing `k8s-deploy` service values split across dependency
aliases such as `common`, `stable`, and `beta`.

- Treat `common` as the intersection: keep a value there only when both aliases
  accept it and every affected environment should inherit it.
- Keep legacy-only keys under `stable` and target-chart-only keys under `beta`.
- When compatibility is uncertain, keep the value alias-specific until render
  evidence proves it belongs in `common`.
- Do not remove a `common` value solely because `beta` no longer needs it. Move
  it to `stable` when the legacy chart still requires it.
- Preserve non-target environments during a beta rollout.
- Render every affected environment after changing aliases, tags, or shared
  values. For a shared base, render `dev`, `qa`, `uat`, and `prod` unless the
  unchanged environments are proven unaffected.
- Use `$flex-app-version-upgrade` before patching a chart-version migration.
- In branch-ready notes, distinguish retained stable values, target-chart
  defaults, and beta-only values.
