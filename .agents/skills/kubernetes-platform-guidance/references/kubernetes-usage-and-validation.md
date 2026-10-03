# Kubernetes Usage and Validation

Use this reference for bounded read-only investigation and validation of approved
repository changes. Discover the actual target and desired-state owner first.
Command names below explain semantics; they do not authorize a cluster mutation,
credential access, broad object dump, or an unrequested environment change.

## Establish a safe target

- Confirm task type, context, environment, namespace, workload/resource, owning
  repository, and controller/GitOps authority. A configured context is a
  discovery clue, not proof it is the requested production or test environment.
- `kubectl config current-context` and context summaries can identify non-secret
  target names. Use selected fields/names only; never read raw kubeconfig,
  authentication data, certificate/private-key material, or credential files.
  Do not change the active context; make the established context explicit for
  permitted queries rather than relying on an implicit switch.
- Establish actual client/server versions where compatibility matters. Kubernetes
  supports kubectl within one minor version of kube-apiserver; HA API-server skew
  can narrow this range. Do not install or assume the latest CLI/server version.
- Bound discovery and reads by namespace, resource names/selectors, fields, time,
  and output size. Avoid cluster-wide YAML/JSON dumps or `get all` as the default
  evidence source. Review selected fields for sensitivity before retrieval.

## Read-only symptom-to-evidence path

| Symptom | Smallest useful evidence | What it does not prove |
| --- | --- | --- |
| Pending Pod | Scheduling conditions/events, requests, relevant placement constraints and capacity | The scheduler is broken, or adding capacity is the right fix |
| Image pull failure | Container waiting reason, selected image/pull policy, related non-secret events | Registry credentials are wrong; never inspect pull Secret data |
| CrashLoop/restarts | Container state and last termination reason, restart count, relevant probe/resource settings, bounded selected-container logs | Restarting the Pod will fix the cause |
| Suspected OOM/throttling | Termination reason/exit context, resource settings, historical monitoring when available | Current usage proves an earlier peak or CPU throttling event |
| Unavailable Deployment | Deployment conditions, desired/updated/available counts, owned ReplicaSet/Pod status, relevant events | Rendered rollout settings guarantee progress or zero downtime |
| Service failure | Service ports/selector, matching Pod readiness/labels, EndpointSlice endpoints/conditions | Populated endpoints prove DNS, network policy, ingress, or application health |
| Autoscaling failure | HPA/ScaledObject conditions, target and metric types, requests, metrics availability and freshness | A threshold change or more replicas will fix unavailable metrics |
| Permission failure | Exact non-secret resource/verb authorization evidence and actual selected identity | Kubernetes RBAC proves cloud IAM or application authorization |
| GitOps drift | Desired revision/render versus selected live fields, ownership and admission/defaulting evidence | A healthy Pod makes a diff harmless, or broad ignore rules are justified |

Follow the owning controller rather than treating an individual Pod as the source
of truth. Separate event observations, status reasons, and hypotheses; event/log
absence is not proof nothing happened. Capture relevant timestamps with their
source zone, and keep UTC explicit when the user's zone is unknown.

## Logs, metrics, and authorization

- `kubectl logs` supports an explicit container, `--previous`, `--since`, and
  `--tail`; use these to constrain the needed evidence. They bound volume, not
  sensitivity. Inspect only known non-secret diagnostic streams, and never print
  credentials, tokens, secret payloads, or unnecessary personal data.
- Generic `describe` output can include environment values, annotations, event
  messages, or other sensitive details. Prefer field-selected status/metadata;
  use describe only when the resource/output is established as non-secret.
- `kubectl top` depends on available metrics and reports current usage. It is not
  historical monitoring and does not establish past peak memory or the cause of
  an earlier OOM. Record unavailable metrics as a gap, not as zero usage.
- A selected `kubectl auth can-i` check answers a specific Kubernetes authorization
  question through an authorization review; it is not a broad permission audit or
  proof an operation/cloud API will succeed. Use only where permitted, without
  impersonation or Secret access, and keep the queried scope exact.

## Operations outside the read-only boundary

Never run apply, create, patch, delete, scale, rollout restart, drain, or eviction.
Do not use exec, debug, run, attach, port-forward, node proxy, or an in-cluster test
Pod to diagnose from this agent. Debug/run can create resources or ephemeral
containers; exec executes a process. Even a GET-like node proxy permission can
allow process execution. The name read, debug, or test is not a safety guarantee.

`kubectl diff` uses server-side dry-run operations. Dry-run requests require
write-equivalent authorization and exercise admission even without persistence;
they are not pure GET inspection. Do not use diff, apply dry-run, or server-side
validation as a shortcut under this live-read-only contract. Use local checks
and report admission/runtime evidence as unverified instead.

Never get/list/watch Secrets, dump complete Pod specs, inspect mounted secret
files, or read raw kubeconfig to solve an access failure. Do not grant permissions,
create credentials, disable policy, restart, or bypass GitOps ownership as a
repair. When a mutation is necessary, stop at diagnosis and recommend one bounded
user-operated action in the owning delivery workflow, without supplying a
prohibited mutation command.

## Repository-change validation

1. Recheck the actual target branch, staged/unstaged changes, ownership, and exact
   approved files; preserve unrelated user changes.
2. Trace source/values through the target's render path. For Helm behavior, use
   the Helm chart skill's dependency/lint/schema/render gate; do not assume chart
   ownership from service values or automatically download/update dependencies.
3. Run permitted syntax and schema checks using the supported Kubernetes API and
   CRD versions. Inspect repository helpers first: a check can invoke cluster
   writes, create test workloads, or persist sensitive manifests.
4. Assert the changed behavior and negative cases where applicable: names and
   selectors, resources, probe/lifecycle settings, security/RBAC scope, scheduling,
   autoscaling references, and resource presence/absence. Test relevant consumer
   profiles instead of claiming success from a generic default render.
5. Separate validation layers: parse/schema proves structure; local render proves
   intended output; admission proves server acceptance at a point in time;
   controller status and runtime observations support deployment health. No lower
   layer substitutes for the next. Report unavailable admission/live checks.
6. Review the final bounded diff/status and report rollout, availability, storage,
   identity, network, or ownership risks. Do not execute the deployment.

## Official sources

- [Current context](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_config/kubectl_config_current-context/)
- [Context summaries](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_config/kubectl_config_get-contexts/)
- [Version skew policy](https://kubernetes.io/releases/version-skew-policy/)
- [Application troubleshooting](https://kubernetes.io/docs/tasks/debug/debug-application/)
- [Pod failure investigation](https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/)
- [Service troubleshooting](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/)
- [Services and EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/service/)
- [kubectl logs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)
- [Observability](https://kubernetes.io/docs/concepts/cluster-administration/observability/)
- [Authorization checks](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/)
- [Declarative management and diff](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/)
- [API authorization](https://kubernetes.io/docs/reference/access-authn-authz/authorization/)
- [Admission controllers](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)
- [kubectl debug](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_debug/)
- [RBAC good practices](https://kubernetes.io/docs/concepts/security/rbac-good-practices/)

Official troubleshooting guides can contain mutating steps. Follow only the
permitted evidence-gathering portions; their examples do not expand agent scope.
