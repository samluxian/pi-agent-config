---
name: gitops-repo-audit
description: Audit static GitOps discovery, values overlays, chart metadata, CI handoff, or review readiness. Use for repository-only inventory and consistency checks. Do not use for live troubleshooting, implementation, runtime dependency health, or MR prose.
---

# GitOps Repo Audit

Assess repository evidence without editing files or crossing into live systems.

## Flow

1. Confirm target repository, branch/status, requested service/environment, and
   audit question. State whether remote freshness affects the conclusion.
2. Select a bounded route from `references/static-audit.md`:
   - discovery/bootstrap and app-of-apps inventory
   - chart metadata and dependency versions
   - values/overlay consistency
   - CI image or deployment handoff
   - review or MR readiness
3. Inspect target configuration plus one relevant reference pattern. Keep source,
   desired state, and generated/rendered evidence distinct.
4. Use `scripts/audit_gitops_tree.sh` when its checks match the repository.
5. Report each finding with evidence, impact, confidence, and one remediation.
   Hand implementation requests to the appropriate delivery skill.

## Stop Conditions

Stop when the target scope is unresolved, generated files are the only evidence,
live state is required, or remote freshness blocks a readiness claim. Do not
invent missing environments, chart versions, branches, or CI contracts.

## Output

```text
Scope:
- Repository, branch, service/environment, evidence limits

Findings:
- Severity: evidence -> impact -> remediation

Validation:
- Static checks and gaps

Risk:
- Discovery, render, CI handoff, or review-readiness risk

Next step:
- One concrete action
```
