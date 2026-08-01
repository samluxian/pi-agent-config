#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  preflight_repo_check.sh [--allow-main] <repo-path>

Runs the fixed read-only Git preflight for a delivery target repo:
- current branch
- short status including untracked files
- worktree diff name/status
- cached diff name/status
- protected/shared branch warning

This script does not fetch, stage, commit, branch, reset, restore, or push.
USAGE
}

allow_main=false

if [[ "${1:-}" == "--allow-main" ]]; then
  allow_main=true
  shift
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

repo_path="$1"

if [[ ! -d "$repo_path" ]]; then
  echo "ERROR: repo path not found: $repo_path" >&2
  exit 1
fi

if ! git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not a git worktree: $repo_path" >&2
  exit 1
fi

branch="$(git -C "$repo_path" branch --show-current)"

echo "# Repo Preflight Check"
echo
echo "- repo: $repo_path"
echo "- branch: ${branch:-DETACHED}"

case "$branch" in
  main|master|release)
    if [[ "$allow_main" == "true" && "$branch" == "main" ]]; then
      echo "- branch gate: allowed by explicit --allow-main"
    else
      echo "- branch gate: BLOCKED, protected/shared branch"
    fi
    ;;
  "")
    echo "- branch gate: BLOCKED, detached HEAD"
    ;;
  *)
    echo "- branch gate: review required, not one of main/master/release"
    ;;
esac

echo
echo "## git status --short --untracked-files=all"
git -C "$repo_path" status --short --untracked-files=all

echo
echo "## git diff --name-status HEAD"
git -C "$repo_path" diff --name-status HEAD

echo
echo "## git diff --cached --name-status"
git -C "$repo_path" diff --cached --name-status
