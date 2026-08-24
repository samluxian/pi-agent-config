#!/usr/bin/env bash
# Compact, read-only preflight for a supported Terraform repository.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <terraform-repository>" >&2
  exit 2
fi

REPO_PATH="$1"

if [[ ! -d "$REPO_PATH/.git" ]]; then
  echo "ERROR: not a git repository: $REPO_PATH" >&2
  exit 1
fi

cd "$REPO_PATH"

echo "== repo =="
printf 'path: '; pwd
printf 'branch: '; git branch --show-current
printf 'status-short:\n'
git status --short --untracked-files=all
printf 'diff-name-status:\n'
git diff --name-status HEAD
printf 'cached-diff-name-status:\n'
git diff --cached --name-status

echo
if [[ -x scripts/list-services.sh || -f scripts/list-services.sh ]]; then
  echo "== services =="
  bash scripts/list-services.sh
else
  echo "WARN: scripts/list-services.sh not found"
fi

echo
if command -v terraform >/dev/null 2>&1; then
  echo "== terraform fmt check =="
  if terraform fmt -check -recursive .; then
    echo "terraform fmt check: OK"
  else
    echo "terraform fmt check: FAILED"
  fi
else
  echo "WARN: terraform not found in PATH"
fi

echo
if [[ -f scripts/detect-changes.sh ]]; then
  echo "== detected changes vs origin/main...HEAD =="
  bash scripts/detect-changes.sh || true
fi
