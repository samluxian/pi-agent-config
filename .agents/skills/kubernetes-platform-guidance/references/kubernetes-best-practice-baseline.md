# Kubernetes Best-Practice Baseline

Use this cloud-independent baseline for workload design, review, and repository
changes. Keep official Kubernetes semantics, repository conventions, rendered
intent, admitted objects, and runtime observations separate. Recommendations
must fit the workload, cluster capabilities, and availability requirements; do
not assume every workload is an HTTP Deployment or should use the same limits,
probes, autoscaler, topology policy, or security settings.

Read `kubernetes-usage-and-validation.md` for safe diagnosis and validation. Use
`gke-platform-guidance.md` only for applicable Google Kubernetes Engine behavior.
Official documentation is not permission for live mutation and does not prove
the target cluster's configuration or readiness. Check actual Kubernetes version,
API/controller support, and owning layer before changing behavior.

## Resources and scheduling

- Base CPU, memory, and relevant ephemeral-storage requests on measured workload
  needs and capacity. Requests inform scheduling; current usage alone does not
  establish historical peaks or safe sizing.
- CPU limits can throttle containers; exceeding a memory limit can lead to OOM
  termination. Choose limits deliberately rather than prescribing one CPU-limit
  policy for all workloads. Correlate termination reason, restarts, resource
  settings, and monitoring history before attributing a failure to sizing.
- Review namespace quotas/LimitRanges, sidecars, init containers, node capacity,
  affinity, taints/tolerations, and admission defaults when a Pod cannot schedule.
  Requested manifest resources and admitted Pod resources can differ.
- For replicated workloads needing fault-domain resilience, consider topology
  spread across nodes/zones. Check selectors, topology labels, eligible capacity,
  and constraint interaction: `DoNotSchedule` can leave Pods Pending. More replicas
  do not prove redundancy if all can land in the same failure domain.

## Health checks and lifecycle

- Readiness determines whether a Pod is eligible for normal Service traffic;
  failed readiness does not itself restart a container. Account for Service
  behavior such as intentionally publishing not-ready endpoints when relevant.
- Repeated liveness failures cause container restarts. A dependency-sensitive or
  overloaded liveness endpoint can cause cascading failures; choose checks that
  identify a condition the container restart can actually fix.
- A startup probe delays readiness/liveness probes until startup succeeds. Match
  its budget to observed initialization time rather than hiding a startup problem
  with arbitrary thresholds. Probe mechanisms need not be HTTP.
- Check application shutdown, `preStop`, termination grace, and traffic draining
  together. A configured grace period is not proof that in-flight work completes;
  probe success is not proof every downstream dependency or user path works.

## Identity, rollout, and disruption

- Keep workload selectors consistent with Pod-template labels and distinct from
  other controllers. Deployment selectors are immutable; treat selector/name
  changes as migrations rather than ordinary template cleanup.
- For rolling Deployments, review `maxSurge`, `maxUnavailable`, available capacity,
  readiness, and shutdown behavior. Terminating Pods can temporarily increase
  resource use beyond the nominal replica/surge count. Choose controls according
  to workload requirements, not a universal zero-downtime claim.
- PDBs constrain voluntary evictions through the eviction API. They do not prevent
  involuntary disruption or direct workload/Pod deletion, and they do not govern
  Deployment or StatefulSet rolling updates. A single replica plus restrictive
  PDB can obstruct maintenance without providing redundancy.
- Consider state, storage access modes, ordering, and backup/recovery requirements
  for stateful workloads. A PVC, replica count, or PDB is not a backup strategy.
  Stop before proposing a deletion or ownership change without retention proof.

## Autoscaling

- Confirm the scaling signal and supported target before selecting HPA or KEDA.
  CPU/memory HPA is not interchangeable with queue/backlog-driven scaling; KEDA
  is optional, not a prerequisite for ordinary workloads.
- CPU-utilization HPA needs relevant container CPU requests as its utilization
  baseline; missing requests can make utilization undefined. Verify resource,
  custom, or external metrics API availability for the configured metric type.
- Check metric freshness, target references, min/max replicas, stabilization,
  scheduling capacity, and scale-to-zero behavior where applicable. A rendered
  HPA/ScaledObject does not prove metrics delivery or scaling readiness.
- Establish one intended scaling owner per target; examine overlapping controllers
  and GitOps replica ownership before a migration. Use the KEDA checklist only
  when its scaler, identity, and repository patterns apply.

## Security and network boundaries

- Use workload-specific ServiceAccounts and least-privilege RBAC. Prefer
  namespace-scoped access where it fits, avoid wildcard permissions, and disable
  automatic API token mounting when it is not needed. Check identity consumers
  before changing token or service-account behavior.
- Pod Security Standards Restricted is a hardened comparison baseline, not a
  guarantee that every workload fits it. Review non-root execution, privilege
  escalation, capabilities, seccomp, volume/host access, and applicable OS/policy
  version requirements. A short securityContext checklist does not establish
  full policy compliance or effective enforcement.
- RBAC privileges to create workloads can imply access to mounted Secrets and
  service-account permissions; namespace separation alone is not a strong
  security boundary. Secret `get`, `list`, and `watch` can expose contents:
  never perform these checks or inspect secret payloads as diagnosis.
- NetworkPolicy enforcement requires a supporting network implementation.
  Rendered policies do not prove enforcement or that the intended Pods are
  selected. Default-deny designs must account for DNS and required dependencies.
  Review ingress and egress independently, including both ends of a connection.
- NetworkPolicy is not a replacement for all host-network, cloud-firewall,
  ingress-controller, identity, or application-level authorization controls.
  Inspect the relevant layer before attributing an access failure to one policy.

## Review priorities

Prioritize ownership, secrets and permissions, selectors/identity, resource and
health behavior, disruption/rollout, storage retention, and consumer compatibility
before style-only changes. Classify applicable guidance as aligned, missing,
conflicting, or repository-specific with exact paths and evidence. Do not copy
private target facts into this public reference or claim live readiness from
source, render, policy intent, or a successful static check.

## Official sources

- [Resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Disruptions](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- [Topology spread constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)
- [Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [RBAC good practices](https://kubernetes.io/docs/concepts/security/rbac-good-practices/)
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
