#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUBJECT = ROOT / "scan_gitlab_batch_pipelines.py"


def write_executable(path: Path, content: str) -> None:
    path.write_text(content)
    path.chmod(0o755)


def run_scan(remote: str, mode: str = "success") -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        fake_git = root / "git"
        fake_glab = root / "glab"
        write_executable(
            fake_git,
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "[[ \"$1\" == \"-C\" && \"$3\" == \"remote\" && \"$4\" == \"get-url\" && \"$5\" == \"origin\" ]]\n"
            "printf '%s\\n' \"$REMOTE_URL\"\n",
        )
        write_executable(
            fake_glab,
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "if [[ \"$1\" == \"auth\" ]]; then\n"
            "  [[ \"$2\" == \"status\" && \"$3\" == \"--hostname\" && \"$4\" == \"git.example.test\" ]]\n"
            "  exit 0\n"
            "fi\n"
            "[[ \"$1\" == \"api\" && \"$2\" == \"--hostname\" && \"$3\" == \"git.example.test\" ]]\n"
            "endpoint=\"$4\"\n"
            "case \"$endpoint\" in\n"
            "  projects/group%2Fproject)\n"
            "    [[ \"$SCAN_MODE\" != \"preflight-fail\" ]] || exit 1\n"
            "    printf '%s\\n' '{\"id\":9}'\n"
            "    ;;\n"
            "  'projects/9/jobs?per_page=100&search=update-image-tag-batch')\n"
            "    if [[ \"$SCAN_MODE\" == \"empty\" ]]; then printf '%s\\n' '[]'; else\n"
            "      status=success; case \"$SCAN_MODE\" in skipped|failed) status=\"$SCAN_MODE\" ;; esac\n"
            "      printf '[{\"name\":\"update-image-tag-batch\",\"status\":\"%s\",\"pipeline\":{\"id\":77}}]\\n' \"$status\"\n"
            "    fi\n"
            "    ;;\n"
            "  projects/9/pipelines/77)\n"
            "    status=success; case \"$SCAN_MODE\" in failed) status=failed ;; esac\n"
            "    printf '{\"id\":77,\"status\":\"%s\",\"source\":\"pipeline\",\"ref\":\"main\",\"sha\":\"abc\",\"created_at\":\"2026-01-01T00:00:00Z\"}\\n' \"$status\"\n"
            "    ;;\n"
            "  'projects/9/pipelines/77/jobs?per_page=100')\n"
            "    update_status=success; deploy_status=success; if [[ \"$SCAN_MODE\" == \"skipped\" ]]; then update_status=skipped; deploy_status=skipped; fi\n"
            "    printf '[{\"name\":\"update-image-tag-batch\",\"stage\":\"update\",\"status\":\"%s\",\"failure_reason\":null},{\"name\":\"deploy-batch\",\"stage\":\"deploy\",\"status\":\"%s\",\"failure_reason\":null}]\\n' \"$update_status\" \"$deploy_status\"\n"
            "    ;;\n"
            "  *) echo \"unexpected endpoint: $endpoint\" >&2; exit 1 ;;\n"
            "esac\n",
        )
        env = {
            **os.environ,
            "GIT_BIN": str(fake_git),
            "GLAB_BIN": str(fake_glab),
            "REMOTE_URL": remote,
            "SCAN_MODE": mode,
        }
        return subprocess.run([str(SUBJECT), str(root / "repository")], text=True, capture_output=True, env=env)


def test_pipeline_source_comes_from_exact_batch_job_history() -> None:
    result = run_scan("git@git.example.test:group/project.git")
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["result"] == "pass"
    assert payload["pipelines"][0]["source"] == "pipeline"
    assert [job["name"] for job in payload["pipelines"][0]["batch_jobs"]] == [
        "update-image-tag-batch",
        "deploy-batch",
    ]


def test_empty_history_is_inconclusive_from_https_remote() -> None:
    result = run_scan("https://git.example.test/group/project.git", "empty")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["result"] == "inconclusive"
    assert payload["findings"][0]["check"] == "gitlab_batch_job_history_empty"


def test_skipped_batch_jobs_are_warnings_without_a_cause_inference() -> None:
    result = run_scan("git@git.example.test:group/project.git", "skipped")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["result"] == "warning"
    assert {finding["check"] for finding in payload["findings"]} == {
        "batch_update_job_not_successful",
        "batch_deploy_jobs_skipped",
    }


def test_project_preflight_failure_is_inconclusive_and_redacts_remote() -> None:
    result = run_scan("ssh://git@git.example.test/group/project.git", "preflight-fail")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["result"] == "inconclusive"
    assert payload["findings"][0]["check"] == "gitlab_project_unavailable"
    assert "group/project" not in result.stdout


if __name__ == "__main__":
    test_pipeline_source_comes_from_exact_batch_job_history()
    test_empty_history_is_inconclusive_from_https_remote()
    test_skipped_batch_jobs_are_warnings_without_a_cause_inference()
    test_project_preflight_failure_is_inconclusive_and_redacts_remote()
    print("scan_gitlab_batch_pipelines tests passed")
