---
name: gitops-mr-summary
description: "Write evidence-based MR descriptions, MR summaries, branch-ready notes, or multi-repo handoff text for DevOps/GitOps changes. Use only when the requested output is MR copy. Do not use to implement, audit, review, or troubleshoot the change itself."
---

# GitOps MR Summary

## Steps

1. Inspect every target repo's branch, working tree, staged changes, and recent
   commits:

   ```bash
   git branch --show-current
   git status --short --untracked-files=all
   git diff --name-status HEAD
   git diff --cached --name-status
   git log --oneline --decorate -5
   ```

   Complete when every repo used by the MR copy has a named branch and evidence
   for its uncommitted and recent committed changes.

2. Compare the branch with its target independently of working-tree state:

   ```bash
   git diff --name-status origin/main...HEAD
   git diff --stat origin/main...HEAD
   ```

   Use this when `origin/main` is current enough; otherwise report the stale or
   missing ref. If the branch was already merged or pushed and comparison is
   unavailable, use supplied MR evidence and recent commits, naming the gap.
   Complete when every material committed, staged, and unstaged change is
   accounted for, or the exact unavailable evidence is reported.

3. Write only what the evidence shows.

## Output Contract

- Default to Traditional Chinese when the user writes in Chinese.
- Output only `## 修改內容` followed by one to three single-sentence bullets.
- Order bullets by `新增`、`修改`、`刪除`; omit categories with no changes.
- Lead with the direct behavior change: say what setting or resource moved, changed, or was removed, and name the control relationship that changed when evidence supports it.
- Prefer plain wording such as `將 <setting> 移至 <path>，使其不再受 <switch> 控制` over an implementation-heavy chain of generated resources.
- Use specialized terms only when they are needed to identify the changed field or resource. If a term is not self-explanatory, add its purpose in the same sentence; do not stack terms such as `remoteRef`、`ExternalSecret`、`secretRef` without explaining the resulting behavior.
- Keep paths and identifiers verbatim, but pair them with the immediate behavior they control. Do not add motivation, benefits, broad background, implementation narrative, or next steps.
- Remove greetings, filler, vague intensifiers, empty transitions, canned contrasts, recaps, and closing offers. Keep a caveat only when it communicates real evidence limits or risk.
- Add validation, risk, or other sections only when the user explicitly requests them.
- For multiple repos, label each repo and apply the same one-to-three-bullet limit per repo.
- Never claim live-system changes without evidence.

Report missing implementation or validation outside the MR copy; do not edit files from this skill.
