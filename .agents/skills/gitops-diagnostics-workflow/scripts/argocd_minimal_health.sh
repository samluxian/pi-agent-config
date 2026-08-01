#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  argocd_minimal_health.sh <app> <namespace> [pod-label-selector]

Runs the narrow ArgoCD health route:
- ArgoCD Application sync/health/source summary from the argocd namespace
- pod list in the workload namespace

The default pod selector is app=<app>. This script is read-only and uses kubectl.
USAGE
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 2
fi

app="$1"
namespace="$2"
selector="${3:-app=$app}"

echo "# ArgoCD Minimal Health"
echo
echo "- app: $app"
echo "- namespace: $namespace"
echo "- pod selector: $selector"

echo
echo "## Application"
kubectl -n argocd get application "$app" \
  -o jsonpath='sync={.status.sync.status}{"\n"}health={.status.health.status}{"\n"}phase={.status.operationState.phase}{"\n"}message={.status.operationState.message}{"\n"}revision={.status.sync.revision}{"\n"}path={.spec.source.path}{"\n"}targetRevision={.spec.source.targetRevision}{"\n"}valueFiles={.spec.source.helm.valueFiles}{"\n"}'

echo
echo
echo "## Pods"
kubectl -n "$namespace" get pods -l "$selector" -o wide
