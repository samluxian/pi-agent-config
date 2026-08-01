#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  render_summary.sh --release NAME --chart PATH [helm template args...]

Prints compact JSON-lines summaries for selected rendered resources.
Requires: helm, yq (python-yq/jq compatible)

Examples:
  render_summary.sh --release app --chart ./newaile/aile-service-application \
    -f values.yaml -f values.dev.yaml --set global.envName=dev
USAGE
}

release=""
chart=""
helm_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      release="${2:-}"
      shift 2
      ;;
    --chart)
      chart="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      helm_args+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$release" || -z "$chart" ]]; then
  usage >&2
  exit 2
fi

tmp="$(mktemp)"
tmp_err="$(mktemp)"
trap 'rm -f "$tmp" "$tmp_err"' EXIT

if ! helm template "$release" "$chart" "${helm_args[@]}" > "$tmp" 2> "$tmp_err"; then
  cat "$tmp_err" >&2
  exit 1
fi

grep -v '^walk.go:75:' "$tmp_err" >&2 || true

yq -c '
  select(.kind == "Deployment") |
  {
    kind,
    name: .metadata.name,
    image: .spec.template.spec.containers[0].image,
    selector: .spec.selector.matchLabels,
    podLabels: .spec.template.metadata.labels,
    serviceAccountName: .spec.template.spec.serviceAccountName,
    volumeMounts: [
      (.spec.template.spec.containers[0].volumeMounts // [])[]
      | {name, mountPath, subPath}
    ],
    volumes: [
      (.spec.template.spec.volumes // [])[]
      | {name, secretName: .secret.secretName, configMapName: .configMap.name}
    ]
  }
' "$tmp"

yq -c '
  select(.kind == "ServiceAccount") |
  {
    kind,
    name: .metadata.name,
    annotations: (.metadata.annotations // {})
  }
' "$tmp"

yq -c '
  select(.kind == "ConfigMap") |
  {
    kind,
    name: .metadata.name,
    dataKeys: ((.data // {}) | keys),
    selectedData: {
      APP_ENV: .data.APP_ENV,
      SPRING_PROFILES_ACTIVE: .data.SPRING_PROFILES_ACTIVE,
      NACOS_SP: .data.NACOS_SP,
      NACOS_DISCOVERY_SERVER_ADDR: .data.NACOS_DISCOVERY_SERVER_ADDR,
      NACOS_CONFIG_SERVER_ADDR: .data.NACOS_CONFIG_SERVER_ADDR,
      NACOS_USER: .data.NACOS_USER
    }
  }
' "$tmp"

yq -c '
  select(.kind == "ExternalSecret") |
  {
    kind,
    name: .metadata.name,
    data: [
      (.spec.data // [])[]
      | {secretKey, remoteRefKey: .remoteRef.key}
    ]
  }
' "$tmp"

yq -c '
  select(.kind == "ScaledObject") |
  {
    kind,
    name: .metadata.name,
    minReplicaCount: .spec.minReplicaCount,
    maxReplicaCount: .spec.maxReplicaCount,
    triggers: [
      (.spec.triggers // [])[]
      | {
          type,
          metricType: .metadata.metricType,
          value: .metadata.value,
          activationValue: .metadata.activationValue,
          subscriptionName: .metadata.subscriptionName,
          authenticationRef: .authenticationRef.name
        }
    ]
  }
' "$tmp"
