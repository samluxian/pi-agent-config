#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  cat >&2 <<'USAGE'
usage: service_topology_inventory.sh <repo-or-path> [repo-or-path...]

Prints compact read-only topology evidence for local repos or paths.
Does not read secret payloads.
USAGE
  exit 2
fi

section() {
  printf '\n## %s\n' "$1"
}

RG_SAFE_GLOBS=(
  --glob '!**/.env'
  --glob '!**/.env.*'
  --glob '!**/*credential*'
  --glob '!**/*Credential*'
  --glob '!**/*kubeconfig*'
  --glob '!**/*token*'
  --glob '!**/*Token*'
  --glob '!**/*private*key*'
  --glob '!**/*service-account*.json'
)

print_repo_status() {
  local path="$1"
  section "repo $path"
  if [ -d "$path/.git" ]; then
    echo "branch=$(git -C "$path" branch --show-current 2>/dev/null || true)"
    echo "remotes:"
    git -C "$path" remote -v 2>/dev/null | sed -n '1,6p' || true
    echo "status_short:"
    git -C "$path" status --short --untracked-files=all 2>/dev/null | sed -n '1,40p' || true
  else
    echo "not_git_repo_or_subpath=$path"
  fi
}

scan_path() {
  local path="$1"
  [ -e "$path" ] || {
    section "missing $path"
    return
  }

  print_repo_status "$path"

  section "ci and delivery $path"
  find "$path" -maxdepth 3 -type f \( \
    -name '.gitlab-ci.yml' -o \
    -name '.gitlab-ci.yaml' -o \
    -name '*gitlab*' -o \
    -name 'Dockerfile' -o \
    -name 'firebase.json' -o \
    -name '.firebaserc' \
  \) 2>/dev/null | sort | sed -n '1,80p'
  rg "${RG_SAFE_GLOBS[@]}" -n "firebase deploy|hosting:|docker build|docker push|trigger:|include:|helm|kubectl|argocd|deploy|image:|repository:|tag:" \
    "$path" 2>/dev/null | sed -n '1,120p' || true

  section "app and api dependencies $path"
  rg "${RG_SAFE_GLOBS[@]}" -n "VITE_|REACT_APP|NEXT_PUBLIC|BASE_URL|GRAPHQL|axios|fetch\\(|RESTDataSource|baseURL|process\\.env|@RequestMapping|@GetMapping|@PostMapping|@FeignClient|routes:|service:" \
    "$path" 2>/dev/null | sed -n '1,160p' || true

  section "config state and runtime references $path"
  rg "${RG_SAFE_GLOBS[@]}" -n "ExternalSecret|remoteRef|Secret Manager|secretFiles|ServiceAccount|iam.gke.io|cloud.google.com/neg|Ingress|HTTPRoute|Gateway|loadBalancerIP|Redis|redis|Pub/Sub|pubsub|Mongo|collection|@Document|lockKey|database|bucket" \
    "$path" 2>/dev/null | sed -n '1,160p' || true

  section "compile and module dependencies $path"
  rg "${RG_SAFE_GLOBS[@]}" -n "implementation project\\('|api project\\('|compileOnly project\\('|compile project\\('|<dependency>|include '|include \\\"" \
    "$path" 2>/dev/null | sed -n '1,120p' || true
}

for target in "$@"; do
  scan_path "$target"
done
