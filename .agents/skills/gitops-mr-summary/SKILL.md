---
name: gitops-mr-summary
description: Write evidence-based DevOps/GitOps MR descriptions, summaries, branch notes, or cross-repo handoff text. Use for requested MR copy only. Do not use for implementation, audit, review, or troubleshooting.
---

# GitOps MR Summary

Write copy from repository evidence without changing files or claiming unrun
validation.

## Flow

1. Confirm target repository, comparison base, branch freshness, requested format,
   audience, and whether one or multiple repositories are involved.
2. Inspect bounded evidence: status, changed-file summary, relevant diff hunks,
   commit history when needed, and validation supplied or recorded by the repo.
3. Separate facts from interpretation. Do not infer runtime, deployment, IAM, or
   compatibility outcomes from filenames or intent alone.
4. Explain what changed, why, validation, risk, rollout/handoff, and known gaps.
   Keep application and deployment repository responsibilities distinct.
5. Return copy-ready text only unless the user asks for analysis.

Do not mutate Git, GitLab/GitHub, or repository files. If refs may be stale,
state that limitation or ask the user to fetch before making comparison claims.

## Output Contract

```text
## Summary
- Behavior and scope

## Changes
- Evidence-backed file/config changes

## Validation
- Completed checks and explicit gaps

## Risk / Rollout
- Deployment, IAM, CI, runtime, and cross-repo handoff
```

Use concise bullets, preserve technical identifiers, and omit empty sections only
when the requested MR template permits it.
