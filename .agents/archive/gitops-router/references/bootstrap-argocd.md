# Bootstrap and ArgoCD Wiring

Use when a task mentions bootstrap, App-of-Apps, ArgoCD Application creation, `values.ignore`, `targetRevision`, parent app, child app, deleting app folders, or whether merging to `main` will deploy.

## Parent, Child, Workload Layers

- Parent Application: usually created from the ArgoCD control repo; points to `k8s-deploy/bootstrap` and passes `bootstrap/values.<env>.yaml`.
- Child Application: rendered by `k8s-deploy/bootstrap`; points to an application folder such as `newaile/<service>` and passes `values.yaml` plus `values.<env>.yaml`.
- Workload resources: rendered by the child Application's Helm chart; includes Deployment, Kubernetes Service, ConfigMap, ServiceAccount, HPA, PDB, and related objects.

When an ArgoCD bootstrap parent repo is available, inspect it before claiming that a `k8s-deploy` merge will or will not deploy:

- Parent Application `repoURL`, `targetRevision`, `path`, `helm.valueFiles`, destination namespace, and sync policy.
- Whether `targetRevision` is explicit or `HEAD`; `HEAD` usually follows the Git default branch, but verify or call it default-branch-derived.
- Which environment values file the parent Application passes, such as `bootstrap/values.uat.yaml`.
- Whether parent sync policy has `automated.prune` or equivalent prune behavior.

## Bootstrap Discovery

For symlink/glob-based bootstrap systems:

- `values.<env>.yaml` is an enabled environment file and usually creates an ArgoCD Application.
- `values.ignore.<env>.yaml` is a prep/disabled file and should not be discovered.
- `bootstrap/values.<env>.yaml` selects the bootstrap environment and discovery pattern; the child chart's `values.<env>.yaml` contains the application runtime/deployment values.
- If old and new paths both contain enabled env files for the same service name, expect an Application name collision unless the bootstrap naming logic distinguishes them.
- Overrides are only required when they differ from defaults.

Important checks:

- Will the chart path be discovered?
- Which namespace will ArgoCD deploy into?
- Which value files will ArgoCD pass?
- Is there already an Application with the same name?
- Will prune delete old resources during cutover?
- Does `values.<env>.yaml` exist in both old and new paths?
- Should the old path be disabled by renaming to `values.ignore.<env>.yaml`, or should it be deleted?

After editing, prove the active env file set:

```bash
rg --files apps/<service> newaile/<service> | sort
rg --files apps/<service> newaile/<service> | rg 'values\.(dev|qa|uat|prod)\.yaml$'
```

There should be exactly one enabled `values.<env>.yaml` for the target environment across old and new paths, unless bootstrap intentionally creates distinct Applications.

## Render Checks

Bootstrap is a required verification gate for migrations. Whenever a change adds, deletes, renames, or moves `values.<env>.yaml`, migrates a service between top-level project paths, or removes the last service under a top-level path such as `apps/`, `newaile/`, `aileai/`, or `infra/`, verify bootstrap itself.

```bash
helm template bootstrap bootstrap -n argocd -f bootstrap/values.<env>.yaml
kubectl -n argocd get application bootstrap -o yaml
```

Rendering bootstrap successfully is not enough when the change adds or migrates a service. Verify the intended child Application is present and points to the expected path:

```bash
helm template bootstrap bootstrap -n argocd -f bootstrap/values.<env>.yaml \
  | rg 'name: <service>|path: "<project>/<service>"'
```

## Deletion Patterns

Single app/environment removal:

1. Rename `values.<env>.yaml` to `values.ignore.<env>.yaml`.
2. Tell the user which bootstrap parent Application to sync/prune in the ArgoCD UI; do not run the sync/prune yourself.
3. Use read-only checks to confirm the child Application disappeared.
4. Use read-only checks to confirm workload resources disappeared or were intentionally retained.
5. Delete the app folder only after no live child Application points at it.

Top-level project scanner removal:

- Delete the obsolete `bootstrap/charts/<project>-proj` subchart or symlink scanner.
- Remove the matching `<project>-proj` entries from `bootstrap/values.yaml` and `bootstrap/values.<env>.yaml`.
- Render every environment that uses bootstrap, not only the environment being migrated.
- Use read-only ArgoCD/Kubernetes checks to verify live `bootstrap` is `Synced` and `Healthy` after cleanup reaches the ArgoCD-watched branch.

Do not conflate single-application removal with top-level scanner removal. Use "project discovery scope" or "scanner" rather than vague terms such as "domain".
