# Runtime Incident Report Contract

Use this contract only when the user requests a written incident report or RD
handoff. Keep the live diagnostic response compact; load
`../assets/runtime-incident-report-template.md` only when creating the report.

## Evidence Taxonomy

Assign every causal statement one grade:

| Grade | Meaning | Allowed wording |
| --- | --- | --- |
| `observed` | A bounded event, state, metric, stack, trace, or explicit log field shows the behavior. | "The probe received connection refused." |
| `source-proven design factor` | The delivered source implements the behavior, but runtime evidence does not prove its role in this incident. | "Startup performs synchronous dependency checks; incident causality is unconfirmed." |
| `supported incident cause` | Aligned runtime evidence identifies the failing call or edge, and an applicable baseline does not falsify it. | "The main thread waited in the named client call during the failure window." |
| `inconclusive` | The evidence identifies a region or mechanism but not the causal call or trigger. | "The last progress log narrows the next check; it does not identify the blocked thread." |

Do not combine `source-proven design factor` and `supported incident cause` into
one root-cause statement. A report may contain both, with different grades.

## Required Checks Before Root-Cause Wording

1. State the first observed failure and its timezone.
2. Separate the mechanism that restarted or rejected work from the condition
   that prevented recovery.
3. Map the runtime artifact to the pipeline and source revision before using
   source evidence.
4. Compare one aligned healthy or earlier-failure baseline.
5. Record evidence that weakens the leading explanation. If the candidate event
   starts after the first failure, do not call it the initial trigger.
6. Name the missing stack, span, operation timing, metric, provenance field, or
   configuration comparison when causality remains open.
7. Make each proposed fix conditional on the behavior it is intended to change.

## "Not Evidence Of" Rules

- `Running` is not `Ready`; unready before the probe begins is not a probe
  failure.
- Exit code 137 is not OOM proof without `OOMKilled` or equivalent memory
  evidence.
- A successful dependency connection is not proof that later operations are
  healthy.
- A final log line is not a stack trace or blocking-call measurement.
- A source diff is not a complete artifact or runtime-config comparison.
- Estimated operation volume is not measured concurrency, saturation, queueing,
  or lock contention.
- Pipeline duration is not application startup duration without stage timing.
- Current health is not historical incident health.

## Report Quality Gate

Before delivery, verify that:

- each finding names its evidence layer and time window;
- source design findings remain visible even when incident causality is open;
- counterevidence and unvalidated assumptions are explicit;
- recommendations do not claim an untested fix;
- validation proves behavior rather than only manifest or command success;
- private logs, identifiers, payloads, credentials, and internal topology are
  omitted or replaced with public-safe placeholders when the report belongs in
  this public repository.
