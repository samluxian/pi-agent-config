# Optional Google Kubernetes Engine Guidance

Use only for a confirmed GKE target. This reference supplements, not replaces,
`kubernetes-best-practice-baseline.md` and `kubernetes-usage-and-validation.md`.
Do not require GKE, Autopilot, Google-specific globals, or cloud IAM in a generic
Kubernetes workload. Check current Google documentation against the actual mode,
version, node pools/compute class, dataplane, and upgrade strategy.

## Autopilot resources and admitted state

- Autopilot can supply omitted requests, raise requests below supported minimums,
  or adjust CPU/memory to fit a compute class's ratio. Requests above supported
  maxima can be rejected. Behavior varies with hardware, compute class, bursting
  support, and GKE version; do not hardcode numeric defaults into general charts.
- Compare source/render with selected admitted Pod fields and relevant events.
  Source is not proof of effective requests, and usage is not proof of admission
  policy. Confirm the owning controller and any admission changes before editing
  resource values or calling a GitOps diff harmless.
- Check aggregate workload needs, quotas, scheduling and cost implications before
  changing requests. Matching an observed admitted value is not automatically the
  correct sizing decision for every workload or environment.
- Prefer narrow, evidenced desired-state fixes. Ignore-difference rules require
  proof of the exact admission/defaulting behavior and ownership; never ignore a
  whole workload/spec to silence OutOfSync or infer health from Pods alone.

## Workload Identity Federation for GKE

- Workload Identity Federation is always enabled in Autopilot. In Standard,
  verify cluster configuration and the relevant node pools; enabling it on the
  cluster does not automatically convert existing pools.
- Do not apply Standard-only metadata-server node selectors to Autopilot.
  Federation enablement does not itself grant access to Google Cloud resources.
- Establish the actual workload Kubernetes ServiceAccount (KSA), execution path,
  and intended resource. Direct federated-principal access and IAM service-account
  impersonation are different patterns; do not require a Google service account
  annotation for every federation design.
- For the impersonation pattern, verify both the appropriate IAM binding and KSA
  annotation. For direct access, verify the intended federated principal's
  resource-scoped allow policy. Keep permissions least-privilege and check the
  target API/scaler's support rather than assuming interchangeability.
- Separate desired configuration, admitted KSA/pool selection, actual IAM policy,
  and a successful workload-level API request. A render or healthy controller
  proves neither identity readiness nor Secret Manager read permission.
- The agent only inspects permitted non-secret evidence using existing sessions;
  it never creates keys, changes IAM, logs in, or executes inside a workload.
  When actual access cannot be verified, state that prerequisite as unproven.

## Network and upgrades

- Kubernetes NetworkPolicy controls Pod-level traffic where enforced. VPC
  firewalls govern a different node/VM network layer; one does not substitute for
  the other. Verify dataplane/enforcement, policy selectors, both ingress/egress,
  DNS, and required dependencies before attributing a network failure to IAM or
  a firewall.
- Release channels express currency/stability tradeoffs; do not change a channel
  as a generic workload best-practice cleanup. Review support/security-driven
  upgrades and maintenance settings as GKE operational policy.
- GKE node-upgrade handling of PDBs and graceful termination is bounded, not an
  unlimited guarantee that a restrictive PDB can prevent progress. Check the
  actual strategy/version, replicas, placement and available capacity; do not
  promise zero downtime or copy a timeout from an unrelated cluster.

## Evidence and reporting

Record GKE mode/version and relevant compute-class, node-pool, dataplane or
upgrade assumptions only when they matter. Distinguish official recommendation,
repository intent, admission effects, IAM/runtime evidence and unavailable checks.
Keep private cluster/project/service identifiers in the task session, not this
public skill. For KEDA, load its implementation checklist only after establishing
the intended scaler and identity mechanism.

## Official sources

- [Autopilot resource requests](https://cloud.google.com/kubernetes-engine/docs/concepts/autopilot-resource-requests)
- [Workload Identity Federation for GKE](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [GKE networking architecture](https://cloud.google.com/kubernetes-engine/docs/learn/learn-gke-net-architecture)
- [GKE NetworkPolicy](https://cloud.google.com/kubernetes-engine/docs/how-to/network-policy)
- [GKE cluster upgrades](https://cloud.google.com/kubernetes-engine/docs/how-to/upgrading-a-cluster)
- [GKE release channels](https://cloud.google.com/kubernetes-engine/docs/concepts/release-channels)

These sources establish vendor semantics, not the readiness of an uninspected
cluster, workload, federation binding, or cloud resource.
