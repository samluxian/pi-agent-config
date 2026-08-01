---
name: gitops-repo-audit
description: "Audit static GitOps desired state, discovery, values overlays, chart metadata, CI handoff, or review readiness. Use for repo-only inventory and consistency checks before editing. Do not use for live troubleshooting, implementation, runtime dependency health, or MR prose."
---

# GitOps Repo Audit

Use this skill for static, read-only audits of `k8s-deploy`, `helm-chart`, and
application repos in this workspace. It is for finding consistency gaps,
bootstrap discovery problems, risky desired-state patterns, and CI handoff
mismatches before proposing delivery changes.

If the audit discovers a needed change, report the smallest patch and wait for
approval.

## Start

Identify the target repo and run read-only git checks there:

```bash
git branch --show-current
git status --short --untracked-files=all
git diff --name-status HEAD
git diff --cached --name-status
```

If the audit spans nested repos, repeat the checks in each actual repo. A clean
workspace-root status does not prove inner repos are clean.

Use the smallest static evidence budget that can answer the audit question:
repo status, changed paths, target desired-state files, and then render/live
handoff only if the audit is explicitly about readiness or a concrete conflict.
Do not scan broad trees after the relevant service/env/path set is known.

Scope identification is complete when the actual repos, branches, changed paths,
services, and environments used by the conclusion are all named.

## Audit Routes

Pick the narrowest route:

| User intent | Route | Reference |
| --- | --- | --- |
| `k8s-deploy` service/env discovery, path moves, `values.ignore` | desired-state audit | `references/static-audit.md` |
| Helm chart defaults, values overlays, flex-app conventions | chart/values audit | `references/static-audit.md` |
| Upstream GitLab CI writes to `k8s-deploy` | CI handoff audit | `references/static-audit.md` |
| MR or branch readiness without editing | review audit | `references/static-audit.md` |

For delivery implementation, hand back to `$gitops-implementation-workflow`.

## Deterministic Checks

Use the bundled script for a quick inventory when auditing `k8s-deploy`-style
trees:

```bash
.agents/skills/gitops-repo-audit/scripts/audit_gitops_tree.sh <repo-path>
```

The script is an inventory helper, not a proof of correctness. Follow with
targeted `rg`, Helm render, CI inspection, or live read-only checks as needed.
Use path filters, `git diff --stat`, `git diff --name-only`, and target-file
reads before full diffs or broad repository scans.

The audit is complete when every finding names its desired-state evidence,
affected scope, risk, and either the smallest proposed correction or why no
change is required.

## Output

```text
結論:
Scope checked:
證據:
風險:
建議:
Skill follow-up:
- update existing skill | create new skill | session memory only | none
```

When proposing a skill improvement, follow the workspace `AGENTS.md` Skill
Continuous Improvement rules.
