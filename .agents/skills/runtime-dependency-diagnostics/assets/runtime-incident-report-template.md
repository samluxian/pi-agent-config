# <service> <environment> runtime incident report

## 1. Summary And Current Classification

- Incident window and timezone:
- Symptom and evidence source:
- First failing edge:
- Current classification: `supported incident cause` / `inconclusive`
- One-sentence result with its evidence grade:

## 2. Impact And Scope

- Affected request, workload, or dependency:
- Observed impact:
- Not measured or not covered:

## 3. Timeline

| Time and timezone | Evidence layer | Observed event |
| --- | --- | --- |
| <timestamp> | <layer> | <fact> |

Mark inferred boundaries as estimates. Do not mix source intent with live or
historical deployment truth.

## 4. Evidence By Layer

### Runtime And Control Plane

- Observed:
- Coverage and time window:

### Delivery And Artifact Provenance

- Image tag/digest:
- Pipeline and source revision mapping:
- Desired/rendered/live agreement:

### Source Contract

- Exact path and behavior:
- Evidence grade: `source-proven design factor` / `supported incident cause`

## 5. Cause Classification

### Observed Mechanism

- What directly restarted, rejected, timed out, or removed work:

### Immediate Trigger

- Trigger and aligned evidence, or `not established`:

### Source-Proven Design Factor

- Delivered behavior and why it increases risk:
- Incident causality: `supported` / `unconfirmed`

### Falsifying Evidence And Alternative Explanations

- Evidence that weakens the leading explanation:
- Earlier failure boundary, healthy baseline, or conflicting layer:

## 6. Missing Decisive Evidence

- One stack, span, timing, metric, provenance field, or configuration comparison
  that would change the classification:
- Why available evidence cannot substitute for it:

## 7. Candidate Fix Surfaces

| Priority | Fix surface | Condition that must be true | Expected behavior change |
| --- | --- | --- | --- |
| P0 | <surface> | <evidence gate> | <observable result> |

Do not present a candidate as a verified fix.

## 8. Validation And Acceptance Criteria

- Same-artifact/config baseline:
- Failure reproduction:
- Behavior-level success condition:
- Regression and adverse-condition checks:
- Required delivery or policy gates:

## 9. Recommended Next Check

- One bounded, safe action:
- Owner and expected artifact:

## 10. Investigation Limits

- Unavailable access, retention, tooling, or telemetry:
- Checks intentionally skipped:
- Claims that remain unsupported:
