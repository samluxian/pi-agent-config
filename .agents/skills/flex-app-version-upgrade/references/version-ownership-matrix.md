# Version Ownership Matrix

This reference records known review baselines. Verify every entry against the
actual target chart before using it.

## 3.4.1 And Newer

Known selector history: 3.0.0 through 3.3.0 used
`app.kubernetes.io/name` plus `app.kubernetes.io/instance` as the fallback when
`deployment.matchLabels` was absent. Recorded 3.4.0 and 3.4.1 behavior used
`app: <fullname>` plus `environment: <global.envName>`. Explicit service values
may override either shape. Verify this history against the exact chart sources.

- Normal ServiceAccount creation, name, and standard GSA annotation are
  chart-owned when the target derives them from `global.envName`, chart fullname,
  and `global.gcpProjectId`.
- Keep `serviceAccount.annotations` in service values only for a non-standard GSA
  or extra annotations, then verify the render.
- Treat reloader, default PDB, normal ServiceAccount wiring, and default
  autoscaling timings as chart behavior.
- Keep service-specific image, ports, resources, probes, env, Nacos overrides,
  secret references, mounted files, and selector compatibility in service values.
- Keep normal autoscaling reviewer-visible with explicit min/max and CPU/memory
  profiles unless the service uses another profile such as Pub/Sub.
- Omit main-container pull policy, main service enablement/TCP protocol, default
  PDB, and Deployment replicas only when verified target defaults make them
  duplicate intent.
- Keep `services.metrics.enabled: false` when the target default would otherwise
  create an unwanted metrics service.
- Keep user-owned sidecar settings unless the user explicitly adopts defaults.

Do not carry older 3.4.0 ServiceAccount migration advice into 3.4.1+ without
checking the target templates.
