#!/usr/bin/env python3
"""Read-only summary of recent GitLab batch deployment pipelines for a local repository."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlparse

MAX_BATCH_PIPELINES = 20
BATCH_UPDATE_JOB = "update-image-tag-batch"
BATCH_JOB_NAMES = {
    BATCH_UPDATE_JOB,
    "deploy-batch",
    "deploy-batch-newaile2",
}


def emit(payload: dict[str, object]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def inconclusive(check: str, message: str) -> int:
    emit(
        {
            "schema_version": "gitops-summary/v1",
            "type": "gitlab_batch_pipeline_scan",
            "result": "inconclusive",
            "findings": [{"level": "inconclusive", "check": check, "message": message}],
        }
    )
    return 1


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def parse_remote(remote: str) -> tuple[str, str] | None:
    remote = remote.strip()
    if not remote:
        return None

    scp_style = None if "://" in remote else re.fullmatch(r"(?:[^@/:]+@)?([^:/]+):/?(.+)", remote)
    if scp_style:
        host, project_path = scp_style.groups()
    else:
        parsed = urlparse(remote)
        if not parsed.scheme or not parsed.hostname:
            return None
        host = parsed.hostname
        project_path = parsed.path.lstrip("/")

    project_path = project_path.removesuffix(".git").strip("/")
    if not host or not project_path or any(part in {"", ".", ".."} for part in project_path.split("/")):
        return None
    return host, project_path


def glab_command(glab: str, host: str, endpoint: str) -> list[str]:
    return [glab, "api", "--hostname", host, endpoint]


def parse_json_list(result: subprocess.CompletedProcess[str], unavailable: str, invalid: str) -> list[dict[str, object]] | None:
    if result.returncode != 0:
        inconclusive(unavailable, "GitLab API query failed.")
        return None
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        inconclusive(invalid, "GitLab API query returned invalid JSON.")
        return None
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        inconclusive(invalid, "GitLab API query returned an unexpected response.")
        return None
    return payload


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Usage: scan_gitlab_batch_pipelines.py [repository-path]", file=sys.stderr)
        return 2

    repository = Path(argv[1] if len(argv) == 2 else ".")
    git = os.environ.get("GIT_BIN") or shutil.which("git")
    glab = os.environ.get("GLAB_BIN") or shutil.which("glab")
    if not git:
        return inconclusive("git_unavailable", "git is required to resolve the local repository remote.")
    if not glab:
        return inconclusive("glab_unavailable", "glab is required for the GitLab API query.")

    remote_result = run([git, "-C", str(repository), "remote", "get-url", "origin"])
    if remote_result.returncode != 0:
        return inconclusive("git_remote_unavailable", "Cannot read origin from the requested local repository.")

    resolved = parse_remote(remote_result.stdout)
    if not resolved:
        return inconclusive("git_remote_unrecognized", "Origin is not a supported SSH or HTTPS GitLab remote.")
    host, project_path = resolved
    encoded_project = quote(project_path, safe="")

    auth_result = run([glab, "auth", "status", "--hostname", host])
    if auth_result.returncode != 0:
        return inconclusive("glab_auth_unavailable", "glab is not authenticated for the remote GitLab host.")

    project_result = run(glab_command(glab, host, f"projects/{encoded_project}"))
    if project_result.returncode != 0:
        return inconclusive(
            "gitlab_project_unavailable",
            "GitLab project preflight failed; verify the parsed origin path and API access before querying jobs.",
        )
    try:
        project = json.loads(project_result.stdout)
        project_id = project["id"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return inconclusive("gitlab_project_invalid", "GitLab project preflight returned an unexpected response.")

    history_result = run(
        glab_command(glab, host, f"projects/{project_id}/jobs?per_page=100&search={BATCH_UPDATE_JOB}")
    )
    history = parse_json_list(history_result, "gitlab_job_history_unavailable", "gitlab_job_history_invalid")
    if history is None:
        return 1

    update_jobs = [job for job in history if job.get("name") == BATCH_UPDATE_JOB]
    if not update_jobs:
        return inconclusive(
            "gitlab_batch_job_history_empty",
            "No recent exact update-image-tag-batch job was found; no target event is available to validate source rules.",
        )

    findings: list[dict[str, str]] = []
    summaries: list[dict[str, object]] = []
    seen_pipeline_ids: set[int] = set()
    for update_job in update_jobs:
        pipeline = update_job.get("pipeline")
        pipeline_id = pipeline.get("id") if isinstance(pipeline, dict) else None
        if not isinstance(pipeline_id, int) or pipeline_id in seen_pipeline_ids:
            continue
        seen_pipeline_ids.add(pipeline_id)
        if len(summaries) >= MAX_BATCH_PIPELINES:
            break

        pipeline_result = run(glab_command(glab, host, f"projects/{project_id}/pipelines/{pipeline_id}"))
        if pipeline_result.returncode != 0:
            return inconclusive("gitlab_pipeline_unavailable", "GitLab could not read a batch job's pipeline metadata.")
        jobs_result = run(glab_command(glab, host, f"projects/{project_id}/pipelines/{pipeline_id}/jobs?per_page=100"))
        batch_jobs = parse_json_list(jobs_result, "gitlab_pipeline_jobs_unavailable", "gitlab_pipeline_jobs_invalid")
        if batch_jobs is None:
            return 1
        try:
            pipeline_metadata = json.loads(pipeline_result.stdout)
            if not isinstance(pipeline_metadata, dict):
                raise TypeError
        except (json.JSONDecodeError, TypeError):
            return inconclusive("gitlab_pipeline_invalid", "GitLab pipeline metadata returned an unexpected response.")

        batch_job_summaries = [
            {
                "name": job.get("name"),
                "stage": job.get("stage"),
                "status": job.get("status"),
                "failure_reason": job.get("failure_reason"),
            }
            for job in batch_jobs
            if job.get("name") in BATCH_JOB_NAMES
        ]
        summaries.append(
            {
                "id": pipeline_id,
                "status": pipeline_metadata.get("status"),
                "source": pipeline_metadata.get("source"),
                "ref": pipeline_metadata.get("ref"),
                "sha": pipeline_metadata.get("sha"),
                "created_at": pipeline_metadata.get("created_at"),
                "batch_jobs": batch_job_summaries,
            }
        )

        if update_job.get("status") in {"failed", "skipped"}:
            findings.append(
                {
                    "level": "warning",
                    "check": "batch_update_job_not_successful",
                    "message": "A batch image-tag update job did not succeed; inspect its pipeline and bounded trace.",
                }
            )
        deploy_jobs = [job for job in batch_job_summaries if job.get("name") != BATCH_UPDATE_JOB]
        if deploy_jobs and all(job.get("status") == "skipped" for job in deploy_jobs):
            findings.append(
                {
                    "level": "warning",
                    "check": "batch_deploy_jobs_skipped",
                    "message": "All discovered batch deployment jobs were skipped; inspect pipeline variables and rules.",
                }
            )

    if not summaries:
        return inconclusive("gitlab_batch_pipeline_invalid", "Batch job history contained no usable pipeline identifiers.")

    emit(
        {
            "schema_version": "gitops-summary/v1",
            "type": "gitlab_batch_pipeline_scan",
            "result": "warning" if findings else "pass",
            "project": {"id": project_id, "host": host},
            "pipelines": summaries,
            "findings": findings,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
