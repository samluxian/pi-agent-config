#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  render_flex_app_upgrade_summary.sh <release> <chart-path> [helm template args...]

Renders one effective chart input set and prints bounded spec fields for an
upgrade diff. The summary covers workload selectors, affinity, KSA/GSA, Services,
PDB availability, HPA, ScaledObject, ConfigMap, and ExternalSecret references.
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
  "deployment " + .metadata.name +
  " replicas=" + ((.spec.replicas // "") | tostring) +
  " selector=" + ((.spec.selector.matchLabels // {}) | tojson) +
  " podLabels=" + ((.spec.template.metadata.labels // {}) | tojson) +
  " serviceAccount=" + (.spec.template.spec.serviceAccountName // "") +
  " affinity=" + ((.spec.template.spec.affinity // {}) | tojson)
' "$out"
yq -r '
  select(.kind == "Service") |
  "service " + .metadata.name +
  " type=" + (.spec.type // "ClusterIP") +
  " selector=" + ((.spec.selector // {}) | tojson) +
  " ports=" + ((.spec.ports // []) | tojson)
' "$out"
yq -r '
  select(.kind == "PodDisruptionBudget") |
  "pdb " + .metadata.name +
  " selector=" + ((.spec.selector.matchLabels // {}) | tojson) +
  " minAvailable=" + ((.spec.minAvailable // "") | tostring) +
  " maxUnavailable=" + ((.spec.maxUnavailable // "") | tostring)
' "$out"
yq -r '
  select(.kind == "HorizontalPodAutoscaler") |
  "hpa " + .metadata.name +
  " target=" + (.spec.scaleTargetRef.kind // "") + "/" + (.spec.scaleTargetRef.name // "") +
  " min=" + ((.spec.minReplicas // "") | tostring) +
  " max=" + ((.spec.maxReplicas // "") | tostring) +
  " metrics=" + ((.spec.metrics // []) | tojson)
' "$out"
yq -r '
  select(.kind == "ScaledObject") |
  "scaledObject " + .metadata.name +
  " target=" + (.spec.scaleTargetRef.kind // "Deployment") + "/" + (.spec.scaleTargetRef.name // "") +
  " min=" + ((.spec.minReplicaCount // "") | tostring) +
  " max=" + ((.spec.maxReplicaCount // "") | tostring) +
  " polling=" + ((.spec.pollingInterval // "") | tostring) +
  " cooldown=" + ((.spec.cooldownPeriod // "") | tostring) +
  " triggers=" + ((.spec.triggers // []) | tojson)
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
