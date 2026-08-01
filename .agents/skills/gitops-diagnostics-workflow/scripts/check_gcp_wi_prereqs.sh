#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  check_gcp_wi_prereqs.sh --project <project-id> --namespace <namespace> --ksa <ksa-name> --gsa <gsa-email> [options]

Options:
  --deploy <deployment-name>       Check Deployment serviceAccountName.
  --api <api-name>                 Check enabled API. Repeatable.
  --secret <secret-name>           Check Secret Manager secret and versions. Repeatable.
  --skip-kubectl                   Skip Kubernetes KSA/Deployment checks.
  --skip-gcloud                    Skip GCP checks.

Runs read-only Workload Identity/GCP prerequisite checks. It does not create
service accounts, IAM bindings, APIs, secrets, or Kubernetes objects.
USAGE
}

project=""
namespace=""
ksa=""
gsa=""
deploy=""
skip_kubectl=false
skip_gcloud=false
apis=()
secrets=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      project="${2:-}"
      shift 2
      ;;
    --namespace)
      namespace="${2:-}"
      shift 2
      ;;
    --ksa)
      ksa="${2:-}"
      shift 2
      ;;
    --gsa)
      gsa="${2:-}"
      shift 2
      ;;
    --deploy)
      deploy="${2:-}"
      shift 2
      ;;
    --api)
      apis+=("${2:-}")
      shift 2
      ;;
    --secret)
      secrets+=("${2:-}")
      shift 2
      ;;
    --skip-kubectl)
      skip_kubectl=true
      shift
      ;;
    --skip-gcloud)
      skip_gcloud=true
      shift
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

if [[ -z "$project" || -z "$namespace" || -z "$ksa" || -z "$gsa" ]]; then
  usage
  exit 2
fi

member="serviceAccount:${project}.svc.id.goog[${namespace}/${ksa}]"

echo "# GCP/WI Prerequisite Check"
echo
echo "- project: $project"
echo "- namespace/KSA: $namespace/$ksa"
echo "- GSA: $gsa"
echo "- WI member: $member"

if [[ "$skip_kubectl" != "true" ]]; then
  echo
  echo "## Kubernetes"
  if [[ -n "$deploy" ]]; then
    echo "### Deployment serviceAccountName"
    kubectl -n "$namespace" get deploy "$deploy" \
      -o jsonpath='{.spec.template.spec.serviceAccountName}{"\n"}'
  fi
  echo "### KSA GSA annotation"
  kubectl -n "$namespace" get sa "$ksa" \
    -o jsonpath='{.metadata.annotations.iam\.gke\.io/gcp-service-account}{"\n"}'
else
  echo
  echo "## Kubernetes"
  echo "- skipped by --skip-kubectl"
fi

if [[ "$skip_gcloud" != "true" ]]; then
  echo
  echo "## GCP Service Account"
  gcloud iam service-accounts describe "$gsa" --project="$project" \
    --format='table(email,disabled,displayName)'

  echo
  echo "## GSA IAM Policy Binding"
  gcloud iam service-accounts get-iam-policy "$gsa" --project="$project" \
    --flatten='bindings[].members' \
    --filter="bindings.members:${member}" \
    --format='table(bindings.role,bindings.members)'

  echo
  echo "## Project Roles For GSA"
  gcloud projects get-iam-policy "$project" \
    --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:${gsa}" \
    --format='table(bindings.role)'

  if [[ ${#apis[@]} -gt 0 ]]; then
    echo
    echo "## Required APIs"
    for api in "${apis[@]}"; do
      echo "### $api"
      gcloud services list --enabled --project="$project" \
        --filter="config.name:${api}" \
        --format='table(config.name,state)'
    done
  fi

  if [[ ${#secrets[@]} -gt 0 ]]; then
    echo
    echo "## Secret Manager"
    for secret in "${secrets[@]}"; do
      echo "### $secret"
      gcloud secrets describe "$secret" --project="$project" \
        --format='table(name,createTime,replication.automatic)'
      gcloud secrets versions list "$secret" --project="$project" \
        --format='table(name,state,createTime)'
    done
  fi
else
  echo
  echo "## GCP"
  echo "- skipped by --skip-gcloud"
fi
