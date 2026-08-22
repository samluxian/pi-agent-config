#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  implementation_flow.sh [--allow-main] [--chart <chart-path> --release <release> --namespace <namespace> --env <env>] [--changed-path <path>] <repo-path>

Runs the fixed implementation support flow:
- repo preflight
- optional Helm dependency artifact check
- optional values overlay check
- optional Helm render plus compact JSON manifest summary
- optional post-patch review for changed paths

This script is read-only. It does not stage, commit, push, fetch, sync, apply,
restart, retry, or mutate external systems.
USAGE
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
diagnostics_scripts="$(cd "$script_dir/../../gitops-state-diagnostics/scripts" && pwd)"
shared_scripts="$(cd "$script_dir/../../../shared/gitops/scripts" && pwd)"

allow_main=false
repo_path=""
chart_path=""
release=""
namespace=""
env_name=""
changed_paths=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-main)
      allow_main=true
      shift
      ;;
    --chart)
      chart_path="${2:-}"
      shift 2
      ;;
    --release)
      release="${2:-}"
      shift 2
      ;;
    --namespace)
      namespace="${2:-}"
      shift 2
      ;;
    --env)
      env_name="${2:-}"
      shift 2
      ;;
    --changed-path)
      changed_paths+=("${2:-}")
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "ERROR: unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [[ -n "$repo_path" ]]; then
        echo "ERROR: multiple repo paths provided: $repo_path and $1" >&2
        usage
        exit 2
      fi
      repo_path="$1"
      shift
      ;;
  esac
done

if [[ -z "$repo_path" ]]; then
  usage
  exit 2
fi

echo "# GitOps Implementation Flow"
echo
echo "- repo: $repo_path"
echo "- chart: ${chart_path:-not provided}"
echo "- release: ${release:-not provided}"
echo "- namespace: ${namespace:-not provided}"
echo "- env: ${env_name:-not provided}"

echo
echo "## Repo Preflight"
if [[ "$allow_main" == "true" ]]; then
  "$shared_scripts/preflight_repo_check.sh" --allow-main "$repo_path"
else
  "$shared_scripts/preflight_repo_check.sh" "$repo_path"
fi

if [[ -n "$chart_path" ]]; then
  echo
  echo "## Helm Dependency Artifacts"
  "$script_dir/check_helm_dependency_artifacts.sh" "$chart_path"
fi

if [[ -n "$chart_path" && -n "$env_name" ]]; then
  base_values="${chart_path%/}/values.yaml"
  env_values="${chart_path%/}/values.${env_name}.yaml"
  if [[ -f "$base_values" && -f "$env_values" ]]; then
    echo
    echo "## Values Overlay"
    "$script_dir/check_values_overlay.py" --base "$base_values" --env "$env_values"
  else
    echo
    echo "## Values Overlay"
    echo "- skipped: missing $base_values or $env_values"
  fi
fi

if [[ -n "$chart_path" && -n "$release" && -n "$namespace" && -n "$env_name" ]]; then
  manifest_file="$(mktemp)"
  render_stderr_file="$(mktemp)"
  trap 'rm -f "$manifest_file" "$render_stderr_file"' EXIT
  echo
  echo "## Helm Render"
  if ! "$shared_scripts/render_helm_values.sh" "$release" "$chart_path" "$namespace" "$env_name" > "$manifest_file" 2> "$render_stderr_file"; then
    python3 -c 'import json, pathlib, sys; lines=pathlib.Path(sys.argv[1]).read_text().splitlines()[-40:]; print(json.dumps({"schema_version":"gitops-summary/v1","type":"helm_render_summary","result":"fail","findings":[{"level":"fail","check":"helm_render","message":"helm render failed"}],"stderr_tail":lines}, ensure_ascii=False, indent=2, sort_keys=True))' "$render_stderr_file"
    exit 1
  fi
  echo "- result: pass"

  echo
  echo "## Rendered Manifest JSON Summary"
  "$diagnostics_scripts/summarize_manifest_json.py" --manifest "$manifest_file"
fi

if [[ ${#changed_paths[@]} -gt 0 ]]; then
  echo
  echo "## Post-Patch Review"
  "$script_dir/post_patch_review.sh" "$repo_path" "${changed_paths[@]}"
fi
