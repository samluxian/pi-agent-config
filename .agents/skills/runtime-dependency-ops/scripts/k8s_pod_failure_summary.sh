#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  k8s_pod_failure_summary.sh --context <kube-context> --namespace <namespace> --pod <pod> [options]

Options:
  --container <container>    Limit logs to one container. Defaults to all containers.
  --tail <lines>             Log lines per container. Default: 100.
  --since <duration>         Log age window, e.g. 10m, 1h. Default: 10m.
  --no-logs                  Skip kubectl logs; show pod status and events only.

Read-only pod failure summary. Does not print env, Secret values, ConfigMap
payloads, full pod YAML, or full kubectl describe output.
USAGE
}

context=""
namespace=""
pod=""
container=""
tail_lines="100"
since="10m"
no_logs="false"

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
    --pod)
      pod="${2:-}"
      shift 2
      ;;
    --container)
      container="${2:-}"
      shift 2
      ;;
    --tail)
      tail_lines="${2:-}"
      shift 2
      ;;
    --since)
      since="${2:-}"
      shift 2
      ;;
    --no-logs)
      no_logs="true"
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

if [[ -z "$context" || -z "$namespace" || -z "$pod" ]]; then
  usage
  exit 2
fi

run() {
  echo
  echo "## $*"
  "$@" || true
}

pod_json="$(mktemp)"
trap 'rm -f "$pod_json"' EXIT

kubectl get pod --context="$context" -n "$namespace" "$pod" -o json >"$pod_json"

python3 - "$pod_json" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    pod = json.load(fh)

meta = pod.get("metadata", {})
spec = pod.get("spec", {})
status = pod.get("status", {})

def state_reason(state):
    if not isinstance(state, dict) or not state:
        return ""
    kind, detail = next(iter(state.items()))
    if isinstance(detail, dict):
        reason = detail.get("reason") or ""
        exit_code = detail.get("exitCode")
        suffix = f" reason={reason}" if reason else ""
        if exit_code is not None:
            suffix += f" exitCode={exit_code}"
        return f"{kind}{suffix}"
    return str(kind)

print("## pod summary")
print(f"name={meta.get('name')} namespace={meta.get('namespace')} node={spec.get('nodeName', '<none>')}")
print(f"phase={status.get('phase')} qos={status.get('qosClass')} serviceAccount={spec.get('serviceAccountName')}")
print(f"podIP={status.get('podIP', '<none>')} hostIP={status.get('hostIP', '<none>')}")

print("\n## conditions")
for c in status.get("conditions", []) or []:
    print(f"{c.get('type')}={c.get('status')} reason={c.get('reason', '')} message={c.get('message', '')}")

def print_statuses(title, statuses):
    print(f"\n## {title}")
    if not statuses:
        print("none")
        return
    for s in statuses:
        print(
            " ".join(
                [
                    f"name={s.get('name')}",
                    f"ready={s.get('ready')}",
                    f"restartCount={s.get('restartCount')}",
                    f"state={state_reason(s.get('state'))}",
                    f"lastState={state_reason(s.get('lastState'))}",
                ]
            )
        )

print_statuses("init container statuses", status.get("initContainerStatuses"))
print_statuses("container statuses", status.get("containerStatuses"))
PY

run kubectl get events --context="$context" -n "$namespace" \
  --field-selector "involvedObject.kind=Pod,involvedObject.name=$pod" \
  --sort-by=.lastTimestamp

if [[ "$no_logs" == "true" ]]; then
  echo
  echo "## logs"
  echo "skipped: --no-logs"
  exit 0
fi

log_args=(--context="$context" -n "$namespace" "$pod" --tail="$tail_lines" --since="$since")
previous_args=(--context="$context" -n "$namespace" "$pod" --previous --tail="$tail_lines")
if [[ -n "$container" ]]; then
  log_args=(-c "$container" "${log_args[@]}")
  previous_args=(-c "$container" "${previous_args[@]}")
  run kubectl logs "${log_args[@]}"
  run kubectl logs "${previous_args[@]}"
else
  run kubectl logs --all-containers=true "${log_args[@]}"
  run kubectl logs --all-containers=true "${previous_args[@]}"
fi
