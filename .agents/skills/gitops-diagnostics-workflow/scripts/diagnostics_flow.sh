#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  diagnostics_flow.sh repo <repo-path>
  diagnostics_flow.sh helm <release> <chart-path> <namespace> <env> [helm args...]
  diagnostics_flow.sh helm-json <release> <chart-path> <namespace> <env> [helm args...]
  diagnostics_flow.sh manifest-json <manifest-path>
  diagnostics_flow.sh diff-json [kubectl-diff-output-path]
  diagnostics_flow.sh gitlab-pipeline <project-path> <pipeline-id>
  diagnostics_flow.sh argocd <app> <namespace> [pod-label-selector]
  diagnostics_flow.sh wi --project <project> --namespace <ns> --ksa <ksa> --gsa <gsa> [options]

Runs fixed read-only diagnostics by delegating to this skill's scripts. It does
not edit files or mutate Kubernetes, ArgoCD, GitLab, GCP, or Git remotes.
JSON modes intentionally suppress raw manifests and long diffs.
USAGE
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
shared_scripts="$(cd "$script_dir/../../../shared/gitops/scripts" && pwd)"

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

mode="$1"
shift

case "$mode" in
  repo)
    if [[ $# -ne 1 ]]; then
      usage
      exit 2
    fi
    "$shared_scripts/preflight_repo_check.sh" "$1"
    ;;
  helm)
    if [[ $# -lt 4 ]]; then
      usage
      exit 2
    fi
    "$script_dir/gitops_readiness_check.sh" "$@"
    ;;
  helm-json)
    if [[ $# -lt 4 ]]; then
      usage
      exit 2
    fi
    manifest_file="$(mktemp)"
    stderr_file="$(mktemp)"
    trap 'rm -f "$manifest_file" "$stderr_file"' EXIT
    if ! "$shared_scripts/render_helm_values.sh" "$@" > "$manifest_file" 2> "$stderr_file"; then
      python3 -c 'import json, pathlib, sys; lines=pathlib.Path(sys.argv[1]).read_text().splitlines()[-40:]; print(json.dumps({"schema_version":"gitops-summary/v1","type":"helm_render_summary","result":"fail","findings":[{"level":"fail","check":"helm_render","message":"helm render failed"}],"stderr_tail":lines}, ensure_ascii=False, indent=2, sort_keys=True))' "$stderr_file"
      exit 1
    fi
    "$script_dir/summarize_manifest_json.py" --manifest "$manifest_file"
    ;;
  manifest-json)
    if [[ $# -ne 1 ]]; then
      usage
      exit 2
    fi
    "$script_dir/summarize_manifest_json.py" --manifest "$1"
    ;;
  diff-json)
    if [[ $# -gt 1 ]]; then
      usage
      exit 2
    fi
    "$script_dir/summarize_kubectl_diff_json.py" ${1:+--diff "$1"}
    ;;
  gitlab-pipeline)
    if [[ $# -ne 2 ]]; then
      usage
      exit 2
    fi
    "$script_dir/summarize_gitlab_pipeline.sh" "$1" "$2"
    ;;
  argocd)
    if [[ $# -lt 2 || $# -gt 3 ]]; then
      usage
      exit 2
    fi
    "$script_dir/argocd_minimal_health.sh" "$@"
    ;;
  wi)
    "$script_dir/check_gcp_wi_prereqs.sh" "$@"
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "ERROR: unknown mode: $mode" >&2
    usage
    exit 2
    ;;
esac
