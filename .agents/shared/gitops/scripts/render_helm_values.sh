#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  render_helm_values.sh [--dependency-build] <release> <chart_path> <namespace> <env> [helm args...]

Renders a Helm chart with values.yaml plus values.<env>.yaml.
The script is read-only by default and writes the rendered manifest to stdout.
Use --dependency-build only when modifying the local charts/ dependency state is acceptable.
USAGE
}

dependency_build=false
if [[ "${1:-}" == "--dependency-build" ]]; then
  dependency_build=true
  shift
fi

if [[ $# -lt 4 ]]; then
  usage
  exit 2
fi

release="$1"
chart_path="$2"
namespace="$3"
env_name="$4"
shift 4

base_values="${chart_path%/}/values.yaml"
env_values="${chart_path%/}/values.${env_name}.yaml"

if [[ ! -d "$chart_path" ]]; then
  echo "ERROR: chart path not found: $chart_path" >&2
  exit 1
fi

if [[ ! -f "$base_values" ]]; then
  echo "ERROR: base values not found: $base_values" >&2
  exit 1
fi

if [[ ! -f "$env_values" ]]; then
  echo "ERROR: env values not found: $env_values" >&2
  exit 1
fi

if [[ -f "${chart_path%/}/Chart.yaml" ]]; then
  if [[ "$dependency_build" == "true" ]]; then
    helm dependency build "$chart_path" >&2
  else
    helm dependency list "$chart_path" >&2
  fi
fi

helm template "$release" "$chart_path" \
  -n "$namespace" \
  -f "$base_values" \
  -f "$env_values" \
  "$@"
