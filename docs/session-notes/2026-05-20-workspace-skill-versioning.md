# 2026-05-20 Workspace Skill Versioning

## Purpose

- Make `/home/samlu/repos` a versioned workspace for agent instructions and project-scoped skills.

## Current Status

- Status: in progress; core repo setup and GitOps skill migration are done, documentation and session-memory workflow are being added.
- Working directory: `/home/samlu/repos`
- Branch: `main`

## Completed

- Initialized `/home/samlu/repos` as a Git repo connected to `https://gitlab.com/sam.lu/skills.git`.
- Pushed commit `bca300e` with `AGENTS.md`, `.gitignore`, and `.agents/skills/gitops-delivery-workflow/**`.
- Moved nested service repos under `workspace-repos/` and simplified `.gitignore` to ignore that folder.
- Rewrote `README.md` in Chinese as a DevOps/GitOps maintenance guide.
- Updated `AGENTS.md` with Core Agent Rules and Project-Scoped Skill Rules.
- Deleted the old global GitOps skill at `/home/samlu/.codex/skills/gitops-delivery-workflow` after confirming the project-scoped copy exists.

## Changed Files

- `AGENTS.md`
- `README.md`
- `.agents/skills/session-memory/SKILL.md`
- `.agents/skills/session-memory/agents/openai.yaml`
- `.agents/skills/session-memory/assets/session-note-template.md`
- `docs/session-notes/2026-05-20-workspace-skill-versioning.md`

## Verification

- `git diff --check` passed after adding the session-memory skill and this note.
- `git status --short --untracked-files=all` showed only expected changes: `AGENTS.md`, `README.md`, `.agents/skills/session-memory/**`, and this note.
- Project-scoped GitOps skill still exists at `.agents/skills/gitops-delivery-workflow/SKILL.md`.
- Global GitOps skill removal was verified with `test ! -e /home/samlu/.codex/skills/gitops-delivery-workflow`.

## Next Steps

- Review the new `session-memory` workflow and adjust wording if needed.
- Commit and push the pending documentation and skill changes when ready.
- Use `session-memory` at future task completion, phase pause, or session handoff points.

## Risks And Notes

- `AGENTS.md`, `README.md`, and the new `session-memory` files may still be uncommitted in the current worktree.
- `workspace-repos/` is intentionally ignored by this repo; each nested service repo keeps its own Git history and branch state.
- Do not recreate workspace-specific skills in global scope unless explicitly requested.

## Suggested Skills

- `session-memory`
- `gitops-delivery-workflow`
