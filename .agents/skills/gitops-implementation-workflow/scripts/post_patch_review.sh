#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  post_patch_review.sh <repo-path> [changed-path...]

Runs the fixed read-only post-patch review:
- git diff --name-status HEAD
- git diff --cached --name-status
- git diff --check
- git status --short --untracked-files=all
- optional ignored/untracked status for changed paths

This script does not stage, commit, push, reset, restore, or fetch.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

repo_path="$1"
shift
changed_paths=("$@")

if [[ ! -d "$repo_path" ]]; then
  echo "ERROR: repo path not found: $repo_path" >&2
  exit 1
fi

if ! git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not a git worktree: $repo_path" >&2
  exit 1
fi

echo "# Post-Patch Review"
echo
echo "- repo: $repo_path"
echo "- branch: $(git -C "$repo_path" branch --show-current || true)"

echo
echo "## git diff --name-status HEAD"
git -C "$repo_path" diff --name-status HEAD

echo
echo "## git diff --cached --name-status"
git -C "$repo_path" diff --cached --name-status

echo
echo "## git diff --check"
git -C "$repo_path" diff --check

echo
echo "## git status --short --untracked-files=all"
git -C "$repo_path" status --short --untracked-files=all

if [[ ${#changed_paths[@]} -gt 0 ]]; then
  echo
  echo "## git status --short --untracked-files=all --ignored <changed-path...>"
  git -C "$repo_path" status --short --untracked-files=all --ignored -- "${changed_paths[@]}"

  echo
  echo "## git check-ignore <changed-path...>"
  git -C "$repo_path" check-ignore -v "${changed_paths[@]}" || true
fi
