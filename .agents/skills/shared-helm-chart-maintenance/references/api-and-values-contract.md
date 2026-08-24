# API And Values Contract

Read this reference when designing or changing a supported shared chart values API.

## Ownership

- Put opinionated chart defaults directly in `values.yaml`; helpers should read,
  validate, and render them rather than hide business defaults.
- Show every supported user-facing structure in `values.yaml`, using `{}`, `[]`,
  or `null` plus a nearby commented example when the feature is inactive.
- Use safe placeholders only when schema or helper validation requires them for
  default lint/render. Keep service-specific examples commented out.
- Keep service values focused on service intent. Do not make callers repeat
  stable environment facts already owned by app-of-apps.
- Keep reviewer-visible runtime wiring explicit in service values, including
  Secret Manager `remoteRef`, exceptional ServiceAccount annotations, runtime
  env, file mounts, and service-specific dependencies.
- Keep Java/Spring behavior such as `SPRING_PROFILES_ACTIVE` in service
  `config.envs`; do not generate language-specific env for every caller.
- Use one simple boolean for generated behavior such as `reloader.enabled`.
  Expose implementation knobs only after multiple concrete callers require them.

## Shape And Validation

- Prefer one canonical key over singular/plural or legacy/new duplicates. A key
  may accept string, string list, or object list when each shape is genuinely
  useful and schema/helper behavior stays aligned.
- Mark required fields and inherited per-item fields in the nearby example.
- When a field is required only for an enabled feature, fail at render time with
  its exact values path.
- When replacing an API, reject deprecated aliases explicitly instead of
  silently accepting two sources of truth.
- Keep `values.schema.json`, `values.yaml`, helpers, templates, and examples
  aligned for both accepted and rejected enabled-state cases.

## Pattern Extraction

When repeated service values appear derivable:

1. Inspect one target service and at least two peers when available.
2. Classify every repeated value as chart default, opt-in profile, service
   value, language-specific value, or app-of-apps global.
3. Name exceptions before proposing a shared rule.
4. Define a compact render comparison for the migrated target.

Pattern extraction is complete only when every sampled caller fits the rule or
is documented as an exception, and the migrated render is equivalent where
compatibility is required.

## App-Of-Apps Globals

Use `global` only for stable facts owned by environment orchestration and used
by multiple child charts, such as `global.envName` or `global.gcpProjectId`.

Before adding a global:

1. Check whether bootstrap already injects it.
2. Prove why service values cannot own it.
3. Plan a paired bootstrap change if orchestration should own it.
4. Preserve the service-local value for the current release when blast radius is
   unclear.

Do not globalize image repository prefixes, Nacos endpoints, service-specific
secret names, ports, or runtime dependencies without a proven cross-service
contract and explicit approval.
