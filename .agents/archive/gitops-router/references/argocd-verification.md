# ArgoCD Verification Reference

Use this reference when checking whether a GitOps delivery change is actually deployed.

## UI-first rule

Prefer the user's localhost ArgoCD UI/session for status interpretation and any action. If a problem is found, explain what the user should inspect or click in the UI; do not directly operate ArgoCD with CLI commands.

Forbidden ArgoCD CLI operations include:

```bash
argocd app sync <app>
argocd app delete <app>
argocd app rollback <app>
argocd app terminate-op <app>
argocd app set <app>
argocd app unset <app>
```

Read-only CLI/API checks are allowed only to collect evidence when UI output is unavailable or the user asks for CLI evidence. Do not run commands that change Application state, trigger syncs, terminate operations, delete resources, update parameters, or modify target revisions.

## Read-only status checks

Preferred UI flow when the user has a localhost ArgoCD session or can log in interactively:

1. Open `https://localhost:8080` or the provided ArgoCD URL.
2. Open the target Application.
3. Read the Summary, Sync Status, Health Status, Target Revision, Path, Destination, and Helm values.
4. Open the resource tree and inspect unhealthy, out-of-sync, or degraded nodes.
5. Open App Details / Events / Conditions / Manifest / Diff as needed.

If UI evidence is unavailable, read-only API flow:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
argocd login localhost:8080 --insecure
argocd app get <app> --server localhost:8080 --insecure
argocd app history <app> --server localhost:8080 --insecure
```

If API login is unavailable but Kubernetes access works, use read-only core mode:

```bash
argocd --core app get <app>
```

Cross-check ArgoCD with Kubernetes:

```bash
kubectl config current-context
kubectl get deploy,pod,svc,hpa,pdb -n <namespace> -l app.kubernetes.io/name=<app> -o wide
kubectl rollout status deployment/<app> -n <namespace>
kubectl get configmap <app>-env -n <namespace> -o yaml
```

## UI interpretation and advice

When ArgoCD is not clean, report:

- Application identity: app name, project, source repo/path/revision, destination cluster/namespace, value files.
- Status meaning: whether the issue is `OutOfSync`, `Degraded`, `Progressing`, `Missing`, `Unknown`, comparison error, sync error, or operation still running.
- Failed surface: exact resource kind/name/namespace and the visible message from Conditions, Events, Operation State, or resource details.
- UI next step: where to click next, such as Application -> Diff, resource node -> Events, resource node -> Manifest, App Details -> Parameters, or History and Rollback.
- Suggested operation: describe the UI action for the user to perform, such as Refresh, Hard Refresh, Sync with Prune, Retry, Terminate operation, or Rollback, but do not execute it with CLI.
- Safety note: explain impact before suggesting Prune, Delete, Rollback, Force, Replace, or Apply Out of Sync Only.

Report ArgoCD source path/revision/value files, sync and health status, current image, live ConfigMap env, ServiceAccount, HPA, PDB, Pod readiness, restarts, and whether the check used UI, API read-only mode, or core read-only mode.
