#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  check_helm_dependency_artifacts.sh <chart-path>

Checks Helm dependency readiness and generated artifact visibility:
- Chart.yaml apiVersion and dependency declaration
- helm dependency list
- Chart.lock or requirements.lock presence
- charts/*.tgz package presence
- git status including ignored files under the chart path
- git check-ignore for generated dependency artifacts

This script is read-only. It does not run helm dependency build/update.
USAGE
}

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

chart_path="${1%/}"
chart_yaml="$chart_path/Chart.yaml"

if [[ ! -d "$chart_path" ]]; then
  echo "ERROR: chart path not found: $chart_path" >&2
  exit 1
fi

if [[ ! -f "$chart_yaml" ]]; then
  echo "ERROR: Chart.yaml not found: $chart_yaml" >&2
  exit 1
fi

echo "# Helm Dependency Artifact Check"
echo
echo "- chart path: $chart_path"
echo "- Chart.yaml: $chart_yaml"

api_version="$(awk -F': *' '$1 == "apiVersion" { print $2; exit }' "$chart_yaml")"
if grep -qE '^[[:space:]]*dependencies:' "$chart_yaml"; then
  has_dependencies="yes"
else
  has_dependencies="no"
fi

echo "- apiVersion: ${api_version:-unknown}"
echo "- dependencies declared: $has_dependencies"

echo
echo "## helm dependency list"
helm dependency list "$chart_path"

echo
echo "## Lock Files"
for path in "$chart_path/Chart.lock" "$chart_path/requirements.lock"; do
  if [[ -f "$path" ]]; then
    echo "- exists: $path"
  else
    echo "- missing: $path"
  fi
done

echo
echo "## Dependency Packages"
shopt -s nullglob
packages=("$chart_path"/charts/*.tgz)
shopt -u nullglob
if [[ ${#packages[@]} -eq 0 ]]; then
  echo "- no charts/*.tgz packages found"
else
  for package in "${packages[@]}"; do
    echo "- package: $package"
  done
fi

echo
echo "## git status --short --untracked-files=all --ignored"
if git -C "$chart_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$chart_path" status --short --untracked-files=all --ignored -- .
else
  echo "- skipped: chart path is not inside a git worktree"
fi

echo
echo "## git check-ignore"
if git -C "$chart_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  candidates=(
    "$chart_path/Chart.lock"
    "$chart_path/requirements.lock"
  )
  if [[ ${#packages[@]} -gt 0 ]]; then
    candidates+=("${packages[@]}")
  else
    candidates+=("$chart_path/charts/*.tgz")
  fi
  git check-ignore -v "${candidates[@]}" || true
else
  echo "- skipped: chart path is not inside a git worktree"
fi

echo
echo "## Result Hints"
if [[ "$has_dependencies" == "yes" ]]; then
  if [[ "$api_version" == "v2" && ! -f "$chart_path/Chart.lock" ]]; then
    echo "- BLOCKER: v2 chart with dependencies is missing Chart.lock"
  elif [[ "$api_version" == "v1" && ! -f "$chart_path/requirements.lock" && ! -f "$chart_path/Chart.lock" ]]; then
    echo "- REVIEW: legacy v1 chart with dependencies has no lock file"
  else
    echo "- dependency lock file: present or not required by detected chart shape"
  fi
else
  echo "- no dependencies declared in Chart.yaml"
fi
