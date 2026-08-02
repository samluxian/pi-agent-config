# Transient Request Incident Gate

Date: 2026-08-02
Status: complete; awaiting user Git handoff

## Result

- Extended `runtime-dependency-ops` to own time-bounded transient request
  failures such as intermittent 5XX, timeout, connection reset, latency spike,
  GraphQL error, or application status embedded in HTTP 200.
- Added a progressive-disclosure reference that gates incident-window identity,
  request-path ownership, observability coverage, infrastructure correlation,
  and deployed-source inspection.
- Added cross-project frontend-to-backend ownership discovery without assuming
  that the Kubernetes workload project owns the load balancer.
- Added a load-balancer metric fallback for disabled request logging. Absence of
  5XX is evidence only after positive all-status metric coverage exists for the
  same forwarding rule and window.
- Added structured-status rules that reject free-form payload keyword matches as
  HTTP status or network-timeout evidence.
- Added a node scale-down causal gate that distinguishes `direct`, `indirect
  candidate`, `coincidental`, `inconclusive`, and `no coverage`.
- Kept source inspection behind the existing deployed artifact and
  application-evidence gate.
- Did not modify `service-delivery-topology`, add a new skill, add a dashboard
  workflow, or add a broad query script.

## Changed Files

- `.agents/skills/runtime-dependency-ops/SKILL.md`
- `.agents/skills/runtime-dependency-ops/agents/openai.yaml`
- `.agents/skills/runtime-dependency-ops/references/transient-request-incidents.md`
- `.agents/shared/skill-quality/fixtures/invocation-cases.json`
- `AGENTS.md`
- `README.md`
- `docs/session-notes/2026-08-02-transient-request-incident-gate.md`

## Verification

- Repository contract validation passed with 11 model-invoked skills, 5
  extensions, and 3 extension test files.
- Invocation fixture validation passed with 29 cases across 11 skills and
  positive and negative coverage.
- Six representative routing benchmarks passed with
  `openai-codex/gpt-5.6-sol` at `low`: transient request and deployed-source
  cases invoked `runtime-dependency-ops`; topology design and GitOps mismatch
  skipped it; topology and single-live-Pod ownership remained correct.
- Benchmark artifacts are git-ignored under
  `tmp/invocation-benchmark-transient-request-20260802T070005Z/`.

## Risk

- Guidance and routing behavior only; no deployment, IAM, CI, runtime, or remote
  system was mutated.
- GCP metric names and GKE audit methods are provider-specific bounded probes
  inside a provider-neutral evidence gate.
- Shared-forwarding-rule metrics cannot identify a host without backend labels,
  a dedicated rule, request logs, or trace evidence; the reference preserves
  this limitation.

## Next Action

Review the working diff, then commit and push through the user-operated Git
workflow when ready.
