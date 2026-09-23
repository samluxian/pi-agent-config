# AGENTS.md - DevOps Workspace Contract

Keep workspace work safe, reproducible, and small. Put task-specific procedure in
project skills instead of this always-loaded contract.

## Working Rules

- Before editing, inspect the target files and their closest callers, defaults,
  tests, or defining contracts.
- For a change spanning behavior surfaces or an external contract, state the
  goal, assumptions, affected files, success criteria, and validation first.
- Ask one short scope question if the request requires an unrequested repository,
  surface, or behavior.
- Add complexity only for a stated requirement, existing contract, or repeated
  demonstrated case. Keep the first two similar cases local; extract stable shared
  behavior on the third unless security, compatibility, or platform ownership
  requires it earlier.
- Follow repository conventions. Surface conflicts that affect correctness,
  safety, or scope before choosing a direction.
- Never invent identifiers, versions, endpoints, branches, or credentials.
- Support material claims with bounded evidence from the owning layer. Report
  uncertainty, skipped checks, missing tools, authentication limits, and failures.

## Communication

- Lead with the answer, action, or result. Keep identifiers and warnings precise.
- During active work, state the current step and one next action. Omit process
  narration when the response resolves the request.
- Explain an error as the observed symptom, evidenced cause or labelled
  hypothesis, and next check or fix.
- Run the smallest permitted read-only check that supports a material claim.
  Do not imply that inaccessible evidence was checked.
- Provide runnable commands only when explicitly requested. This never permits a
  prohibited mutation or secret access.
- Treat infrastructure timestamps as timezone-sensitive. State the source zone;
  convert to the user's known zone, or keep UTC explicit and ask.
- For risky DevOps operations, recommend one user-operated action and explain its
  effect and the risk it avoids.

## Approval and Mutation Boundary

Use `analyze -> propose bounded patch and validation -> wait for explicit approval
-> edit`. Approval must be an unambiguous direct user instruction and applies only
to the described scope.

Kubernetes, Argo CD, GitLab/GitHub, GCP, and Git remotes are inspection-only. Use
existing authenticated sessions for bounded discovery. A configured kube context
or gcloud account/project is a non-secret target unless multiple plausible targets
or conflicting evidence require one question. Never mutate, approve, merge, push,
tag, branch, rebase, reset, restore, sync, scale, restart, patch, or delete on these
surfaces. Do not retry a mutation; one bounded retry of an idempotent read is
allowed.

After approval, edit only tracked repository files that directly implement the
approved behavior or documentation. `~/.bashrc` is the sole general exception:
inspect it first, preserve unrelated settings, and never read or alter secrets,
credentials, or other home files.

Repository-specific exceptions:

- **Skills repository:** when explicitly requested, repository-owned source,
  tests, scripts, extensions, config, and docs may be changed on `main`. Excludes
  siblings, targets, secrets, credentials, generated or ignored files, Git
  operations, and remotes. Preserve unrelated changes and update user-facing docs
  when setup, inventory, triggers, or maintenance policy changes.
- **Presentation repository:** after the user names one target and approves direct
  edits, tracked slides, notes, docs, and assets may be changed on its clean
  `main` or `master`. Excludes product, deployment, chart, infrastructure,
  dependency, lock, build/runtime config, generated, ignored, secret, Git, and
  remote surfaces.

## Repository and Workspace Safety

After approval and before editing, recheck the actual target's branch, working
tree, unstaged changes, and staged changes. A clean workspace or skills repository
does not prove a sibling target is clean.

- Outside the exceptions above, do not edit on `main`, `master`, `release`, or a
  branch identified as protected or shared; ask the user to switch branches.
- Never discard, overwrite, stage, commit, restore, or otherwise alter user
  changes unless explicitly requested and permitted.
- Do not assume refs are current. If a decision depends on remote history, a
  release, or deployed state, ask the user to refresh the relevant source.
- Reusing a merged branch requires approval and evidence that it is unprotected,
  unshared, understood, current, contained in the target ref, and has a bounded
  new diff. Explain that its next push recreates the remote branch and needs a new
  MR.
- After repository files change, always include a suggested commit message in the
  final report. Use only lowercase English letters, digits, spaces, and standard
  commit punctuation; add a lowercase ticket prefix only when the request, branch,
  or approved scope supplies one. Never create a commit.

`<workspace-root>` is the opened Pi workspace. `<skills-repo>` owns this contract,
skills, helpers, and documentation. `<target-repo>` is a separate product,
deployment, chart, or infrastructure repository. Siblings keep separate branches,
remotes, histories, and dirty state; combine them only for explicit cross-repo
work.

Write approved specifications and unspecified investigation or incident reports
under `<workspace-root>/docs/`. Write into a target only when the user names that
repository and path.

Use the narrowest matching skill. Keep core flow in `SKILL.md`, detail in
`references/`, repeated checks in `scripts/`, and templates in `assets/`. Route
external web research through the `researcher`; parent sessions do not load the
project web package. Otherwise delegate only when the user or selected skill
requires it, or independent read-only tracks would consume substantial parent
context. The parent retains scope, approval, reconciliation, validation, and
delivery judgment; workers receive exact approved file ownership and never mutate
Git, remotes, infrastructure, cloud, or secrets.

## Evidence, Public Safety, and Secrets

Keep evidence layers separate: `application/CI -> desired state -> chart render ->
Argo CD -> live Kubernetes -> runtime/GCP`. Source proves intent, not deployed
truth. Start with supplied diagnostics and repository status, then desired state or
render, then live/runtime evidence only when the lower layer is insufficient,
conflicts, or cannot support a readiness claim.

When a change depends on third-party control-plane behavior, treat source and
vendor documentation as a hypothesis until a bounded target-system artifact
confirms it. Target evidence wins on conflict. If it is unavailable, label the
direction unproven and request one controlled user-operated check rather than
changing behavior.

Treat the skills repository as public. Never add company/client names, private
infrastructure identifiers, or private target evidence. Use descriptive
placeholders and reserved example domains. Public-safety checks do not sanitize
Git history.

- Never read, decode, print, copy, expose, or modify secrets, credentials, raw
  kubeconfig, private keys, `.env`, or generated credential files. Safe discovery
  reads only selected non-secret fields.
- Never hardcode sensitive values or move them into ConfigMaps.
- Git-ignored `tmp/` may contain user-controlled temporary secret output only when
  explicitly requested; never run or read that output.
- Prefer least-privilege IAM and never suggest broad Owner or Editor roles.
- For demonstrated GitOps ownership, use Git change -> MR -> merge -> Argo CD
  reconcile unless evidence proves another authority path. Never run mutating
  `kubectl`, `helm`, or `argocd`.

## Validation and Reporting

Match validation to behavior and blast radius: docs/comments (`V0`), structured
local config (`V1`), deploy/CI/render behavior (`V2`), or Terraform/IAM/network/
shared APIs/security (`V3`). A domain skill may raise but never lower its mandatory
gate.

Run no post-edit validation when no files changed. After the final edit, run the
smallest deterministic checks that exercise changed behavior. Reuse successful
evidence only while relevant repository and external state remain unchanged, and
prefer one repository-owned helper over several model-directed commands. A passing
command is insufficient if it did not exercise the changed behavior.

After changes, report:

```text
Summary:
- What changed
- Validation result or gap, when applicable
- Material risk or uncertainty, when present
Next step:
- One concrete action when work remains
```

If no files changed, say so. When claiming readiness, include validation gaps.
For a repeated failure or missing guardrail likely to recur, propose exactly one
bounded skill, note, or contract improvement; do not implement it without approval.
Write a concise handoff only when requested or needed for a named recipient, and
exclude secrets, `.env` values, long logs, manifests, and diffs.
