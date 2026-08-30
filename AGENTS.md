# AGENTS.md - DevOps Workspace Contract

This repository provides portable workspace guidance. Prioritize correctness,
safety, reproducibility, and small reviewable changes. Detailed procedures belong
in project-scoped skills, not this always-loaded file.

## Core Rules

- Read the relevant files, callers, defaults, and existing patterns before editing.
- For non-trivial work, state the goal, assumptions, affected files, success
  criteria, and validation plan before changing files.
- Ask one short question before widening ambiguous scope.
- Make the smallest change that solves the request. Do not refactor, reformat,
  rename, reorder, or clean up unrelated content.
- Match repository conventions and surface conflicts instead of blending them.
- Never invent environment names, namespaces, clusters, releases, versions,
  service accounts, project IDs, endpoints, topics, branches, or credentials.
- Use deterministic evidence for facts and report uncertainty, skipped checks,
  missing tools, authentication limits, and partial failures.

## Communication

- Lead with the answer, action, or result; keep identifiers, uncertainty, and
  safety warnings precise.
- Use short headings and numbered steps when they improve navigation.
- During multi-turn work, state the current step and end with one next action.
- Explain errors as symptom, likely cause, and next check or fix.
- For risky DevOps operations, recommend one user-operated action and explain the
  effect and avoided risk.

## Approval and Mutation Boundary

Default to human-in-the-loop delivery work:

```text
analyze -> propose bounded patch, files, validation, and risk -> wait for explicit approval -> edit
```

Explicit approval includes `同意修改`, `apply`, or `照你說的改`. Approval applies
only to the described scope; ask again before widening it.

Kubernetes, Argo CD, GitLab/GitHub, GCP, and Git remotes are inspection-only.
Do not mutate, retry, approve, merge, push, tag, branch, rebase, reset, restore,
sync, scale, restart, patch, or delete resources on those surfaces. Give the
user the exact command or UI action when such an operation is required.

Editable delivery scope is limited to repository files that define desired
behavior, including Helm values, Kustomize overlays, GitOps configuration, and
CI pipeline files.

Skills-repository maintenance is the exception: when explicitly requested, any
repository-owned source, test, script, extension, configuration, or documentation
file may be created, edited, renamed, or deleted on this skills repository's
`main` branch. This exception does not apply to sibling or target repositories,
secrets, credentials, generated artifacts, caches, or git-ignored temporary
files, and it never permits Git or remote mutations. Inspect status first, keep
the change bounded, preserve unrelated user changes, update the relevant README
when human-facing behavior changes, and never commit or push.

## Repository and Git Safety

After explicit approval and before any branch-safety decision or file edit, re-inspect
the actual target repository's current branch, working tree, unstaged changes, and
staged changes. Do not reuse branch or status evidence gathered before approval.

- A clean workspace or skills repository does not prove a target repo is clean.
- Outside the explicit skills-repository maintenance exception above, do not edit
  delivery files on `main`, `master`, `release`, protected, or shared branches.
  Ask the user to switch branches.
- Do not assume local refs are current. Ask the user to run `git fetch origin`
  when remote freshness matters.
- Never discard, overwrite, stage, commit, restore, or otherwise alter user
  changes unless explicitly requested and permitted above.
- For a reused merged branch, require explicit approval and verify it remains
  non-protected and non-shared, its working tree is understood, the target ref is
  current, the old tip is contained in the target, and the new diff is bounded.
  Tell the user the next push recreates the remote branch and requires a new MR.
- If asked for a commit, provide a concise message with a visible ticket prefix
  when available; do not create the commit.

## Workspace Boundaries

Use these terms consistently:

- `<workspace-root>`: the opened workspace; contract paths may symlink to skills.
- `<skills-repo>`: owner of this contract, skills, helpers, and documentation.
- `<target-repo>`: product, deployment, chart, or infrastructure under work.

The skills repository is workspace tooling, not a monorepo. Sibling repositories
keep independent branches, remotes, histories, and dirty state. Do not combine
them unless the user explicitly requests and accepts that repository-model change.

Write unspecified investigation or incident reports to `<workspace-root>/docs/`,
a user-owned work-product path. Use a target repository only when the user names
that repository and path.

Project skills live in `.agents/skills/<name>/`: keep core flow in `SKILL.md`,
deep procedure in `references/`, repeatable checks in `scripts/`, templates in
`assets/`, and byte-identical shared helpers in `.agents/shared/`. Use the
narrowest matching skill and do not duplicate its workflow here.

Default to bounded read-only delegation when evidence acquisition is expected to
produce large raw output or require multiple independent searches or reads. Also
delegate on explicit request or skill-required independent validation. Load the
orchestrator skill first. Keep simple known-path I/O in the parent. The domain
skill retains evidence and stop conditions; the orchestrator owns role selection,
bounded prompts, concurrency, authority boundaries, and reconciliation. Do not
copy its workflow into domain skills.

## Evidence and Context

Keep evidence layers separate:

```text
application / CI -> desired state -> chart render -> Argo CD -> live Kubernetes -> runtime / GCP
```

Application source is intent evidence, not deployment truth. When layers
conflict, surface the conflict before editing. For live incidents, inspect source
only after mapping the running image to its deployed revision. Separate the
immediate trigger, contributing design factor, and supported fix surface.

Use this evidence budget unless a concrete mismatch or readiness claim needs more:

1. Repository branch/status or the supplied diagnostic packet.
2. Target desired-state or render summary.
3. Target live/resource summary.

Analyze supplied diagnostics first. Prefer commands under 120 lines and move to
another evidence layer only when deployment truth or a conflict requires it.
Summarize large renders, manifests, diffs, traces, logs, ConfigMaps, and CRDs;
keep raw output out of context and quote only the needed excerpt. Under `pipefail`,
truncate with a non-early-closing reader such as `sed -n`, or handle expected
SIGPIPE explicitly.

## Public Repository Safety

Treat this skills repository as public source. Never add company or client names
or private infrastructure identifiers to repository files. Use descriptive
placeholders and reserved example domains. Keep private target evidence in the
active investigation.

For maintenance, follow the public-safety reference and run
`check_public_safety.py`. Organization-specific terms belong only in a
machine-local terms file outside the repository; the scanner must not print
those terms. A clean current snapshot does not sanitize Git history.

## Deployment and Secret Safety

Assume GitOps is the deployment authority unless evidence proves otherwise:
`Git change -> MR -> merge -> Argo CD reconcile`. Do not run mutating `kubectl`,
`helm`, or `argocd` operations.

- Never modify, expose, decode, print, copy, or read secrets, credentials,
  kubeconfigs, private keys, `.env` files, or generated credential files.
- Never hardcode sensitive values or move them into ConfigMaps.
- Git-ignored `tmp/` may hold user-controlled temporary secret output only when
  explicitly requested. Provide commands but do not run or read them.
- Prefer least-privilege IAM; never suggest broad Owner or Editor roles.
- Verify the relevant evidence layer instead of inferring dependencies from names.

## Validation and Reporting

Classify post-edit validation by behavior and blast radius, not line count:

- `V0` documentation or comments: diff, formatting, links, or documentation checks.
- `V1` local structured configuration: parser, schema, and changed-file checks.
- `V2` deploy, CI, Helm values, or application configuration: affected render,
  discovery, pipeline, or behavior checks.
- `V3` Terraform, IAM, network, shared chart APIs, resource ownership, or security:
  every mandatory affected-root plan, compatibility, or policy gate.

A domain skill or repository adapter may escalate the tier. Never let this table
weaken its mandatory gate. Do not run post-edit validation when no repository
files changed. During edits, run only checks needed to unblock the work; run the
smallest release-level checks once after the final edit. Do not rerun the same
successful check when repository and relevant external state are unchanged.

Prefer one existing repository or skill-owned deterministic helper over several
model-directed commands, and keep its result bounded. A successful command
without behavior evidence is insufficient. After repository file mutations, the
parent or approved worker runs the smallest validation that proves the final
behavior and reports failures or skipped checks. The parent retains evidence
reconciliation and final delivery judgment.

After changes, report:

```text
Summary:
- What changed

Validation:
- Command and result

Risk:
- Deployment, IAM, CI, runtime, or documentation risk

Next step:
- One concrete action
```

If no files changed, say so. If repository files changed, include a suggested
commit message. For branch-ready delivery work, also report validation gaps.

## Continuous Improvement and Handoff

For a reusable lesson, propose exactly one skill update, new skill, session note,
or no change. Do not edit skills without explicit approval; state the trigger,
target, exact change, value, and overfitting risk.

When a handoff is useful or requested, write a concise `docs/session-notes/`
entry without secrets, credentials, `.env` values, long logs, manifests, or diffs.
