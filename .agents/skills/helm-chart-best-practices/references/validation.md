# Validation

This matrix and helper target an application chart with the listed resources
and injected globals. Use them only when the chart has that contract; otherwise
select equivalent checks from its own resource kinds, values and tests. Start
with `helm-usage-and-validation.md` for the general gate, supported CLI flags,
dependency preparation, and secret-safe local checks.

- `git diff --check` after an edit
- repository-owned local chart tests and lint/schema where applicable; inspect
  wrappers first, and never run cluster-facing `helm test` as a local check
- `helm template` for defaults and every affected override branch
- a render-fail case for each newly required or rejected input
- a representative consumer render when ownership moves between overrides and defaults
- bootstrap environment renders only for environments and globals actually affected

For the applicable application chart, inspect only material contract fields:
resource kind/name, selectors, image, ServiceAccount, selected non-secret
ConfigMap keys, ExternalSecret reference names, Service/PDB selectors, and
HPA/ScaledObject triggers. Other charts require their own field assertions.

The compact `scripts/render_summary.sh` helper reports a fixed set of
application resource kinds. Use it only when those kinds match the target;
otherwise inspect bounded `helm template` output without assuming this summary
is complete. Inspect inputs before invoking it: the helper writes the full render
to temporary files and emits render errors, so its compact output is not a secret
sanitizer. Use only permitted non-secret fixtures and flags. A successful render
proves desired output, not cluster admission, hook/CRD lifecycle, or live health.
