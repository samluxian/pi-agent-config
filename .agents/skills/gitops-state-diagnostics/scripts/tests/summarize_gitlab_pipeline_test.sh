#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
subject="$script_dir/../summarize_gitlab_pipeline.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat > "$tmpdir/glab" <<'GLAB'
#!/usr/bin/env bash
set -euo pipefail
endpoint="${2:-}"
case "$endpoint" in
  projects/example%2Frepository/pipelines/77)
    printf '%s\n' '{"id":77,"iid":12,"project_id":9,"ref":"refs/merge-requests/3/head","status":"success","source":"merge_request_event","sha":"abc123","web_url":"https://git.example.test/example/repository/-/pipelines/77"}'
    ;;
  projects/example%2Frepository/pipelines/77/jobs)
    printf '%s\n' '[{"id":501,"name":"terraform:plan: [dev]","stage":"plan","status":"success","duration":12,"failure_reason":null,"commit":{"id":"abc123"}}]'
    ;;
  projects/example%2Frepository/jobs/501/trace)
    printf '%s\n' 'Terraform will perform the following actions:' 'Plan: 2 to import, 0 to add, 0 to change, 0 to destroy.'
    ;;
  projects/example%2Frepository/pipelines/88)
    printf '%s\n' '{"id":88,"iid":13,"project_id":9,"ref":"branch","status":"failed","source":"push","sha":"def456","web_url":"https://git.example.test/example/repository/-/pipelines/88"}'
    ;;
  projects/example%2Frepository/pipelines/88/jobs)
    printf '%s\n' '[{"id":502,"name":"terraform:plan: [dev]","stage":"plan","status":"failed","duration":8,"failure_reason":"script_failure","commit":{"id":"def456"}}]'
    ;;
  projects/example%2Frepository/jobs/502/trace)
    printf '%s\n' 'Error: authorization token=do-not-print' 'Warning: plan unavailable'
    ;;
  *)
    echo "unexpected endpoint: $endpoint" >&2
    exit 1
    ;;
esac
GLAB
chmod +x "$tmpdir/glab"

GLAB_BIN="$tmpdir/glab" "$subject" example/repository 77 > "$tmpdir/pass.json"
GLAB_BIN="$tmpdir/glab" "$subject" example/repository 88 > "$tmpdir/fail.json"

python3 - "$tmpdir/pass.json" "$tmpdir/fail.json" <<'PY'
import json
import pathlib
import sys

passed = json.loads(pathlib.Path(sys.argv[1]).read_text())
failed = json.loads(pathlib.Path(sys.argv[2]).read_text())

assert passed["result"] == "pass"
assert passed["plan_traces"][0]["status"] == "success"
assert passed["plan_traces"][0]["commit_sha"] == "abc123"
assert passed["plan_traces"][0]["counts"] == {
    "import": 2,
    "add": 0,
    "change": 0,
    "destroy": 0,
    "replace": 0,
}
assert failed["result"] == "fail"
assert failed["plan_traces"][0]["counts"] is None
serialized = json.dumps(failed)
assert "do-not-print" not in serialized
assert "[redacted secret-like line]" in serialized
PY

echo "summarize_gitlab_pipeline tests passed"
