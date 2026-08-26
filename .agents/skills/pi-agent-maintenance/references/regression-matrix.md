# Maintenance Regression Matrix

Run the smallest rows that cover every changed surface. Run the contract helper
first; add real prompt trials when routing behavior changes.

| Changed surface | Required evidence |
| --- | --- |
| Model-invoked skill description | Concise positive/negative boundary; unique invoke and skip fixtures; fixture validator; representative same-model prompt trials |
| Manual skill | `disable-model-invocation: true`; skill and root README `/skill:<name>` entries; no automatic invocation fixtures |
| Skill README | Present for every active skill; root index links directly to it; links resolve; human-facing use/not-use, evidence/authority, and entry points do not duplicate the full agent contract |
| Skill body/reference | Frontmatter valid; body within context budget; every pointer resolves; completion criteria remain checkable; no duplicated owner |
| Context-window retrospective | Manual `/skill:context-window-retrospective` README entry with no automatic invocation fixtures; active-branch latest-compaction boundary; bounded metadata only; abandoned branch excluded; semantic reviewer verdict counts; no prompt, command output, diff, log, or secret content |
| Developer activity summary | Collector defaults to `Asia/Taipei`, allows an explicit valid IANA timezone override, rejects unknown zones, and keeps local-day boundaries; output contract starts with an action/result/work item rather than a personal pronoun |
| Workspace Makefile façade | Default goal is help; workspace targets delegate exact arguments to `scripts/init-workspace.sh`; `WORKSPACE_ROOT` defaults to the repository parent and supports paths with spaces; direct script CLI remains documented and unchanged |
| Chart upgrade summary script | Fixture output covers Deployment selector/pod labels/affinity/KSA, Service selector/type/ports, PDB availability, HPA, ScaledObject, GSA, config keys, and secret references; missing-chart failure remains explicit |
| Terraform import/state recovery guidance | Distinguish configuration/state/live ownership; exact source and destination addresses; matching import destination; non-destroying removal; explicit root order; saved-plan path and sensitivity; partial-apply fresh plan; lock owner proof; final per-root no-op evidence |
| Supported Terraform repository post-edit validation | Parent or approved worker receives every exact affected root/environment; runs fmt, validation, and an unsaved remote-state plan for each pair; reports add/change/destroy/replace and unexpected drift; stops without retry on authentication or state-lock failure; never applies or mutates state |
| Skill add/remove/rename | README inventory, fixtures, cross-skill pointers, and active references all accounted for |
| `AGENTS.md` | Within context budget; README synchronized; shared rule is always-on; skills-repository main exception covers explicitly requested repository-owned files but excludes sibling/target repos, secrets, generated/git-ignored files, and Git/remote mutation; no skill routing table or domain workflow; `git diff --check` |
| Pi extension | Hook allow/transform-or-block/failure/reset tests; package registration; initializer/install docs; bounded output review |
| Subagent extension | Parent/child authority boundary; no reviewer profile or repository mutation gate, assistant-response overwrite, automatic review follow-up, or worker completion block; profile/tool allowlist; role single/parallel limits; structured timeout/abort/process failure; no paid provider call in unit tests |
| Cross-skill orchestration | `AGENTS.md` companion entry; parent or approved worker owns post-edit validation; changed-path-first validation; domain evidence and stop conditions retained; orchestrator owns routing, prompts, concurrency, authority, and reconciliation; no workflow copied into domain skills |
| Settings/session/model policy | JSON parse; installed-version documentation check; no automatic overwrite path; README adoption instructions |
| Public repository safety | No private company/client identifiers in current paths or text; placeholders use reserved examples; generic scanner passes; machine-local terms are not printed or stored; parent checks proper nouns semantically; history remains a separate publication gate |
| Communication contract | Answer/action-first and teaching-analysis examples remain structured; safety, uncertainty, and technical identifiers are retained |

## Fixed Checks

```bash
python3 .agents/skills/pi-agent-maintenance/scripts/check_public_safety.py
python3 .agents/skills/pi-agent-maintenance/scripts/validate_repo_contract.py
git diff --check
git status --short --untracked-files=all
```

For a chart upgrade summary script or compatibility-field change, also run:

```bash
bash .agents/skills/helm-dependency-upgrade/scripts/tests/render_chart_upgrade_summary_test.sh
```

For a removed surface, use a narrow `rg` over active guidance, skills, package,
config, scripts, and extensions. Historical notes are evidence, not active
routing, and need not be rewritten.

## Paid Model Routing Check

Run after material description or routing changes, not as part of routine unit
tests:

```bash
python3 .agents/skills/pi-agent-maintenance/scripts/run_invocation_benchmark.py \
  --provider <provider> --model <model> --thinking low
```

Grade invocation by the corresponding `SKILL.md` read event. A model merely
printing a skill name is not proof of invocation. Store raw events under `tmp/`
and report model, thinking level, case count, pass rate, tokens, cost, and failed
case IDs.

## Release Gate

A maintenance patch is ready for review only when:

1. Every requested behavior has one source of truth and every caller is current.
2. Positive behavior and nearest negative boundary have deterministic coverage.
3. Tool/context changes preserve errors, identity, recoverability, and bounded
   output, or explicitly document why one property does not apply.
4. Validation output names both passes and gaps.
5. The handoff identifies context, invocation, CI, documentation, and runtime
   risk without claiming untested behavior.
