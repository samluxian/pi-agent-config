# AGENTS.md - DevOps Workspace Contract

This repository provides portable workspace guidance. Keep changes safe, correct,
reproducible, and small. Put detailed procedures in project-scoped skills.

## Core Rules

- Read relevant files, callers, defaults, and existing patterns before editing.
- For non-trivial work, state the goal, assumptions, affected files, success
  criteria, and validation plan before changing files.
- Ask one short question before widening ambiguous scope.
- Make the smallest change that solves the request. Do not refactor, reformat,
  rename, reorder, or clean up unrelated content.
- Give shared behavior one owner. Reuse an existing contract or helper instead of
  duplicating rules, parsing, or workflow logic.
- Match repository conventions and surface conflicts instead of blending them.
- Never invent target identifiers, versions, endpoints, branches, or credentials.
- Use deterministic evidence and report uncertainty, skipped checks, missing
  tools, authentication limits, and partial failures.

## Communication

- Lead with the answer, action, or result; keep identifiers and warnings precise.
- Use short headings and numbered steps when they improve navigation.
- During multi-turn work, state the current step and end with one next action.
- Explain errors as symptom, likely cause, and next check or fix.
- Run permitted read-only checks and report their evidence. If access is missing,
  state that limitation rather than implying the environment was checked.
- Provide runnable commands only when explicitly requested. This never permits
  reading secrets, bypassing approval, or performing prohibited mutations.
- Treat infrastructure timestamps as timezone-sensitive. State the source zone
  and convert to the user's known zone; otherwise keep UTC explicit and ask.
- For risky DevOps operations, recommend one user-operated action and explain its
  effect and avoided risk.

## Approval and Mutation Boundary

Default delivery flow is `analyze -> propose bounded patch and validation -> wait
for explicit approval -> edit`. Approval includes `同意修改`, `apply`, or
`照你說的改`, and applies only to the described scope.

Kubernetes, Argo CD, GitLab/GitHub, GCP, and Git remotes are inspection-only.
Use existing authenticated sessions for bounded discovery. A configured kube
context or gcloud account/project may establish non-secret targets; do not ask the
user to repeat them. Never mutate, retry, approve, merge, push, tag, branch,
rebase, reset, restore, sync, scale, restart, patch, or delete on those surfaces.
Describe required user-operated actions; give exact commands only when requested.

Editable delivery scope is limited to repository files that define desired
behavior, including Helm values, Kustomize overlays, GitOps config, and CI files.

Skills-repository maintenance is a narrow exception: when explicitly requested,
repository-owned source, tests, scripts, extensions, config, and documentation
may be created, edited, renamed, or deleted on this repository's `main` branch.
It excludes siblings and targets, secrets, credentials, generated artifacts,
caches, git-ignored temporary files, and every Git or remote mutation. Inspect
status first, preserve unrelated changes, update human-facing docs, and never
commit or push.

Presentation-repository maintenance is a second narrow exception: after the user
names one presentation target and approves direct edits on its current `main` or
`master`, tracked slide source, notes, docs, and assets may be edited there.
Re-inspect and require a clean tree. This excludes every other repository,
product/deployment/chart/infrastructure files, dependencies, lockfiles, build or
runtime config, generated or ignored files, secrets, credentials, and all Git or
remote mutations.

## Repository and Git Safety

After approval and before any branch-safety decision or edit, re-inspect the
actual target's branch, working tree, unstaged changes, and staged changes. Do not
reuse status evidence gathered before approval. A clean workspace or skills repo
does not prove a target repo is clean.

- Outside the two exceptions above, never edit on `main`, `master`, `release`,
  protected, or shared branches; ask the user to switch branches.
- Do not assume refs are current. Ask the user to refresh them when freshness
  matters, and provide the command only when requested.
- Never discard, overwrite, stage, commit, restore, or alter user changes unless
  explicitly requested and permitted.
- Reusing a merged branch requires approval plus proof that it is non-protected
  and non-shared, its tree is understood, the target ref is current, its old tip
  is contained in the target, and the new diff is bounded. Explain that the next
  push recreates the remote branch and needs a new MR.
- If asked for a commit, suggest a concise message with a visible ticket prefix
  when available; do not create the commit.

## Workspace Boundaries

- `<workspace-root>` is the opened workspace; contract paths may symlink to skills.
- `<skills-repo>` owns this contract, skills, helpers, and documentation.
- `<target-repo>` is a product, deployment, chart, or infrastructure repository.

The skills repository is workspace tooling, not a monorepo. Sibling repositories
retain separate branches, remotes, histories, and dirty state; combine them only
when explicitly requested and accepted.

Write specifications and unspecified investigation or incident reports under
`<workspace-root>/docs/`. Do not write a specification into a target unless the
user names that repository and path.

Project skills live in `.agents/skills/<name>/`: core flow in `SKILL.md`, deep
procedure in `references/`, repeatable checks in `scripts/`, templates in
`assets/`, and byte-identical shared helpers in `.agents/shared/`. Use the
narrowest matching skill and do not duplicate its workflow here.

For high-volume or multi-source read-only evidence, and when explicitly requested
or required by a skill, load the orchestrator and delegate bounded tasks. Keep
simple known-path I/O in the parent. Domain skills own evidence and stop
conditions; the orchestrator owns roles, prompts, concurrency, authority, and
reconciliation. The parent retains decisions, approval, validation, and delivery
judgment. Workers require approved exact file ownership and never mutate remotes,
infrastructure, cloud, secrets, or Git.

## Evidence, Public Safety, and Secrets

Keep evidence layers separate: `application/CI -> desired state -> chart render
-> Argo CD -> live Kubernetes -> runtime/GCP`. Source shows intent, not deployment
truth. Surface conflicts before editing. For live incidents, map the running image
to its deployed revision before inspecting source. Separate trigger, contributing
design factor, and supported fix surface.

Use this evidence budget unless a mismatch or readiness claim needs more:

1. Repository branch/status or supplied diagnostics.
2. Target desired-state or render summary.
3. Target live/resource summary.

Analyze supplied diagnostics first. Before external research, run the bounded
`.agents/skills/llm-wiki/scripts/wiki.py find`; read only matches and treat them
as precedent, not current proof. Write `knowledge/` in English under its pinned
No AI Slop contract. Prefer commands under 120 lines. Summarize large renders,
manifests, diffs, traces, logs, ConfigMaps, and CRDs; quote only needed evidence.
Under `pipefail`, avoid early-closing readers or handle expected SIGPIPE.

Treat this skills repository as public. Never add company/client names or private
infrastructure identifiers. Use descriptive placeholders and reserved example
domains. Keep private target evidence in the active investigation. Run the
public-safety checker for maintenance; organization-specific terms belong only
in a machine-local file outside the repository and must never be printed. A clean
snapshot does not sanitize Git history.

Assume GitOps authority unless evidence proves otherwise: Git change -> MR ->
merge -> Argo CD reconcile. Never run mutating `kubectl`, `helm`, or `argocd`.

- Never read, decode, print, copy, expose, or modify secrets, credentials, raw
  kubeconfig, private keys, `.env`, or generated credential files. Safe context
  discovery reads only selected non-secret fields.
- Never hardcode sensitive values or move them into ConfigMaps.
- Git-ignored `tmp/` may hold user-controlled temporary secret output only when
  explicitly requested. Give commands only when requested; never run them or
  read their output.
- Prefer least-privilege IAM; never suggest broad Owner or Editor roles.
- Verify the relevant evidence layer instead of inferring dependencies by name.

## Validation and Reporting

Classify post-edit validation by behavior and blast radius:

- `V0` docs/comments: diff, format, links, or documentation checks.
- `V1` structured local config: parser, schema, and changed-file checks.
- `V2` deploy/CI/Helm/application config: affected render, discovery, pipeline,
  or behavior checks.
- `V3` Terraform/IAM/network/shared chart APIs/ownership/security: every required
  affected-root plan, compatibility check, and policy gate.

A domain skill or adapter may escalate the tier; never weaken its mandatory gate.
Run no post-edit validation when no files changed. During edits, run only checks
needed to unblock work, then run the smallest release-level checks once on the
final state. Reuse successful evidence while repository and relevant external
state are unchanged. Prefer one deterministic repository- or skill-owned helper
over several model-directed commands.

A successful command without behavior evidence is insufficient. After mutations,
the parent or approved worker runs the smallest validation proving final behavior
and reports failures or skipped checks.

After changes, report:

```text
Summary:
- What changed
Validation:
- Check and result
Risk:
- Deployment, IAM, CI, runtime, or documentation risk
Next step:
- One concrete action
```

If no files changed, say so. If repository files changed, include a suggested
commit message. For branch-ready delivery, also report validation gaps.

## Continuous Improvement and Handoff

For a reusable lesson, propose exactly one skill update, new skill, session note,
or no change. Do not edit skills without approval; state the trigger, target,
exact change, value, and overfitting risk. When useful or requested, write a
concise `docs/session-notes/` handoff without secrets, credentials, `.env` values,
long logs, manifests, or diffs.
