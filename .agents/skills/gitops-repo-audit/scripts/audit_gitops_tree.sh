#!/usr/bin/env bash
set -euo pipefail

root="${1:-.}"

if [ ! -d "$root" ]; then
  echo "error: not a directory: $root" >&2
  exit 2
fi

cd "$root"

echo "== git =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf "branch: "
  git branch --show-current || true
  git status --short --untracked-files=all
else
  echo "not a git repository"
fi

echo
echo "== enabled env values =="
find . -type f \( \
  -name 'values.dev.yaml' -o \
  -name 'values.qa.yaml' -o \
  -name 'values.uat.yaml' -o \
  -name 'values.prod.yaml' \
\) | sort

echo
echo "== ignored env values =="
find . -type f \( \
  -name 'values.ignore.dev.yaml' -o \
  -name 'values.ignore.qa.yaml' -o \
  -name 'values.ignore.uat.yaml' -o \
  -name 'values.ignore.prod.yaml' \
\) | sort

echo
echo "== chart metadata =="
find . -type f \( -name 'Chart.yaml' -o -name 'Chart.lock' \) | sort

echo
echo "== bootstrap hints =="
if [ -d bootstrap ]; then
  find bootstrap -type f \( -name '*.yaml' -o -name '*.yml' \) | sort
else
  echo "no bootstrap directory"
fi

echo
echo "== ci handoff hints =="
find . -path './.git/*' -prune -o -type f \( \
  -name '.gitlab-ci.yml' -o \
  -path './.gitlab/ci/*.yml' -o \
  -path './.gitlab/ci/*.yaml' \
\) -print | sort
