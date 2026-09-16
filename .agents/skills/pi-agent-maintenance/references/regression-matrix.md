# Maintenance Regression Matrix

Run the smallest rows that cover every changed surface. Run the contract helper
first; add real prompt trials when routing behavior changes.

| Changed surface | Required evidence |
| --- | --- |
| Model-invoked skill description | Agent Skills metadata passes; description states what/when; representative prompts only for a material routing change or known collision |
| Manual skill | Pi-specific invocation setting and any human-facing `/skill:<name>` entry remain intentional; no fixed fixture requirement |
| LLM wiki | `npm run test:wiki`; finder reads indexes only, selects one topic, returns at most five metadata matches, and handles aliases/no-match; checker covers index limits, frontmatter, source permalinks, English-only content, bounded No AI Slop wording, synthetic-case safety, verified-incident evidence, and broken links; human review covers source meaning and re-identification risk |
| Skill README | When human setup, inventory, or manual usage changed, links resolve and prose does not duplicate the full agent contract; README presence is not a loadability gate |
| Skill body/reference | Metadata hard checks pass; 500-line and estimated 5,000-token findings remain nonblocking; completion criteria remain checkable; no duplicated owner or complete workspace report skeleton |
| Context-window retrospective | Manual invocation remains intentional; active-branch latest-compaction boundary; bounded metadata only; abandoned branch excluded; semantic reviewer verdict counts; structured subagent outcomes distinguish completed, parent/user abort, timeout, process failure, and unknown without returning error text; initiative follow-up signals remain review candidates rather than proof; necessary approval, authentication, scope, secret, and mutation stops are excluded; no prompt, command output, diff, log, or secret content; product/delivery/infrastructure/cloud/runtime findings remain task outcomes or gaps; knowledge internalization selects one owning harness surface and estimates future work avoided; optimization actions and next steps target only Pi agent harness surfaces; a supported target-system issue is generalized to its harness owner or yields no optimization item |
| Application CI delivery | Jib and rootless BuildKit adapters preserve existing environment paths; runner identity, registry, DAG, fleet, and build context remain explicit; platform/IAM provisioning stays outside the skill; third demonstrated same-layout case can use the bounded fast path; public examples contain no private identifiers or credentials |
| Developer activity summary | Collector defaults to `Asia/Taipei`, allows an explicit valid IANA timezone override, rejects unknown zones, and keeps local-day boundaries; output contract starts with an action/result/work item rather than a personal pronoun |
| Workspace Makefile façade | Default goal is help; workspace targets delegate exact arguments to `scripts/init-workspace.sh`; `WORKSPACE_ROOT` defaults to the repository parent and supports paths with spaces; direct script CLI remains documented and unchanged |
| Chart upgrade summary script | Fixture output covers Deployment selector/pod labels/affinity/KSA, Service selector/type/ports, PDB availability, HPA, ScaledObject, GSA, config keys, and secret references; missing-chart failure remains explicit |
| Terraform import/state recovery guidance | Distinguish configuration/state/live ownership; exact source and destination addresses; matching import destination; non-destroying removal; explicit root order; saved-plan path and sensitivity; partial-apply fresh plan; lock owner proof; final per-root no-op evidence |
| Supported Terraform repository post-edit validation | Parent or approved worker receives every exact affected root/environment; runs fmt, validation, and an unsaved remote-state plan for each pair; reports add/change/destroy/replace and unexpected drift; stops without retry on authentication or state-lock failure; never applies or mutates state |
| Skill add/remove/rename | Agent Skills metadata and active pointers are current; external skills retain upstream content; public safety remains separate |
| Contract validator implementation | `npm run test:contract-unit`; current-repository run; plain/quoted/folded/literal metadata; boundary/type errors; nonblocking size/focus signals; deterministic bounded output |
| `AGENTS.md` | At most 200 lines without dense prose; bytes/tokens decrease; approval, mutation, Git, secret, public-safety, evidence, and validation semantics remain intact; no skill routing table or domain workflow; `git diff --check` |
| Context Pipeline | Recognized complete results reduce only when smaller; direct and native-truncated input; safe error-path recovery; test pass/failure schemas; redaction; image/details preservation; explicit completeness and omitted counts; malformed/unsafe/nonzero processor failures fail open |
| Pi extension | Hook allow/transform-or-block/failure/reset tests; package registration; initializer/install docs; bounded output review |
| Subagent extension | Parent/child authority boundary; no completion gate; profile/tool allowlist; role/concurrency/timeouts; child and aggregate output bytes/lines, redaction, head/tail evidence, and completeness metadata; no paid provider call in unit tests |
| Cross-skill orchestration | `AGENTS.md` companion entry; parent or approved worker owns post-edit validation; changed-path-first validation; domain evidence and stop conditions retained; orchestrator owns routing, prompts, concurrency, authority, and reconciliation; no workflow copied into domain skills |
| Settings/session/model policy | JSON parse; installed-version documentation check; low default thinking; visible cache-miss notices; no automatic overwrite path; README adoption instructions |
| Validation efficiency | V0–V3 behavior/risk tiers; domain gates can only escalate; no post-edit checks without edits; one final-state release check; unchanged successful evidence is reused; bounded deterministic helper preferred |
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
