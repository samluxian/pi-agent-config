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

- Lead with the answer, recommendation, or completed result.
- Keep identifiers, commands, uncertainty, and safety warnings precise.
- Use short headings for analysis and numbered steps for multiple actions.
- State the current step during multi-turn work and end with one concrete next
  action when work remains.
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

Workspace guidance maintenance is the exception: when explicitly requested,
`AGENTS.md`, `README.md`, `.agents/skills/**`, and `docs/session-notes/**` may be
edited on this skills repository's `main` branch. Inspect status first, keep the
change bounded, update README when human-facing behavior changes, and never
commit or push.

## Repository and Git Safety

Before editing, identify the actual target repository and inspect its branch,
working tree, unstaged changes, and staged changes.

- A clean workspace or skills repository does not prove a target repo is clean.
- Do not edit delivery files on `main`, `master`, `release`, protected, or shared
  branches. Ask the user to switch branches.
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

- `<workspace-root>`: the opened workspace; `AGENTS.md` and `.agents/skills` may
  be symlinks into the skills repository.
- `<skills-repo>`: the repository owning this contract, skills, shared helpers,
  README, and session notes.
- `<target-repo>`: the product, deployment, chart, or infrastructure repository
  being inspected or changed.

Treat the skills repository as workspace tooling, not a product monorepo.
Sibling repositories retain independent branches, remotes, histories, and dirty
state. Do not convert them to submodules, subtrees, or a monorepo unless the user
explicitly requests that repository-model change and accepts its impact.

Project-scoped skills live under `.agents/skills/<name>/`. `SKILL.md` contains
the task boundary and core flow; deeper procedures belong in `references/`,
repeatable checks in `scripts/`, reusable templates in `assets/`, and
byte-identical cross-skill helpers in `.agents/shared/`.

Use the narrowest matching skill. Treat its description as the routing boundary.
Do not duplicate detailed skill routing or workflow in this file.

## Evidence and Context

Keep evidence layers separate:

```text
application / CI -> desired state -> chart render -> Argo CD -> live Kubernetes -> runtime / GCP
```

Application source is intent evidence, not deployment truth. When layers
conflict, surface the conflict before editing. For live incidents, inspect source
only after mapping the running image to its deployed revision. Separate the
immediate trigger, contributing design factor, and supported fix surface.

Use this default evidence budget unless the task requires more:

1. Repository branch/status or the supplied diagnostic packet.
2. Target desired-state or render summary.
3. Target live/resource summary.

Stop unless a concrete mismatch, missing field, error, or readiness claim needs
more proof.

- Analyze a user-provided diagnostic packet before reading more files or systems.
- Prefer narrow commands expected to return under 120 lines.
- Summarize large renders, manifests, diffs, traces, logs, ConfigMaps, and CRDs;
  do not print them in full unless required for a named finding.
- Move between evidence layers only when deployment truth, readiness, or a
  concrete conflict requires it.
- Keep large raw output in files or pipes and quote only the minimal safe excerpt.

## Deployment and Secret Safety

Assume GitOps is the deployment authority unless evidence proves otherwise:

```text
Git change -> MR -> merge -> Argo CD reconcile
```

Do not directly run mutating `kubectl`, `helm`, or `argocd` operations.

- Never modify or expose secrets, credentials, kubeconfigs, private keys, `.env`
  files, or generated credential files.
- Never hardcode sensitive values or move them into ConfigMaps.
- Do not decode, print, copy, or read secret values.
- The git-ignored `tmp/` directory may hold user-controlled temporary secret
  output only when explicitly requested. Provide commands but do not run them or
  read the resulting files.
- Prefer least-privilege IAM; never suggest broad Owner or Editor roles.
- Do not infer Redis, Pub/Sub, OTEL, Secret Manager, Workload Identity, or API
  usage from names alone. Verify the relevant evidence layer.

## Validation and Reporting

Run the smallest validation that proves the intended behavior. A successful
command without behavior evidence is insufficient. Prefer existing repository
scripts and skill-owned deterministic helpers.

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

When an investigation reveals a reusable lesson, propose exactly one: update an
existing skill, create a new skill, write a session note, or make no skill
change. Do not edit skills without explicit approval. State the triggering
lesson, target, exact proposed change, value, and overfitting risk.

For pause, completion, or later resume, record a concise note under
`docs/session-notes/` when requested or operationally useful. Never include
secrets, credentials, private keys, `.env` values, long logs, full manifests, or
full diffs.
