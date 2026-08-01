# Compatibility And Review

Read this reference for breaking changes, release guidance, migration proof, or
reviewer-comment interpretation.

## Compatibility

- Prefer release-name-based identity when dependency aliases are not workload
  names; do not leak aliases such as `stable` or `beta` into resource identity.
- Give every removed alias, HPA-style field, or generated runtime abstraction a
  downstream migration path.
- When removing generated runtime env, write the equivalent service
  `config.envs` value and prove the rendered ConfigMap key remains equivalent.
- Review Deployment, Service, PDB, ServiceAccount, HPA/ScaledObject, selectors,
  and release identity as explicit handoff contracts.
- Do not use `helm lint` as the only wrapper-chart gate. Build dependencies,
  render targeted cases, and inspect material fields.

Compatibility proof is complete when the default render is valid, every changed
feature has accepted and rejected cases, adopting callers have a migration path,
and unintended resource identity or selector changes are absent.

## Reviewer Comments

Map reviewer language to a concrete contract decision:

- `projectId can be internalized`: inject an approved global or derive from one.
- `duplicate keys`: select one canonical key and align schema/helper behavior.
- `can be calculated`: derive internal plumbing from an owned input.
- `defaults belong in values.yaml`: remove hidden helper-only defaults.
- `this looks Java-specific`: keep runtime env explicit in the Java service.
- `annotation knob is over-engineered`: expose a boolean, not implementation
  key/value knobs.
- `schema and helper disagree`: fix and test both accepted and rejected shapes.
