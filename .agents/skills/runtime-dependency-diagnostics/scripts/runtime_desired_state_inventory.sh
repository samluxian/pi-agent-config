#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  runtime_desired_state_inventory.sh --root <desired-state-root> [--services <svc1,svc2>] [--envs <dev,qa,uat,prod>]

Reads local Helm-style desired-state metadata for service directories.
It does not read Kubernetes Secrets, Secret Manager payloads, or mounted secret values.
USAGE
}

root=""
services_csv=""
envs_csv="dev,qa,uat,prod"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      root="${2:-}"
      shift 2
      ;;
    --services)
      services_csv="${2:-}"
      shift 2
      ;;
    --envs)
      envs_csv="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$root" ]]; then
  usage
  exit 2
fi

if ! command -v yq >/dev/null 2>&1; then
  echo "missing required command: yq" >&2
  exit 127
fi

if [[ ! -d "$root" ]]; then
  echo "missing desired-state path: $root" >&2
  exit 2
fi

if [[ -n "$services_csv" ]]; then
  IFS=',' read -r -a services <<< "$services_csv"
else
  mapfile -t services < <(find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
fi
IFS=',' read -r -a envs <<< "$envs_csv"

echo "desired_state=$root"
echo "services=${services[*]}"
echo "envs=${envs[*]}"
echo

for service in "${services[@]}"; do
  svc_dir="$root/$service"
  if [[ ! -d "$svc_dir" ]]; then
    echo "## $service"
    echo "missing=true"
    echo
    continue
  fi

  chart_name=""
  chart_dep=""
  if [[ -f "$svc_dir/Chart.yaml" ]]; then
    chart_name="$(yq -r '.name // ""' "$svc_dir/Chart.yaml")"
    chart_dep="$(yq -r '.dependencies[]? | (.alias // .name) + ":" + (.version // "")' "$svc_dir/Chart.yaml" | paste -sd ',' -)"
  fi

  values_file="$svc_dir/values.yaml"
  repository=""
  port=""
  bucket=""
  if [[ -f "$values_file" ]]; then
    repository="$(yq -r '.common.deployment.image.repository // .stable.deployment.image.repository // .deployment.image.repository // ""' "$values_file")"
    port="$(yq -r '.common.services.main.ports[0].port // .stable.services.main.ports[0].port // .services.main.ports[0].port // ""' "$values_file")"
    bucket="$(yq -r '.. | .bucketName? // empty' "$values_file" | sort -u | paste -sd ',' -)"
  fi

  echo "## $service"
  echo "chart=$chart_name"
  echo "dependency=$chart_dep"
  echo "image_repository=$repository"
  echo "service_port=$port"
  if [[ -n "$bucket" ]]; then
    echo "base_bucket_refs=$bucket"
  fi

  for env_name in "${envs[@]}"; do
    env_file="$svc_dir/values.$env_name.yaml"
    if [[ ! -f "$env_file" ]]; then
      echo "$env_name missing=true"
      continue
    fi

    tag="$(yq -r '.common.deployment.image.tag // .stable.deployment.image.tag // .deployment.image.tag // ""' "$env_file")"
    gsa="$(yq -r '.common.serviceAccount.annotations."iam.gke.io/gcp-service-account" // .stable.serviceAccount.annotations."iam.gke.io/gcp-service-account" // .serviceAccount.annotations."iam.gke.io/gcp-service-account" // ""' "$env_file")"
    remote_ref="$(yq -r '.. | .remoteRef? // empty' "$env_file" | sort -u | paste -sd ',' -)"
    env_name_value="$(yq -r '.global.envName // .envName // ""' "$env_file")"
    env_bucket="$(yq -r '.. | .bucketName? // empty' "$env_file" | sort -u | paste -sd ',' -)"

    printf '%s tag=%s gsa=%s secretRemoteRef=%s envName=%s' "$env_name" "$tag" "$gsa" "$remote_ref" "$env_name_value"
    if [[ -n "$env_bucket" ]]; then
      printf ' bucketRefs=%s' "$env_bucket"
    fi
    printf '\n'
  done
  echo
done
