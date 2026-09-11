#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$(cd "$script_dir/../.." && pwd)"
snapshot="$skill_dir/scripts/runtime_dependency_snapshot.sh"
pod_summary="$skill_dir/scripts/k8s_pod_failure_summary.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat >"$tmpdir/kubectl" <<'KUBECTL'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$COMMAND_LOG"

if [[ "${FIXTURE_MODE:-}" == "snapshot" ]]; then
  if [[ "$*" == *"get deployment "*" -o json"* ]]; then
    case "${FIXTURE_TARGET:-deployment}" in
      deployment)
        cat <<'JSON'
{"metadata":{"name":"example-service"},"spec":{"selector":{"matchLabels":{"component":"api","app":"example"}},"template":{"spec":{"serviceAccountName":"template-sa"}}}}
JSON
        ;;
      service)
        echo 'Error from server (NotFound): deployments.apps "example-service" not found' >&2
        exit 1
        ;;
      forbidden)
        echo 'Error from server (Forbidden): deployments.apps is forbidden' >&2
        exit 1
        ;;
    esac
  elif [[ "$*" == *"get service "*" -o json"* ]]; then
    cat <<'JSON'
{"metadata":{"name":"example-service"},"spec":{"selector":{"app":"example","component":"api"}}}
JSON
  elif [[ "$*" == *"get deployment "*" -o wide"* ]]; then
    printf '%s\n' 'NAME READY' 'example-service 1/1'
  elif [[ "$*" == *"get service "*" -o wide"* ]]; then
    printf '%s\n' 'NAME TYPE' 'example-service ClusterIP'
  elif [[ "$*" == *"get pod "*" -o json"* ]]; then
    cat <<'JSON'
{"items":[{"metadata":{"name":"example-service-a"},"spec":{"serviceAccountName":"runtime-sa"}},{"metadata":{"name":"example-service-b"},"spec":{"serviceAccountName":"runtime-sa"}}]}
JSON
  elif [[ "$*" == *"get pod "*" -o wide"* ]]; then
    printf '%s\n' 'NAME READY' 'example-service-a 1/1' 'example-service-b 1/1'
  elif [[ "$*" == *"get events "* ]]; then
    printf '%s\n' 'No events found.'
  elif [[ "$*" == *"get serviceaccount "* ]]; then
    printf '%s\n' 'runtime-sa cloudServiceAccount=example-service@example-project.iam.gserviceaccount.com'
  else
    echo "unexpected snapshot command: $*" >&2
    exit 1
  fi
  exit 0
fi

if [[ "${FIXTURE_MODE:-}" == "pod" ]]; then
  if [[ "$*" == *"get pod "*" -o json"* ]]; then
    restart="${POD_RESTARTS:-0}"
    if [[ "${POD_LAST_STATE_KIND:-}" == "waiting" ]]; then
      last_state='{"waiting":{"reason":"ContainerCreating"}}'
    elif [[ "$restart" == "0" ]]; then
      last_state='{}'
    else
      last_state='{"terminated":{"reason":"Error","exitCode":1}}'
    fi
    printf '%s\n' "{\"metadata\":{\"name\":\"example-pod\",\"namespace\":\"example-namespace\",\"creationTimestamp\":\"2026-01-01T00:00:00Z\"},\"spec\":{\"nodeName\":\"example-node\",\"serviceAccountName\":\"runtime-sa\",\"containers\":[{\"name\":\"app\",\"startupProbe\":{\"httpGet\":{\"path\":\"/startup\",\"port\":8080},\"failureThreshold\":30,\"periodSeconds\":10},\"readinessProbe\":{\"httpGet\":{\"path\":\"/ready\",\"port\":8080},\"initialDelaySeconds\":20},\"livenessProbe\":{\"httpGet\":{\"path\":\"/live\",\"port\":8080},\"initialDelaySeconds\":60}}]},\"status\":{\"phase\":\"Running\",\"qosClass\":\"Burstable\",\"startTime\":\"2026-01-01T00:00:02Z\",\"conditions\":[{\"type\":\"Ready\",\"status\":\"False\"}],\"containerStatuses\":[{\"name\":\"app\",\"ready\":false,\"restartCount\":$restart,\"state\":{\"running\":{}},\"lastState\":$last_state}]}}"
  elif [[ "$*" == *"get events "* ]]; then
    printf '%s\n' 'No events found.'
  elif [[ "$*" == *"logs "* ]]; then
    printf '%s\n' 'leading-line-that-will-be-truncated'
    python3 - <<'PY'
print("x" * 180)
PY
    if [[ "$*" == *"--previous"* ]]; then
      printf '%s\n' 'previous-log-marker'
    else
      printf '%s\n' 'current-log-marker'
    fi
  else
    echo "unexpected pod command: $*" >&2
    exit 1
  fi
  exit 0
fi

echo "FIXTURE_MODE is required" >&2
exit 1
KUBECTL
chmod +x "$tmpdir/kubectl"

export PATH="$tmpdir:$PATH"
export COMMAND_LOG="$tmpdir/commands.log"

: >"$COMMAND_LOG"
FIXTURE_MODE=snapshot FIXTURE_TARGET=deployment "$snapshot" \
  --context example-context --namespace example-namespace \
  --service example-service >"$tmpdir/snapshot.out" 2>"$tmpdir/snapshot.err"

grep -F 'resolvedKind=deployment' "$tmpdir/snapshot.out" >/dev/null
grep -F 'selector=app=example,component=api' "$tmpdir/snapshot.out" >/dev/null
grep -F 'serviceaccount --context=example-context -n example-namespace runtime-sa' "$COMMAND_LOG" >/dev/null
if grep -F 'serviceaccount --context=example-context -n example-namespace example-service' "$COMMAND_LOG" >/dev/null; then
  echo "snapshot guessed a ServiceAccount from the service name" >&2
  exit 1
fi
if grep 'get events' "$COMMAND_LOG" | grep -v -- '--field-selector' >/dev/null; then
  echo "snapshot issued an unscoped event query" >&2
  exit 1
fi
if grep -F 'get lease' "$COMMAND_LOG" >/dev/null; then
  echo "service snapshot queried unrelated namespace leases" >&2
  exit 1
fi

: >"$COMMAND_LOG"
FIXTURE_MODE=snapshot FIXTURE_TARGET=service "$snapshot" \
  --context example-context --namespace example-namespace \
  --service example-service >"$tmpdir/service-fallback.out" 2>"$tmpdir/service-fallback.err"
grep -F 'resolvedKind=service' "$tmpdir/service-fallback.out" >/dev/null
grep -F 'involvedObject.kind=Service,involvedObject.name=example-service' "$COMMAND_LOG" >/dev/null

: >"$COMMAND_LOG"
if FIXTURE_MODE=snapshot FIXTURE_TARGET=forbidden "$snapshot" \
    --context example-context --namespace example-namespace \
    --service example-service >"$tmpdir/forbidden.out" 2>"$tmpdir/forbidden.err"; then
  echo "snapshot accepted a forbidden Deployment lookup" >&2
  exit 1
fi
grep -F 'Service fallback is unsafe' "$tmpdir/forbidden.err" >/dev/null
if grep -F 'get service ' "$COMMAND_LOG" >/dev/null; then
  echo "snapshot hid a Deployment authorization error with Service fallback" >&2
  exit 1
fi

: >"$COMMAND_LOG"
FIXTURE_MODE=pod POD_RESTARTS=0 "$pod_summary" \
  --context example-context --namespace example-namespace --pod example-pod \
  >"$tmpdir/pod-default.out" 2>"$tmpdir/pod-default.err"
grep -F 'startup=configured path=/startup port=8080' "$tmpdir/pod-default.out" >/dev/null
grep -F 'skipped: add --logs' "$tmpdir/pod-default.out" >/dev/null
if grep -F 'logs ' "$COMMAND_LOG" >/dev/null; then
  echo "pod summary queried logs without explicit --logs" >&2
  exit 1
fi

: >"$COMMAND_LOG"
FIXTURE_MODE=pod POD_RESTARTS=0 "$pod_summary" \
  --context example-context --namespace example-namespace --pod example-pod \
  --logs --max-log-bytes 64 >"$tmpdir/pod-current.out" 2>"$tmpdir/pod-current.err"
grep -F '[log output truncated:' "$tmpdir/pod-current.out" >/dev/null
grep -F 'skipped: selected container status has no restart' "$tmpdir/pod-current.out" >/dev/null
if grep -- '--previous' "$COMMAND_LOG" >/dev/null; then
  echo "pod summary queried previous logs for a zero-restart Pod" >&2
  exit 1
fi

: >"$COMMAND_LOG"
FIXTURE_MODE=pod POD_RESTARTS=0 POD_LAST_STATE_KIND=waiting "$pod_summary" \
  --context example-context --namespace example-namespace --pod example-pod \
  --logs --max-log-bytes 64 >"$tmpdir/pod-waiting.out" 2>"$tmpdir/pod-waiting.err"
if grep -- '--previous' "$COMMAND_LOG" >/dev/null; then
  echo "pod summary queried previous logs for a non-terminated lastState" >&2
  exit 1
fi

: >"$COMMAND_LOG"
FIXTURE_MODE=pod POD_RESTARTS=1 "$pod_summary" \
  --context example-context --namespace example-namespace --pod example-pod \
  --container app --logs --max-log-bytes 128 \
  >"$tmpdir/pod-previous.out" 2>"$tmpdir/pod-previous.err"
grep -- '--previous' "$COMMAND_LOG" | grep -F -- '-c app' >/dev/null
grep -F 'previous-log-marker' "$tmpdir/pod-previous.out" >/dev/null

echo "runtime dependency diagnostic helper tests passed"
