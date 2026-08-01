# Skill Design Contract

Read this reference before creating, changing, splitting, merging, or removing a
skill in `devops-pi-agent`. The target is **predictability**: the agent follows
the same process on repeated runs even when the answer differs.

## Invocation Contract

- First decide whether autonomous reach is necessary. A model-invoked skill pays
  permanent context load because its description is present every turn. A
  user-invoked skill sets `disable-model-invocation: true` and instead asks the
  user to remember it.
- Use model invocation only for a distinct work object the agent must recognize
  itself or another model-invoked skill must reach. If many user-invoked skills
  become hard to remember, prefer one user-operated index rather than exposing
  all of them to the model.
- A model-invoked description front-loads its concrete action/object, one
  positive trigger per real branch, and the nearest negative boundary. Do not
  list broad technology categories or synonyms that restate one branch.
- Reuse a compact, established leading concept when it sharpens both invocation
  and execution. Do not coin vocabulary that costs more explanation than it
  saves.

## Information Hierarchy

1. Keep ordered actions required by every run in `SKILL.md`. End every action
   with a checkable completion criterion; demand enough evidence to prevent
   thin investigation or premature completion.
2. Keep only universally needed rules beside those actions. Co-locate each
   concept with its constraints and caveats instead of scattering them.
3. Move branch-only facts, matrices, examples, and long procedures into a named
   reference. The context pointer must state exactly when to read it; a file
   hidden behind a vague pointer is a behavior bug.

Review a `SKILL.md` above roughly 120 lines for progressive disclosure. The line
count is a review trigger, not a reason to delete required behavior. Split a
skill only when a branch needs independent invocation or when later visible
steps repeatedly pull the agent into premature completion and a sharper
completion criterion is insufficient.

## Pruning Contract

- Keep each meaning in one source of truth. Point to the owner instead of
  paraphrasing it in AGENTS, another skill, README, and an extension.
- Delete duplication, stale sediment, and lines that no longer affect the skill.
- Apply the no-op test sentence by sentence: if removing a sentence would not
  change model behavior, remove it rather than polishing it.
- Keep a rule only while it remains relevant to the skill's actual trigger and
  output. Do not preserve historical behavior in active routing; session notes
  can retain truthful history.

## Regression Contract

- Every model-invoked skill has unique invoke and skip fixtures. The skip case
  should represent its nearest competing skill or an explicitly excluded task.
- Structural fixture validation proves coverage shape only. Run representative
  prompts with the same model/settings when a description or routing boundary
  materially changes.
- UI metadata, README inventory, AGENTS routing, cross-skill pointers, and
  deterministic scripts must agree with the skill directory and frontmatter.
  Keep provider/model selection out of skill instructions; skills own process
  and evidence requirements, while session settings or explicit subagent
  profiles own model choice.
- A removal includes the complete skill directory, routing and inventory text,
  fixtures, metadata references, and active pointers. A rename proves both the
  new path and absence of the old active name.

A skill change is complete only when its owning process is singular, every
branch has the required context, positive and negative behavior are covered,
and no active caller points to stale content.
