#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  runtime_dependency_snapshot.sh --context <kube-context> --namespace <namespace> [options]

Options:
  --service <service>                 Kubernetes app.kubernetes.io/name value.
  --project <gcp-project>             Optional GCP project for Pub/Sub/cache checks.
  --topic <pubsub-topic>              Pub/Sub topic to describe.
  --subscription-filter <filter>      Pub/Sub subscription list filter.
  --region <region>                   Region for Redis checks. Default: asia-east1.
  --location <location>               Location for Memorystore checks. Default: same as region.

Read-only runtime dependency snapshot. Does not print secret values.
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
    --context)
      context="${2:-}"
      shift 2
      ;;
    --namespace)
      namespace="${2:-}"
      shift 2
      ;;
    --project)
      project="${2:-}"
      shift 2
      ;;
    --service)
      service="${2:-}"
      shift 2
      ;;
    --topic)
      topic="${2:-}"
      shift 2
      ;;
    --subscription-filter)
      subscription_filter="${2:-}"
      shift 2
      ;;
    --region)
      region="${2:-}"
      shift 2
      ;;
    --location)
      location="${2:-}"
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
  echo "## $*"
  "$@" || true
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
  selector="app.kubernetes.io/name=${service}"
  run kubectl get deploy,hpa,pod --context="$context" -n "$namespace" -l "$selector" -o wide
  run kubectl get events --context="$context" -n "$namespace" --sort-by=.lastTimestamp
  run kubectl get sa --context="$context" -n "$namespace" "$service" -o jsonpath='{.metadata.name}{" cloudServiceAccount="}{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'
else
  run kubectl get deploy,hpa,pod --context="$context" -n "$namespace" -o wide
fi

run kubectl get lease --context="$context" -n "$namespace"

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
