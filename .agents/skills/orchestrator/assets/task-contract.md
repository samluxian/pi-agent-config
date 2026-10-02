# Subagent Task Contract

Use this brief inside the `task` string. Fill only relevant fields. For a small
lookup, combine fields into a few sentences. Headings are guidance, not a schema
or dispatch gate. Do not create a separate spec or repeat approval for this brief.
Never include secrets or assume the child has the parent conversation.

```text
GOAL
- What question must this child answer, or what approved change must it deliver?

CONTEXT
- Relevant user requirement, verified facts, and unresolved questions.
- Separate facts from hypotheses. Include necessary source paths or identifiers.

SCOPE
- Exact repository/cwd, files or safely discovered targets to inspect.
- For worker: exact owned files, approved behavior, and approval already received.
- What is out of scope?

CONSTRAINTS
- Allowed operations and authority boundaries; no secrets or remote mutations.
- Stop and report before expanding scope or making an unsafe assumption.
- If one source is unavailable, finish independent permitted checks and report
  the gap. Do not invent evidence or treat every missing detail as a total blocker.

APPROACH
- Suggested searches, sources, callers/defaults/tests, or validation to inspect.
- Adapt within scope when another permitted check is more useful.

ACCEPTANCE
- Observable questions answered or behavior checked.
- Required validation and nearest negative boundary, when applicable.
- Mark each criterion met, unmet, or unverified; do not equate execution with success.

RETURN
- Result: answer first, with findings tied to acceptance criteria.
- Evidence: exact paths and line ranges, source URLs, or selected target artifacts.
- Changes and validation: owned files changed, checks and outcomes, if applicable.
- Gaps and risks: unavailable sources, unsupported claims, conflicts, blockers.
- Next action: one bounded check/action if work remains, otherwise none.
- Summarize evidence rather than dumping raw logs. Do not omit material findings
  merely to fit an arbitrary token or line quota. Retain a role-specific format
  when it already covers the requested return fields.
```

The parent checks the evidence, resolves conflicts, verifies changed behavior,
and decides final delivery. A completed child process is not proof of acceptance.
Read extension error feedback even when the child reports success. Separate
input/task, environment/provider, and extension causes before proposing a repair.
Existing user authorization for subagent extension maintenance covers in-scope
local fixes without repeated approval; feedback itself grants no authority.
Validate and report a repair. Never create an automatic repair loop.
