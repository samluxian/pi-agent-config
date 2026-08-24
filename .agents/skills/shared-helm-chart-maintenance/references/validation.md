# Validation

Run the smallest gate set that proves every changed contract branch:

- `git diff --check`
- `implementation_flow.sh --changed-path charts/<chart-name> <chart-repository>`
- `helm template` for every changed feature branch
- a render-fail case for each new required or rejected input
- default chart render plus at least one adopting-service render when ownership
  moves between service values and chart defaults
- bootstrap renders for `dev`, `qa`, `uat`, and `prod` when injected globals
  change

For render output, prove only material contract fields: resource kind/name,
selectors, image, ServiceAccount, selected non-secret ConfigMap keys,
ExternalSecret reference names, Service/PDB selectors, and HPA/ScaledObject
triggers.

Use the compact helper when the chart can be rendered locally:

```bash
.agents/skills/shared-helm-chart-maintenance/scripts/render_summary.sh \
  --release <release> \
  --chart <chart-or-wrapper-path> \
  -f values.yaml \
  -f values.<env>.yaml \
  --set global.envName=<env> \
  --set global.gcpProjectId=<project>
```

Inspect a raw manifest fragment only when the summary exposes a specific
mismatch. Validation is complete when every intended render difference is
observed, every rejected input fails for the expected reason, and skipped gates
are reported as gaps.
