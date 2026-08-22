#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  gitops_readiness_check.sh <release> <chart_path> <namespace> <env> [helm args...]

Runs a read-only local GitOps readiness check for a Helm chart:
- required file presence
- helm dependency list
- helm template
- rendered resource summary
- PDB minAvailable/maxUnavailable conflict hint
- ServiceAccount annotation
- Service ports
- HPA min/max

The script writes a concise report to stdout and does not mutate dependencies.
USAGE
}

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
manifest_file="$(mktemp)"
trap 'rm -f "$manifest_file"' EXIT

echo "# GitOps Readiness Check"
echo
echo "- release: ${release}"
echo "- chart path: ${chart_path}"
echo "- namespace: ${namespace}"
echo "- env: ${env_name}"

chart_yaml="${chart_path%/}/Chart.yaml"
chart_lock="${chart_path%/}/Chart.lock"

missing=0
required_paths=(
  "$chart_yaml"
  "$base_values"
  "$env_values"
)

for path in "${required_paths[@]}"; do
  if [[ -f "$path" ]]; then
    echo "- exists: ${path}"
  else
    echo "- MISSING: ${path}"
    missing=1
  fi
done

if [[ -f "$chart_yaml" ]] && grep -qE '^[[:space:]]*dependencies:' "$chart_yaml"; then
  if [[ -f "$chart_lock" ]]; then
    echo "- exists: ${chart_lock}"
  else
    echo "- MISSING: ${chart_lock}"
    missing=1
  fi
else
  echo "- Chart.lock: n/a, no dependencies detected"
fi

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Result: not commit-ready"
  echo "Blocker: required chart or values file is missing."
  exit 1
fi

echo
echo "## Helm Dependency List"
helm dependency list "$chart_path"

echo
echo "## Helm Template"
helm template "$release" "$chart_path" \
  -n "$namespace" \
  -f "$base_values" \
  -f "$env_values" \
  "$@" > "$manifest_file"
echo "- result: pass"

echo
echo "## Rendered Resource Summary"
echo "- note: best-effort summary parsed from Helm YAML output"
awk '
  /^kind: / { kind=$2 }
  /^metadata:/ { in_meta=1; next }
  in_meta && /^  name: / {
    print "- " kind "/" $2
    in_meta=0
  }
' "$manifest_file"

echo
echo "## Focused Checks"
awk '
  /^kind: PodDisruptionBudget/ { in_pdb=1 }
  /^kind: / && $2 != "PodDisruptionBudget" { in_pdb=0 }
  in_pdb && /minAvailable:/ { min=$0 }
  in_pdb && /maxUnavailable:/ { max=$0 }
  END {
    if (min != "" && max != "") {
      print "- WARNING: PDB renders both minAvailable and maxUnavailable"
      print "  " min
      print "  " max
    } else if (min != "" || max != "") {
      print "- PDB availability: " (min != "" ? min : max)
    } else {
      print "- PDB availability: not rendered or not set"
    }
  }
' "$manifest_file"

awk '
  /^kind: ServiceAccount/ { in_sa=1; sa="" }
  /^kind: / && $2 != "ServiceAccount" { in_sa=0 }
  in_sa && /^  name: / { sa=$2 }
  in_sa && /iam.gke.io\/gcp-service-account:/ { print "- ServiceAccount " sa " GSA annotation: " $0 }
' "$manifest_file"

awk '
  /^kind: Service$/ { in_svc=1; svc="" }
  /^kind: / && $2 != "Service" { in_svc=0 }
  in_svc && /^  name: / { svc=$2 }
  in_svc && /targetPort:|port:/ { print "- Service " svc " " $0 }
' "$manifest_file"

awk '
  /^kind: HorizontalPodAutoscaler/ { in_hpa=1; hpa="" }
  /^kind: / && $2 != "HorizontalPodAutoscaler" { in_hpa=0 }
  in_hpa && /^  name: / { hpa=$2 }
  in_hpa && /minReplicas:|maxReplicas:/ { print "- HPA " hpa " " $0 }
' "$manifest_file"
