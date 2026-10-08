# Service Diagnosis

Use this workflow for failures in Kubernetes-backed services: API errors,
authentication/authorization, dependency calls, cloud access, and post-change
verification. It supplements the workspace contract, not the permission boundary.
Do not save incident evidence or change a target merely because diagnosis finds a
cause. Read `kubernetes-usage-and-validation.md` for cluster inspection rules and
`gke-platform-guidance.md` only when GKE is confirmed.

## One entry point, bounded tools

Keep scope, hypotheses, evidence reconciliation, and the final judgment in the
parent. Use the same sequence regardless of whether evidence comes from a direct
CLI query or a read-only subagent:

| Evidence | Preferred acquisition | Boundary |
| --- | --- | --- |
| One or two known source files | Direct `read` | Inspect callers/defaults before deciding; skip secrets and instruction files. |
| Multi-file request/configuration trace | `scout` with confirmed allowed directories | Give endpoint, error signature, exclusions, acceptance, and concise file:line return. |
| Multi-resource live/runtime evidence | `environment-scout` with explicit targets | Selected Kubernetes/GCP fields, bounded logs, no mutations or credential acquisition. |
| Small known live check or missing structured projection | Direct field-selected `kubectl` or `gcloud` | Explicit context/project, namespace/resource, time window, fields, and output limit. |
| Vendor behavior needing external confirmation | `researcher` | Documentation is a hypothesis until target-system evidence supports it. |

Structured tools are not a prerequisite or a sandbox. If a tool omits the needed
field, use one permitted direct projection rather than repeatedly running the
same incomplete summary. Never widen access to secrets or raw payloads to work
around tool limits. Do not enable APIs, download dependencies, switch contexts,
fetch credentials, or change cloud settings as diagnostic preparation. Report
unavailable APIs and permissions; continue independent permitted checks.

## 1. Establish the incident and split failures

Record only what is needed in session context:

- Explicit environment, repository, endpoint/operation, resource, and owner.
- Failing step, preceding successful steps, transport status, application code,
  sanitized error signature, and timestamp with source timezone.
- Whether the request reached the BFF, backend, dependency, or cloud API.
- Relevant recent change, comparison source freshness, and current branch/status.

A client TLS EOF before login and a backend failure after login are separate
tracks unless a correlation artifact connects them. A business failure at HTTP
200 is not success; a generic HTTP 500 does not identify the owning layer. Do not
copy account identifiers, tokens, service keys, signed URLs, or request bodies
from screenshots into logs, commands, public skills, or saved reports.

If an existing context/account identifies the requested target uniquely, use it
for bounded discovery and keep target flags explicit. A default project different
from the requested project is not permission to investigate the default. Ask only
when multiple plausible targets or conflicting evidence cannot be resolved safely.

## 2. Trace the failing request before expanding infrastructure checks

Build a short source-backed request graph:

`client operation -> BFF endpoint -> backend method -> dependency operation`

For each relevant edge, identify file:line evidence for:

- URL/path and method, multipart versus JSON, and request/response wrapper.
- Forwarded application identity/context, without exposing token values.
- Credential resolution order and non-secret configuration property names.
- The operation that can produce the observed error and its error mapping.
- Local writes/external effects before the failing call, transaction boundaries,
  and explicit compensation if present.

Do not equate a service mentioned in a configuration file with the service that
actually executes the cloud operation. An application token is not a GCP identity.
A storage flow may use server-side object writes, signed URL generation, or direct
client requests; trace the exercised path before choosing required permissions.

Mark rollback/compensation unknown when not established. If failure may leave
partial records or external objects, do not advise repeated create/provision calls
until the operator checks for partial state. Do not inspect application databases
or private payloads without a separately permitted, bounded evidence path.

## 3. Use schema-aware, secret-safe logs

Start with a narrow time window around the supplied failure and the named
container/service. Bound entries and select fields before retrieval. Confirm the
logging schema from source or known non-secret metadata rather than assuming all
services use the same message/status fields.

Check all applicable response locations: HTTP status, nested API status/code,
GraphQL errors, multipart response summary, upstream summary, and exception type.
INFO-level entries can contain business failures. ERROR-only queries and summaries
that project only `textPayload` or `jsonPayload.message` can miss structured errors.
For example, `apiResponse` and `upstreamRequest` may be different paths; determine
the actual names from the owning logger rather than inventing them.

Use timestamp, pod/container, operation, non-secret status/code, and a safe trace
identifier when emitted as a dedicated field. Match an exact exception signature
or stack method server-side and retrieve only safe fields when the message may
contain keys or payloads. Do not fetch a whole log entry to redact it afterward if
its content may expose secrets. Never echo secret-bearing errors or full signed
URLs. A tool's automatic redaction does not grant permission to retrieve them.

Correlate adjacent service records by trace ID where available; otherwise use a
bounded time/operation sequence and label temporal correlation as such. A wrapper
500 is an observation; the dependency denial or throw site explains the cause.
An empty audit query does not prove no failure: identity, project, retention,
audit configuration, timing, ingestion delay, or a pre-API exception may differ.

If a recent narrow window has no relevant entries, expand it once only with a
reason (for example a supplied earlier retry). Preserve the old window's result;
do not silently substitute unrelated historical errors for the incident.

## 4. Compare desired, live, and actual identity

Keep the layers separate:

`source/CI -> desired state -> render -> Argo CD -> live Kubernetes -> runtime/cloud`

Read the actual target repository status; source or a clean sibling does not prove
what is deployed. Inspect chart aliases/override order only where needed, using
`helm-chart-best-practices` for render behavior. Do not render profiles containing
secret payloads. Prefer live selected fields over a stale chart when they conflict,
and report the conflict instead of updating unrelated environments.

For authorization failures, compare three different questions:

| Question | Evidence |
| --- | --- |
| Which identity is configured? | Pod KSA, identity annotation/binding, deployment configuration references. |
| Which identity does this client actually use? | Credential-selection code plus safe runtime mode/principal evidence. |
| Is the attempted operation authorized? | Exact dependency permission denial and relevant allow/deny policy evidence. |

Explicit credentials can take precedence over ADC/Workload Identity. A valid KSA
binding and a role on its GSA do not prove that the SDK used that GSA. Conversely,
a bucket without a direct binding may inherit project-level access. Include
relevant inherited/conditional/deny controls when available; do not interpret a
role listing as a successful runtime request.

Distinguish object read/write permissions, signing permissions, application
registration, client TLS, and CORS. Require an exact operation/denial or equivalent
artifact before calling a missing role the root cause. Do not broaden IAM or alter
application sequencing to test an unproven hypothesis.

### Private configuration boundary

Trace references, not payloads:

`values -> ExternalSecret/SecretStore reference -> Kubernetes Secret reference -> mount/import`

Selected reference names, mount paths, provider project, synchronization status,
and non-secret version metadata can identify the owner without retrieving a
Secret. Never get/list/watch Kubernetes Secrets, access Secret Manager versions,
decode credential JSON, or inspect mounted private files. Even extracting only
`client_email` from credential JSON is a credential read and is not permitted.
Use a non-secret runtime principal field or an exact safe log predicate; if those
are unavailable, ask the configuration owner for only the account email or mode.

Distinguish the upstream secret provider, ExternalSecret spec, generated Secret,
and GitOps desired state. Changing a generated Secret may be overwritten by
synchronization; changing a live ExternalSecret may be reverted by GitOps. Before
removing an override, establish the user's intended source change and preserve
shared consumers. Diagnosis itself authorizes neither source nor live changes.

## 5. Reconcile evidence and stop at a demonstrated cause

Maintain a short table in session context: observation, owning layer, hypothesis,
discriminating check, result, and remaining gap. Revise earlier hypotheses when
new artifacts contradict them; explicitly correct a missed log schema or mistaken
identity. Do not keep acquiring evidence after acceptance is satisfied.

A useful root-cause statement connects the failing operation, actual identity or
input, observed rejection, and configuration/code behavior explaining it. Separate
that cause from secondary symptoms and from the proposed fix. If one link cannot
be checked safely, name it precisely; do not promise to find it by reading secrets
or off-scope repositories. Ask one scope question before an unrequested expansion.

Recommend one bounded action in the owning delivery workflow. Never execute
remote/cloud mutations, bypass TLS, retry a mutation, or restart a workload as a
probe. Repository fixes need authorization and the owning skill's validation gate.
Do not modify documentation in a target repository to record ordinary diagnosis.

## 6. Verify a delivered change at three separate gates

Recheck after the user reports delivery; prior evidence may be stale.

1. **Live configuration:** the expected non-secret value/reference is present and
   the Deployment uses it. Environment variables and JVM startup properties need
   newly started containers; a changed ConfigMap alone does not prove adoption.
2. **Rollout and runtime mode:** observed generation matches generation; updated,
   ready, and available counts satisfy desired replicas; the new ReplicaSet is
   available and old Pods are no longer serving. Inspect restart/start/readiness
   state and per-new-Pod runtime mode. `Progressing=True` alone is not completion.
3. **Exercised behavior:** a correlated real request succeeds through the affected
   operation, with the expected dependency outcome. Do not execute mutating test
   requests; use an authorized operator's retry and bounded read-only evidence.

No old-identity error in a quiet window is not proof of successful object writes.
A Ready Pod is not proof of application authorization or signed URL readiness.
Report configuration verified, rollout complete/incomplete, and behavior
verified/unverified separately, with timestamps and limits. End with the answer,
evidence, material risk/gap, and one next action only when work remains.
