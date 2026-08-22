#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  summarize_gitlab_pipeline.sh <project-path> <pipeline-id>

Reads GitLab pipeline metadata, jobs, and failed-job trace key lines through
glab, then prints compact JSON. This script is read-only and intentionally does
not print full job traces.

Examples:
  summarize_gitlab_pipeline.sh aile_cloud/newaile/backend/springcloud-aile 2560611322
USAGE
}

if [[ $# -ne 2 ]]; then
  usage
  exit 2
fi

project_path="$1"
pipeline_id="$2"
encoded_project="${project_path//\//%2F}"

if [[ -n "${GLAB_BIN:-}" ]]; then
  glab_bin="$GLAB_BIN"
elif command -v glab >/dev/null 2>&1; then
  glab_bin="$(command -v glab)"
elif [[ -x /home/linuxbrew/.linuxbrew/bin/glab ]]; then
  glab_bin="/home/linuxbrew/.linuxbrew/bin/glab"
else
  echo "ERROR: glab not found in PATH, GLAB_BIN, or /home/linuxbrew/.linuxbrew/bin/glab" >&2
  exit 127
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

pipeline_json="$tmpdir/pipeline.json"
jobs_json="$tmpdir/jobs.json"
trace_dir="$tmpdir/traces"
mkdir -p "$trace_dir"

"$glab_bin" api "projects/${encoded_project}/pipelines/${pipeline_id}" > "$pipeline_json"
"$glab_bin" api "projects/${encoded_project}/pipelines/${pipeline_id}/jobs" --paginate > "$jobs_json"

python3 - "$pipeline_json" "$jobs_json" "$trace_dir" "$glab_bin" "$encoded_project" <<'PY'
import json
import pathlib
import re
import subprocess
import sys

pipeline_path = pathlib.Path(sys.argv[1])
jobs_path = pathlib.Path(sys.argv[2])
trace_dir = pathlib.Path(sys.argv[3])
glab_bin = sys.argv[4]
encoded_project = sys.argv[5]

pipeline = json.loads(pipeline_path.read_text())
jobs = json.loads(jobs_path.read_text())

KEY_RE = re.compile(
    r"(ERROR|Error|error|Invalid|failed|FAIL|exit code|CI_COMMIT|pre-check|"
    r"manage-tags|Tag-based|Expected format|CHANGED_SERVICES|TARGET_FOLDERS|"
    r"MATCHED_TARGET_FOLDERS|No services|No GitOps target|helm upgrade|"
    r"imageTag|buildSelectedImages|SUCCESS)"
)
SECRET_RE = re.compile(r"(token|password|secret|credential|authorization|private[_-]?key)", re.I)


def safe_line(line: str) -> str:
    line = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", line)
    line = line.replace("\r", "")
    if SECRET_RE.search(line):
        return "[redacted secret-like line]"
    return line[:300]


def trace_key_lines(job_id: int) -> list[dict[str, str | int]]:
    trace_path = trace_dir / f"{job_id}.log"
    try:
        trace = subprocess.check_output(
            [glab_bin, "api", f"projects/{encoded_project}/jobs/{job_id}/trace"],
            text=True,
            stderr=subprocess.STDOUT,
        )
    except subprocess.CalledProcessError as exc:
        return [{"line": 0, "text": safe_line(f"trace unavailable: {exc.output.strip()}")}]
    trace_path.write_text(trace)
    out = []
    for number, line in enumerate(trace.splitlines(), start=1):
        if KEY_RE.search(line):
            out.append({"line": number, "text": safe_line(line)})
    return out[-80:]


failed_jobs = [job for job in jobs if job.get("status") == "failed"]
job_summaries = []
for job in jobs:
    job_summaries.append(
        {
            "id": job.get("id"),
            "name": job.get("name"),
            "stage": job.get("stage"),
            "status": job.get("status"),
            "duration": job.get("duration"),
            "failure_reason": job.get("failure_reason"),
        }
    )

failed_trace_summaries = []
for job in failed_jobs[:5]:
    failed_trace_summaries.append(
        {
            "id": job.get("id"),
            "name": job.get("name"),
            "stage": job.get("stage"),
            "key_lines": trace_key_lines(job["id"]),
        }
    )

findings = []
for failed in failed_trace_summaries:
    text = "\n".join(str(line["text"]) for line in failed["key_lines"])
    if failed.get("name") == "pre-check" and "Invalid tag format" in text and "Expected format" in text:
        findings.append(
            {
                "level": "fail",
                "check": "tag_format_rejected_in_pre_check",
                "message": "Tag failed manage-tags.sh parsing before build or GitOps update. Expected {env}-vX.Y.Z or {env}-vX.Y.Z-build.",
            }
        )
    elif failed.get("stage") == "pre-task":
        findings.append(
            {
                "level": "fail",
                "check": "pre_task_failed",
                "message": f"{failed.get('name')} failed before build/deploy stages.",
            }
        )

result = "fail" if failed_jobs else "pass"
output = {
    "schema_version": "gitops-summary/v1",
    "type": "gitlab_pipeline_summary",
    "result": result,
    "pipeline": {
        "id": pipeline.get("id"),
        "iid": pipeline.get("iid"),
        "project_id": pipeline.get("project_id"),
        "ref": pipeline.get("ref"),
        "tag": pipeline.get("tag"),
        "status": pipeline.get("status"),
        "source": pipeline.get("source"),
        "sha": pipeline.get("sha"),
        "created_at": pipeline.get("created_at"),
        "duration": pipeline.get("duration"),
        "web_url": pipeline.get("web_url"),
    },
    "jobs": job_summaries,
    "failed_traces": failed_trace_summaries,
    "findings": findings,
}
print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
PY
