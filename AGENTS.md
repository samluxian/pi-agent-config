# AGENTS.md - DevOps Workspace Contract

This is the canonical, portable workspace contract maintained in the skills
repository. A workspace may expose it and the project-scoped skills from its
root with `AGENTS.md` and `.agents/skills` symlinks. It is a safety and routing
contract, not the full GitOps runbook. Detailed GitOps, Helm, Argo CD,
Kubernetes, GitLab, and GCP procedures live under
`<skills-repo>/.agents/skills/`.

Prioritize correctness, safety, reproducibility, and small reviewable changes.
Do not make risky assumptions about deployment, CI/CD, IAM, or runtime behavior.

## Core Rules

- Read before writing. Inspect existing structure, callers, values, chart
  defaults, templates, CI rules, and reference patterns before changing YAML,
  Helm templates, scripts, pipeline jobs, or workspace guidance.
- Think before editing. For non-trivial work, state the goal, assumptions,
  affected files, success criteria, and verification plan before changing files.
- Ask before widening scope. If a request can touch multiple implementation
  surfaces, or one interpretation would change shared templates, discovery
  logic, CI includes, chart structure, generated resources, credentials/secrets
  wiring, or cross-service behavior, ask one short clarifying question first.
- Prefer the smallest reviewable change that solves the requested problem.
- Make surgical changes only. Do not refactor, reformat, reorder, rename, or
  clean up unrelated files, adjacent services, generated files, or comments.
- Match existing repository conventions, naming, environment separation, and
  file layout even if another style seems cleaner.
- Surface conflicts instead of blending them. If two patterns disagree, call
  out the evidence for each and choose the more recent or consistently used
  pattern only when the task requires a choice.
- Do not invent environment names, namespaces, cluster names, image tags, chart
  versions, release names, service accounts, GCP project IDs, Redis endpoints,
  Pub/Sub topics, subscription names, or branch refs.
- Use deterministic evidence for facts: scripts, CLI output, schemas, renders,
  diffs, tests, and status codes. Use judgment for interpretation, risk, and
  tradeoff analysis.
- Fail loud. Report skipped checks, partial failures, missing tools, missing
  auth, sandbox limits, stale refs, uncertainty, and unverified assumptions.

## Communication Rules

- Lead with the answer, recommended action, or completed result. Remove
  greetings, throat-clearing, repetition, vague claims, empty transitions,
  formulaic recaps, and closing pleasantries. Every retained sentence must add
  meaning, evidence, instruction, risk, or a necessary transition.
- Be concise by default, but do not simplify away technical identifiers,
  commands, uncertainty, safety warnings, or details the user needs to learn or
  act correctly. Task correctness and safety override brevity.
- When the user is learning an unfamiliar topic or the response explains an
  analysis, use short headings and put verified facts, interpretation, and the
  recommendation in a clear order. Define unfamiliar terms on first use.
- Number work with more than one action. Keep each step bounded, cap an action
  list at five items before splitting it into `Do now` and `Later`, and do not
  bury required actions in prose.
- For work spanning turns, state the current step and visible completed result.
  If work remains, end with one concrete next action rather than several
  unranked options. Suppress tangents until the current question is resolved.
- State errors matter-of-factly as evidence or symptom, likely cause, and next
  check or fix. Keep real uncertainty; do not use hedging that adds no meaning.
- When the user has doubts about Git, Kubernetes, Argo CD, GitLab, GCP, or other
  DevOps operations, give one recommended action and the reason: what to do,
  why it is safer, and what risk it avoids.
- For risky or ambiguous operations, prefer a user-operated command over agent
  mutation, and state the expected effect before the command. Give concrete
  time ranges only when useful and supported by named assumptions.

## Operating Boundary

Default to Human-in-the-Loop for GitOps delivery work:

```text
analyze -> propose exact patch, file list, validation, and risk -> wait for explicit approval -> edit
```

Kubernetes, Argo CD, GitLab, GCP, and Git remotes are inspection-only surfaces
for the agent. Do not create, update, delete, restart, retry, approve, merge,
push, tag, branch, rebase, restore, reset, sync, scale, patch, or otherwise
mutate those systems.

Editable delivery scope is limited to repo files that define desired behavior,
such as Helm values, Kustomize overlays, GitOps configuration, and CI pipeline
files. Before editing delivery files:

- Identify the actual target repo and current branch.
- Confirm the branch is separate and non-shared.
- Stop if the branch is `main`, `master`, `release`, or a protected/shared
  branch, and tell the user what branch command to run.
- Do not require a replacement branch solely because an earlier MR for the same
  delivery topic was merged or its remote source branch was deleted. When the
  user explicitly approves reusing that branch, confirm before follow-up edits
  that it remains non-protected and non-shared, its working tree is understood,
  the target ref is current, the prior branch tip is contained in the target,
  and the planned diff is bounded. State that the user's next push will recreate
  the remote branch and require a new MR.
- Present intended files, behavior change, validation commands, and
  deployment/IAM/CI/runtime risk.
- Wait for explicit approval such as `同意修改`, `apply`, or `照你說的改`.

Workspace guidance maintenance is the exception. It is acceptable to edit the
canonical `<skills-repo>/AGENTS.md`, `<skills-repo>/README.md`,
`<skills-repo>/.agents/skills/**`, and `<skills-repo>/docs/session-notes/**` on
the skills repository's `main` branch when the user explicitly asks to
maintain agent guidance, skills, or session notes. Still inspect the skills
repository's git status first, keep the change small, update its `README.md`
when the human-facing workflow or skill inventory changes, and do not commit
or push.

## Workspace Layout

Use these location terms throughout this contract:

- `<workspace-root>` is the directory opened as the working workspace. Its
  `AGENTS.md` and `.agents/skills` may be symlinks into `<skills-repo>`.
- `<skills-repo>` is the checkout that owns this canonical file, `README.md`,
  `.agents/skills/**`, and `docs/session-notes/**`.
- `<target-repo>` is the actual product, service, deployment, chart, or
  infrastructure repository being inspected or changed.

Treat `<skills-repo>` as a portable workspace meta repository, not a product
monorepo. Do not assume its absolute path or the names and locations of sibling
repositories.

- The skills repo owns workspace-level guidance and tooling: `AGENTS.md`,
  `README.md`, `.agents/skills/**`, `docs/session-notes/**`, and related
  workspace documentation.
- Product, service, deployment, chart, and infrastructure repositories may be
  anywhere under or alongside `<workspace-root>`. Each retains its own git
  history, branch, remotes, dirty files, and delivery rules.
- A clean skills-repo or workspace-root `git status` never proves a target repo
  is clean. Run git inspection in `<target-repo>` before editing or declaring
  readiness.
- The skills repo's `main` branch may be edited only for explicit instruction,
  skill, README, or session-note maintenance. This exception never applies to
  target repositories.
- Do not treat target repositories as skills-repo-managed files. Do not stage,
  commit, push, restore, reset, or otherwise mutate them from the skills repo.
- Do not convert target repositories to submodules, subtree-managed folders, or a
  monorepo layout unless the user explicitly requests that repository model
  change and accepts the operational impact.

Common inner repo roles are `k8s-deploy` for desired state, `helm-chart` for
shared charts such as `flex-app`, and application repositories for image build
and downstream deployment handoff. Common environments are `dev`, `qa`, `uat`,
and `prod`.

## Project-Scoped Skills

Use project-scoped skills for repeatable workspace-specific DevOps, GitOps,
Helm, Argo CD, CI/CD, GCP, review, reporting, and handoff workflows.

Skill files live under the skills repository:

```text
<skills-repo>/.agents/skills/<skill-name>/
```

Deterministic helpers used unchanged by multiple skills live under:

```text
<skills-repo>/.agents/shared/<domain>/
```

Standard skill shape:

```text
<skills-repo>/.agents/skills/<skill-name>/
├── SKILL.md
├── agents/openai.yaml
├── references/
├── scripts/
└── assets/
```

- `SKILL.md` is required and must include YAML frontmatter with `name` and
  `description`.
- Keep `SKILL.md` concise as the router and core workflow.
- Put deeper procedures and domain explanations in `references/`.
- Put deterministic repeatable checks in `scripts/`.
- Put byte-identical cross-skill helpers in `.agents/shared/` and keep
  skill-owned orchestration in each skill's `scripts/` directory.
- Put reusable templates in `assets/`.
- Do not create or update global skills for this workspace unless the user
  explicitly asks for a personal cross-project skill.
- Avoid duplicating the same skill in global and project scope. If a global copy
  exists, treat the project-scoped copy as the source of truth for this
  workspace after it is committed and pushed.
- Before deleting or renaming a global skill, verify the project-scoped copy
  exists, is committed, and is pushed, then get explicit user approval.
- When `AGENTS.md` or `.agents/skills/**` changes human-facing workflow, skill
  inventory, trigger boundary, or maintenance rules, update `README.md` unless
  it is already accurate.

## Skill Routing

Pick the narrowest applicable skill and load deeper references only when needed.

| Work intent | Skill |
| --- | --- |
| Change this `devops-pi-agent` repo's skills, Pi extensions, AGENTS/README agent contract, settings baseline, or maintenance regressions | `devops-pi-agent-maintenance` plus `gitops-implementation-workflow` for approved edits |
| Approved desired-state, Helm values, CI handoff, or workspace AGENTS/README/skill/docs edit | `gitops-implementation-workflow` |
| MR descriptions, MR summaries, merge request copy, branch-ready notes, or one/two-sided MR handoff text from repo evidence | `gitops-mr-summary` |
| Authenticated GitLab/GitHub activity summarized by date as concise first-person work updates, including an explicit fallback evidence window | `developer-activity-summary` |
| Existing `k8s-deploy` service wrapper upgrade from one `flex-app` chart version to another, including release-note inputs, current-vs-target chart behavior, live-vs-render selector compatibility, and app-of-apps globals | `flex-app-version-upgrade` plus implementation/diagnostics skill as appropriate |
| Shared `flex-app` chart API/default/KEDA profile/app-of-apps contract maintenance or evidence-based, productized GitLab release-note authoring | `flex-app-chart-maintenance` plus implementation/audit skill as appropriate |
| Read-only check, review, troubleshooting, verification, live health, Workload Identity/GCP prerequisite check, or CI handoff diagnosis | `gitops-diagnostics-workflow` |
| Static desired-state inventory, bootstrap discovery, values consistency, chart metadata, or MR readiness audit without editing | `gitops-repo-audit` |
| Cross-repo service delivery topology, frontend/BFF/backend dependency mapping, hosting vs Kubernetes deployment split, CI/CD handoff, or extraction/monorepo split impact analysis | `service-delivery-topology` |
| Bounded subagent delegation, context hygiene, or evidence-to-implementation handoff | `orchestrator` |
| Beginner-safe Terraform learning, inspection, plan review, or approved small maintenance in a user-identified `tf-services` repository | `tf-services-terraform-maintenance` |
| Runtime incidents across Kubernetes services and environments: transient 5XX/timeout request paths, LB/NEG, Pod/Deployment/HPA/Event/node autoscaling, application startup or deployed source/runtime contract, Lease/worker, ServiceAccount/IAM/WI, Secret Manager references, database, Pub/Sub or queue filter/deadletter, Redis/Valkey/cache, bucket/object storage, or desired-state dependency inventory | `runtime-dependency-ops` |

For broad GitOps requests, classify the intent first and then choose
implementation, diagnostics, or repo-audit. Do not select `gitops-router` for
new work; it is archived under `.agents/archive/gitops-router/`.

Keep evidence layers separate in all GitOps work:

```text
application repo / CI -> k8s-deploy desired state -> shared chart/render ->
Argo CD -> Kubernetes live state -> runtime/GCP evidence
```

Application source code is intent evidence, not deployment truth. When it
conflicts with GitOps desired state, chart behavior, render output, or live
state, surface the conflict before editing. Inspect source for a live incident
only after application-level evidence maps the running image to its deployed
revision; do not substitute the default branch. Report the immediate trigger,
any contributing source-design factor, and the supported fix surface separately.

## Token-Efficient Operation

Prefer narrow inspection commands before broad dumps. Each investigation should
have an evidence budget and a stop condition before running tools.

Default evidence budget:

```text
1. repo branch/status or provided diagnostic packet
2. target desired-state or render summary
3. target live/resource summary
stop unless a concrete mismatch, missing field, error, or readiness claim needs more proof
```

Rules:

- If the user provides a diagnostic packet, analyze only that packet first. Do
  not read repo files or live state unless a required missing fact is named.
- Prefer commands expected to return under 120 lines. If output may exceed 200
  lines, add a resource/path selector, JSON/YAML field filter, summary script,
  `--tail`, `--since`, or a grep filter first.
- Do not print full Helm renders, live manifests, `kubectl diff`, Git diffs,
  GitLab traces, logs, ConfigMaps, Secrets, CRDs, or generated manifests unless
  explicitly requested or required for a named unresolved finding.
- Do not expand from a summary to full `describe`, logs, YAML, trace, or diff
  unless the summary shows a concrete error, missing field, or mismatch.
- Do not cross evidence layers automatically. Move from source to desired
  state, render, Argo CD, live state, runtime logs, or GCP only when the task
  asks for deployment truth/readiness or a concrete conflict needs resolution.
- Keep large raw outputs in files or pipes and consume compact script, `jq`, or
  `yq` summaries. Quote only the minimal safe snippet needed for the answer.
- Use troubleshooting matrices and skill scripts before ad hoc command bundles.

## Git Rules

Before editing a repo, identify the actual target working directory. If it is a
git repository, inspect:

```bash
git branch --show-current
git status --short --untracked-files=all
git diff --name-status HEAD
git diff --cached --name-status
```

If remote freshness matters, do not assume local refs are current. Ask the user
to update refs with:

```bash
git fetch origin
```

When comparing a branch with main after refs are current:

```bash
git diff origin/main...HEAD
```

Rules:

- Do not assume the local branch is up to date.
- Do not revert user changes unless explicitly requested.
- Do not stage, commit, branch, tag, merge, rebase, reset, restore, push, or
  force push as the agent.
- If a Git mutation is required, explain the exact user-operated command and
  impact instead of running it.
- If the user asks for a commit, prepare a concise commit message with a visible
  ticket prefix when available.

## Deployment Safety

- Do not modify secrets, credentials, kubeconfig files, private keys, `.env`
  files, or generated credential files.
- Do not hardcode sensitive values.
- Never print, copy, decode, or expose secret values.
- The local `tmp/` directory is git-ignored for user-controlled temporary
  secret plaintext files. When the user explicitly asks for it, the agent may
  provide commands that output secret values into files under `tmp/`, but the
  agent must not run those commands, read the resulting files, print their
  contents, or include those files in tracked output.
- Do not suggest broad IAM roles such as Owner or Editor. Prefer least
  privilege.
- Do not move sensitive values into ConfigMaps.
- Do not assume Redis, Pub/Sub, OTEL, Secret Manager, Workload Identity, or API
  usage from naming alone. Verify from code, values, render output, live state,
  logs, or control-plane evidence as appropriate.
- Assume GitOps is the deployment authority unless proven otherwise. Prefer:

```text
Git change -> MR -> merge -> Argo CD sync/reconcile
```

Do not run:

```bash
kubectl apply
kubectl delete
kubectl rollout restart
kubectl scale
kubectl patch
helm upgrade
helm uninstall
argocd app sync
argocd app delete
argocd app rollback
argocd app terminate-op
argocd app set
argocd app unset
```

If one of these operations is needed, explain the impact and provide a
user-operated runbook or UI path.

## Validation and Reporting

Run the smallest relevant validation after changes. Validation must prove the
intended behavior, not merely that a command returned output.

Use the bundled skill scripts for fixed checks when they fit, especially:

```bash
<skills-repo>/.agents/skills/gitops-implementation-workflow/scripts/implementation_flow.sh
<skills-repo>/.agents/skills/gitops-diagnostics-workflow/scripts/diagnostics_flow.sh
<skills-repo>/.agents/skills/gitops-repo-audit/scripts/audit_gitops_tree.sh
```

For documentation or workspace guidance changes, prefer:

```bash
git -C <skills-repo> diff --check
git -C <skills-repo> diff -- AGENTS.md README.md .agents/skills
```

For Helm, Kustomize, Argo CD, GitLab, GCP, or Kubernetes evidence, use the
appropriate project-scoped skill and its scripts instead of expanding this root
file into a full runbook.

When reporting back after work, use:

```text
Summary:
- What changed

Validation:
- Command and result

Risk:
- Deployment, IAM, CI, runtime, or documentation risk

Next step:
- What should happen next
```

If no files changed, say so clearly. For branch-ready deployment work, include a
suggested commit message and any validation gaps. When the user asks for MR
description text, use `gitops-mr-summary` instead of keeping MR writing rules in
this root contract.

## Continuous Improvement

When a DevOps/GitOps investigation reveals a reusable lesson, recurring failure
mode, better command pattern, or sharper decision rule, propose exactly one:
update an existing skill, create a new skill, write a session note only, or no
skill change.

Do not edit skills automatically unless the user explicitly asks or approves. If
you propose a skill change, include the triggering lesson, target file or new
skill name, exact suggested wording or patch, why it belongs in a skill, and the
risk of overfitting.

For task completion, pause, handoff, or later resume, record a concise note
under `docs/session-notes/`. Notes must not contain secrets, tokens, kubeconfig
content, private keys, `.env` values, long logs, full manifests, or full diffs.
