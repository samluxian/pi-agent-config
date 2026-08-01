# flex-app Reference

Use this reference when a k8s-deploy chart depends on `flex-app` or aliases it as `stable`. The goal is to compare legacy values, app values, `flex-app` defaults, and rendered manifests before deciding what is missing or safe to remove.

## Baseline Order

Always inspect these sources separately:

1. Legacy chart values and render, if this is a migration.
2. New app `values.yaml` shared defaults.
3. New app `values.<env>.yaml` environment overlay.
4. The exact `flex-app` version from `Chart.yaml`, `Chart.lock`, and packaged `charts/flex-app-*.tgz`.
5. Live ArgoCD/Kubernetes manifests when the environment is already deployed.

Do not treat legacy values as the only source of truth. `flex-app` can render defaults that legacy values never listed, and live ConfigMaps can contain values that are not obvious from the old repo files.

## Default Values To Check

Read `charts/flex-app/values.yaml` and templates for the exact version in use. These defaults are especially easy to miss:

- `config.envs`: defaults include `APP_ENV: dev` and `LOG_LEVEL: info`; scalar entries render into `<release>-env` ConfigMap and are loaded by Deployment `envFrom.configMapRef`.
- `deployment.annotations`: default includes `reloader.stakater.com/auto: "true"` on Deployment metadata.
- `deployment.image`: default repository is empty and tag is `x.y.z`; app values must provide the real image repository/tag.
- `autoscaling`: default is enabled, commonly `minReplicas: 2`, `maxReplicas: 3`, CPU target 80, and no memory target unless overridden.
- `pdb`: default is enabled with `minAvailable: 1`; compare carefully against legacy `maxUnavailable`.
- `services`: default `main` service is enabled, and `metrics` may also be enabled; confirm ports, targetPorts, names, annotations, and whether metrics should be disabled.
- `serviceAccount`: default can create a ServiceAccount and use the release fullname when name is empty; Workload Identity usually belongs in env overlays.
- `configFiles`, `secretFiles`, `extraContainers`, `extraVolumes`, and `extraVolumeMounts`: verify these before declaring a shared-chart template gap.

## `config.envs` And LOG_LEVEL

`config.envs` is rendered by `templates/configmap-env.yaml`; Deployment loads it with `envFrom`. Helm merges maps recursively, so an app can omit a default key and still inherit it from `flex-app`. A key set to `null` is different: it intentionally clears the default from render output.

For `LOG_LEVEL`, use this rule:

- Do not set `LOG_LEVEL: null` just because the legacy chart values did not contain `LOG_LEVEL`.
- First render the new chart and inspect `<release>-env`.
- If `LOG_LEVEL=info` is desired, omitting the key may be enough because Helm can inherit the `flex-app` default; keep it explicit only when clearer MR intent is useful.
- If `LOG_LEVEL` must be removed to match a deliberate runtime contract, keep `LOG_LEVEL: null`, but document that it intentionally clears the `flex-app` default.

The aileprobff dev/UAT migration showed this risk: legacy values did not list `LOG_LEVEL`, but `flex-app` defaulted it to `info`, and live UAT already had `LOG_LEVEL=info`. The risky setting was `LOG_LEVEL: null`, which cleared the default and removed the env from the rendered ConfigMap.

## Render Checks

Use render output as the final local proof:

```bash
helm template <release> <chart-path> -n <namespace> \
  -f <chart-path>/values.yaml \
  -f <chart-path>/values.<env>.yaml
```

Inspect at least:

- ConfigMap `<release>-env`: env keys such as `APP_ENV`, `LOG_LEVEL`, Redis, Pub/Sub, and timezone.
- Deployment metadata annotations: `reloader.stakater.com/auto`.
- Deployment pod env injection: `envFrom.configMapRef` and any `secretRef`.
- ServiceAccount name and annotations.
- Service resources and exposed ports.
- HPA min/max replicas and CPU/memory metrics.
- PDB `minAvailable` versus `maxUnavailable`.

When live state exists, compare render output against live manifests before calling a difference acceptable.
