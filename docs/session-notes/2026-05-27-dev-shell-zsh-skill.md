# 2026-05-27 Dev Shell Zsh Skill

## Purpose

- Preserve the reusable zsh / oh-my-zsh / kube-ps1 / autocomplete setup as a
  project-scoped skill for `/home/samlu/repos`.

## Current Status

- Status: skill added locally, not committed or pushed.
- Working directory: `/home/samlu/repos`.
- Branch: `main`.

## Completed

- Added `dev-shell-zsh-setup` skill for local shell setup and troubleshooting.
- Documented official oh-my-zsh `kube-ps1` plugin usage.
- Captured the workspace-specific context shortening rule from long GKE context
  names to `newaile-dev`, `newaile-qa`, `newaile-uat`, and `newaile-prod`.
- Updated README skill inventory and description.

## Changed Files

- `.agents/skills/dev-shell-zsh-setup/SKILL.md`
- `.agents/skills/dev-shell-zsh-setup/references/troubleshooting.md`
- `.agents/skills/dev-shell-zsh-setup/agents/openai.yaml`
- `README.md`
- `docs/session-notes/2026-05-27-dev-shell-zsh-skill.md`

## Verification

- `git branch --show-current`: `main`.
- `git status --short --untracked-files=all`: shows README modified and the
  new skill/session note files untracked.
- `git diff --check`: passed.
- `wc -l .agents/skills/dev-shell-zsh-setup/SKILL.md`: 100 lines.

## Next Steps

- Review the new skill wording and commit if acceptable.

## Risks And Notes

- No shell config files were changed by this skill creation step.
- The skill intentionally treats kube prompt context as a shell hint, not as
  deployment or GCP proof.

## Suggested Skills

- `dev-shell-zsh-setup`
- `session-memory`
