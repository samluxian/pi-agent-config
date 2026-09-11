#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  runtime_dependency_snapshot.sh --context <kube-context> --namespace <namespace> [options]

Options:
  --service <name>                    Exact Deployment name, then exact Service fallback.
  --project <gcp-project>             Optional GCP project for Pub/Sub/cache checks.
  --topic <pubsub-topic>              Pub/Sub topic to describe.
  --subscription-filter <filter>      Pub/Sub subscription list filter.
  --region <region>                   Region for Redis checks. Default: asia-east1.
  --location <location>               Location for Memorystore checks. Default: same as region.

Read-only runtime dependency snapshot. With --service, selectors and Kubernetes
ServiceAccounts come from live workload fields; names are never guessed.
USAGE
}

context=""
namespace=""
project=""
service=""
topic=""
subscription_filter=""
region="asia-east1"
location=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) context="${2:-}"; shift 2 ;;
    --namespace) namespace="${2:-}"; shift 2 ;;
    --project) project="${2:-}"; shift 2 ;;
    --service) service="${2:-}"; shift 2 ;;
    --topic) topic="${2:-}"; shift 2 ;;
    --subscription-filter) subscription_filter="${2:-}"; shift 2 ;;
    --region) region="${2:-}"; shift 2 ;;
    --location) location="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$context" || -z "$namespace" ]]; then
  usage
  exit 2
fi

if [[ -z "$project" && ( -n "$topic" || -n "$subscription_filter" ) ]]; then
  echo "ERROR: --project is required for Pub/Sub checks." >&2
  exit 2
fi

if [[ -z "$location" ]]; then
  location="$region"
fi

run() {
  echo
  printf '##'
  printf ' %q' "$@"
  echo
  "$@" || {
    status=$?
    echo "ERROR: read-only check failed with exit code $status" >&2
    return 0
  }
}

selector_from_json() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

path, kind = sys.argv[1:]
with open(path, encoding="utf-8") as handle:
    resource = json.load(handle)

if kind == "deployment":
    selector = resource.get("spec", {}).get("selector", {})
    labels = selector.get("matchLabels") or {}
    expressions = selector.get("matchExpressions") or []
else:
    labels = resource.get("spec", {}).get("selector") or {}
    expressions = []

parts = [f"{key}={labels[key]}" for key in sorted(labels)]
for expression in expressions:
    key = expression.get("key")
    operator = expression.get("operator")
    values = expression.get("values") or []
    if not key:
        continue
    if operator == "In" and values:
        parts.append(f"{key} in ({','.join(values)})")
    elif operator == "NotIn" and values:
        parts.append(f"{key} notin ({','.join(values)})")
    elif operator == "Exists":
        parts.append(key)
    elif operator == "DoesNotExist":
        parts.append(f"!{key}")
    else:
        raise SystemExit(f"ERROR: unsupported selector expression for {key}: {operator}")

if not parts:
    raise SystemExit("ERROR: resolved resource has no Pod selector")
print(",".join(parts))
PY
}

echo "context=$context"
echo "namespace=$namespace"
echo "region=$region"
echo "location=$location"
if [[ -n "$project" ]]; then
  echo "project=$project"
fi
if [[ -n "$service" ]]; then
  echo "service=$service"
fi

if [[ -n "$service" ]]; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  resource_json="$temp_dir/resource.json"
  deployment_error="$temp_dir/deployment.err"
  service_error="$temp_dir/service.err"
  resolved_kind=""

  if kubectl get deployment --context="$context" -n "$namespace" "$service" \
      -o json >"$resource_json" 2>"$deployment_error"; then
    resolved_kind="deployment"
  elif ! grep -Eqi 'not[[:space:]]*found|NotFound' "$deployment_error"; then
    echo "ERROR: Deployment lookup failed; Service fallback is unsafe." >&2
    sed -n '1,3p' "$deployment_error" >&2
    exit 1
  elif kubectl get service --context="$context" -n "$namespace" "$service" \
      -o json >"$resource_json" 2>"$service_error"; then
    resolved_kind="service"
  else
    echo "ERROR: cannot resolve exact Deployment or Service named '$service'." >&2
    sed -n '1,3p' "$deployment_error" >&2
    sed -n '1,3p' "$service_error" >&2
    exit 1
  fi

  selector="$(selector_from_json "$resource_json" "$resolved_kind")"
  echo "resolvedKind=$resolved_kind"
  echo "selector=$selector"

  if [[ "$resolved_kind" == "deployment" ]]; then
    run kubectl get deployment --context="$context" -n "$namespace" "$service" -o wide
  else
    run kubectl get service --context="$context" -n "$namespace" "$service" -o wide
  fi
  run kubectl get pod --context="$context" -n "$namespace" -l "$selector" -o wide

  pods_json="$temp_dir/pods.json"
  if kubectl get pod --context="$context" -n "$namespace" -l "$selector" \
      -o json >"$pods_json"; then
    mapfile -t pod_names < <(python3 - "$pods_json" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    pods = json.load(handle).get("items", [])
for pod in pods:
    name = pod.get("metadata", {}).get("name")
    if name:
        print(name)
PY
)
    mapfile -t service_accounts < <(python3 - "$pods_json" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    pods = json.load(handle).get("items", [])
names = {
    pod.get("spec", {}).get("serviceAccountName")
    for pod in pods
    if pod.get("spec", {}).get("serviceAccountName")
}
for name in sorted(names):
    print(name)
PY
)

    echo
    echo "## scoped events"
    if [[ "$resolved_kind" == "deployment" ]]; then
      resource_event_kind="Deployment"
    else
      resource_event_kind="Service"
    fi
    run kubectl get events --context="$context" -n "$namespace" \
      --field-selector "involvedObject.kind=$resource_event_kind,involvedObject.name=$service" \
      --sort-by=.lastTimestamp
    max_event_pods=10
    for index in "${!pod_names[@]}"; do
      if (( index >= max_event_pods )); then
        echo "events truncated: selected ${#pod_names[@]} Pods; inspected first $max_event_pods"
        break
      fi
      run kubectl get events --context="$context" -n "$namespace" \
        --field-selector "involvedObject.kind=Pod,involvedObject.name=${pod_names[$index]}" \
        --sort-by=.lastTimestamp
    done

    echo
    echo "## selected Pod ServiceAccounts"
    if (( ${#service_accounts[@]} == 0 )); then
      echo "none: no selected Pod exposes serviceAccountName"
    else
      for service_account in "${service_accounts[@]}"; do
        run kubectl get serviceaccount --context="$context" -n "$namespace" \
          "$service_account" \
          -o 'jsonpath={.metadata.name}{" cloudServiceAccount="}{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'
      done
    fi
  else
    echo "ERROR: cannot retrieve Pods for resolved selector." >&2
  fi
else
  run kubectl get deploy,hpa,pod --context="$context" -n "$namespace" -o wide
  run kubectl get lease --context="$context" -n "$namespace"
fi

if [[ -n "$project" && -n "$topic" ]]; then
  run gcloud pubsub topics describe "$topic" --project="$project" --format='yaml(name,labels)'
fi

if [[ -n "$project" && -n "$subscription_filter" ]]; then
  run gcloud pubsub subscriptions list --project="$project" \
    --filter="$subscription_filter" \
    --format='table(name,topic,filter,deadLetterPolicy.deadLetterTopic,ackDeadlineSeconds)'
fi

if [[ -n "$project" ]]; then
  run gcloud redis instances list --project="$project" --region="$region" \
    --format='table(name,host,port,tier,memorySizeGb,state)'
  run gcloud memorystore instances list --project="$project" --location="$location" \
    --format='table(name,state,createTime)'
else
  echo
  echo "## gcp dependency checks"
  echo "skipped: --project not provided"
fi
