#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  k8s_pod_failure_summary.sh --context <kube-context> --namespace <namespace> --pod <pod> [options]

Options:
  --container <container>    Limit status and logs to one container.
  --logs                     Include bounded application logs. Default: disabled.
  --tail <lines>             Log lines per container. Default: 100.
  --since <duration>         Log age window, e.g. 10m, 1h. Default: 10m.
  --max-log-bytes <bytes>    Maximum bytes for each log result. Default: 16384.
  --no-logs                  Deprecated compatibility flag; logs are already disabled by default.

Read-only pod failure summary. Does not print env, Secret values, ConfigMap
payloads, full pod YAML, or full kubectl describe output. Application logs can
contain sensitive data; request them only for a concrete application question.
USAGE
}

context=""
namespace=""
pod=""
container=""
tail_lines="100"
since="10m"
max_log_bytes="16384"
include_logs="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) context="${2:-}"; shift 2 ;;
    --namespace) namespace="${2:-}"; shift 2 ;;
    --pod) pod="${2:-}"; shift 2 ;;
    --container) container="${2:-}"; shift 2 ;;
    --logs) include_logs="true"; shift ;;
    --tail) tail_lines="${2:-}"; shift 2 ;;
    --since) since="${2:-}"; shift 2 ;;
    --max-log-bytes) max_log_bytes="${2:-}"; shift 2 ;;
    --no-logs) include_logs="false"; shift ;;
    -h|--help) usage; exit 0 ;;
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
if [[ ! "$tail_lines" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: --tail must be a positive integer." >&2
  exit 2
fi
if [[ ! "$max_log_bytes" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: --max-log-bytes must be a positive integer." >&2
  exit 2
fi
if [[ -z "$since" ]]; then
  echo "ERROR: --since must not be empty." >&2
  exit 2
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

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
pod_json="$temp_dir/pod.json"
previous_containers="$temp_dir/previous-containers"

kubectl get pod --context="$context" -n "$namespace" "$pod" -o json >"$pod_json"

python3 - "$pod_json" "$container" "$previous_containers" <<'PY'
import json
import sys

path, selected_container, previous_path = sys.argv[1:]
with open(path, encoding="utf-8") as handle:
    pod = json.load(handle)

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


def probe_summary(name, probe):
    if not probe:
        return f"{name}=none"
    target = probe.get("httpGet") or probe.get("tcpSocket") or probe.get("grpc") or {}
    path = target.get("path")
    port = target.get("port")
    endpoint = ""
    if path is not None:
        endpoint += f" path={path}"
    if port is not None:
        endpoint += f" port={port}"
    return (
        f"{name}=configured{endpoint}"
        f" initialDelaySeconds={probe.get('initialDelaySeconds', 0)}"
        f" periodSeconds={probe.get('periodSeconds', 10)}"
        f" timeoutSeconds={probe.get('timeoutSeconds', 1)}"
        f" failureThreshold={probe.get('failureThreshold', 3)}"
    )

print("## pod summary")
print(f"name={meta.get('name')} namespace={meta.get('namespace')} node={spec.get('nodeName', '<none>')}")
print(f"createdAt={meta.get('creationTimestamp')} startedAt={status.get('startTime')}")
print(f"phase={status.get('phase')} qos={status.get('qosClass')} serviceAccount={spec.get('serviceAccountName')}")
print(f"podIP={status.get('podIP', '<none>')} hostIP={status.get('hostIP', '<none>')}")

print("\n## conditions")
for condition in status.get("conditions", []) or []:
    print(
        f"{condition.get('type')}={condition.get('status')}"
        f" reason={condition.get('reason', '')} message={condition.get('message', '')}"
    )

containers_by_name = {
    item.get("name"): item for item in spec.get("containers", []) or [] if item.get("name")
}


def selected(statuses):
    statuses = statuses or []
    if not selected_container:
        return statuses
    return [item for item in statuses if item.get("name") == selected_container]


def print_statuses(title, statuses):
    print(f"\n## {title}")
    statuses = selected(statuses)
    if not statuses:
        print("none")
        return
    for item in statuses:
        print(
            " ".join(
                [
                    f"name={item.get('name')}",
                    f"ready={item.get('ready')}",
                    f"restartCount={item.get('restartCount')}",
                    f"state={state_reason(item.get('state'))}",
                    f"lastState={state_reason(item.get('lastState'))}",
                ]
            )
        )

print_statuses("init container statuses", status.get("initContainerStatuses"))
container_statuses = selected(status.get("containerStatuses"))
print_statuses("container statuses", container_statuses)

print("\n## probe timing")
probe_names = [selected_container] if selected_container else sorted(containers_by_name)
for name in probe_names:
    spec_container = containers_by_name.get(name)
    if not spec_container:
        continue
    print(f"container={name}")
    print(probe_summary("startup", spec_container.get("startupProbe")))
    print(probe_summary("readiness", spec_container.get("readinessProbe")))
    print(probe_summary("liveness", spec_container.get("livenessProbe")))

previous = []
for item in container_statuses:
    last_state = item.get("lastState")
    terminated = isinstance(last_state, dict) and isinstance(last_state.get("terminated"), dict)
    if (item.get("restartCount") or 0) > 0 or terminated:
        if item.get("name"):
            previous.append(item["name"])
with open(previous_path, "w", encoding="utf-8") as handle:
    for name in previous:
        handle.write(name + "\n")
PY

run kubectl get events --context="$context" -n "$namespace" \
  --field-selector "involvedObject.kind=Pod,involvedObject.name=$pod" \
  --sort-by=.lastTimestamp

if [[ "$include_logs" != "true" ]]; then
  echo
  echo "## logs"
  echo "skipped: add --logs for a bounded application-log check"
  exit 0
fi

run_bounded_log() {
  local label="$1"
  shift
  local output_file="$temp_dir/log-$RANDOM"
  local status=0
  echo
  printf '## %s:' "$label"
  printf ' %q' "$@"
  echo
  "$@" >"$output_file" 2>&1 || status=$?
  python3 - "$output_file" "$max_log_bytes" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
limit = int(sys.argv[2])
data = path.read_bytes()
if len(data) > limit:
    omitted = len(data) - limit
    print(f"[log output truncated: omitted {omitted} leading bytes; showing final {limit} bytes]")
    data = data[-limit:]
text = data.decode("utf-8", errors="replace")
print(text, end="" if text.endswith("\n") or not text else "\n")
PY
  if (( status != 0 )); then
    echo "ERROR: log check failed with exit code $status" >&2
  fi
  rm -f "$output_file"
}

current_args=(kubectl logs --context="$context" -n "$namespace" "$pod" --tail="$tail_lines" --since="$since")
if [[ -n "$container" ]]; then
  current_args+=( -c "$container" )
else
  current_args+=( --all-containers=true )
fi
run_bounded_log "current logs" "${current_args[@]}"

if [[ ! -s "$previous_containers" ]]; then
  echo
  echo "## previous logs"
  echo "skipped: selected container status has no restart or terminated lastState"
  exit 0
fi

while IFS= read -r previous_container; do
  [[ -z "$previous_container" ]] && continue
  run_bounded_log "previous logs container=$previous_container" \
    kubectl logs --context="$context" -n "$namespace" "$pod" \
      -c "$previous_container" --previous --tail="$tail_lines" --since="$since"
done <"$previous_containers"
