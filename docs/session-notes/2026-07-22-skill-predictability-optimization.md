# Skill Predictability Optimization

## Summary

- Narrowed `caveman` and `orchestrator` invocation boundaries.
- Added stage completion criteria to `gitops-implementation-workflow`.
- Moved branch-only guidance for GCP cost analysis, runtime dependency helpers,
  and `flex-app` validation into routed references.
- Added positive and negative invocation fixtures plus a deterministic validator.
- Updated `README.md` to reflect the new routing and maintenance contract.

## Validation

- All six changed skills passed `quick_validate.py`.
- Eight invocation fixtures passed the shared fixture validator.
- Forward tests confirmed both positive and negative invocation boundaries for
  `caveman` and `orchestrator`.
- `git diff --check` passed.

## Scope

- No product, deployment, IAM, CI, or runtime configuration was changed.
- Existing staged changes in the skills repository were preserved.
