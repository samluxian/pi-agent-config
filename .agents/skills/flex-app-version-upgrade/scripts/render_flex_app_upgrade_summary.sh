#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  render_flex_app_upgrade_summary.sh <release> <chart-path> [helm template args...]

Renders one effective chart input set and prints only Deployment, Service, PDB,
ServiceAccount, ConfigMap, and ExternalSecret fields useful for an upgrade diff.
Pass values files, namespace, and injected globals after <chart-path>.
USAGE
}

if [[ $# -lt 2 ]]; then
  usage
  exit 2
fi

release="$1"
chart="$2"
shift 2

if [[ ! -d "$chart" ]]; then
  echo "ERROR: chart path not found: $chart" >&2
  exit 1
fi

for command in helm yq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: $command not found" >&2
    exit 1
  fi
done

out="$(mktemp /tmp/flex-app-upgrade-render.XXXXXX.yaml)"
trap 'rm -f "$out"' EXIT

if ! helm template "$release" "$chart" "$@" >"$out"; then
  echo "RENDER_ERROR $release" >&2
  exit 1
fi

yq -r '
  select(.kind == "Deployment") |
  "deployment " + .metadata.name + " selector=" + (.spec.selector.matchLabels | tojson)
' "$out"
yq -r '
  select(.kind == "Service") |
  "service " + .metadata.name + " selector=" + (.spec.selector | tojson)
' "$out"
yq -r '
  select(.kind == "PodDisruptionBudget") |
  "pdb " + .metadata.name + " selector=" + (.spec.selector.matchLabels | tojson)
' "$out"
yq -r '
  select(.kind == "ServiceAccount") |
  "serviceAccount " + .metadata.name + " gsa=" + (.metadata.annotations."iam.gke.io/gcp-service-account" // "")
' "$out"
yq -r '
  select(.kind == "ConfigMap") |
  "configMap " + .metadata.name + " keys=" + (.data | keys | join(","))
' "$out"
yq -r '
  select(.kind == "ExternalSecret") |
  .metadata.name as $name |
  .spec.data[]? |
  "externalSecret " + $name + " " + .secretKey + " -> " + .remoteRef.key
' "$out"
