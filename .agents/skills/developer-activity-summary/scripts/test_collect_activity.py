#!/usr/bin/env python3

import importlib.util
import io
import unittest
from contextlib import redirect_stderr
from collections import Counter
from unittest.mock import patch
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo


SCRIPT = Path(__file__).with_name("collect_activity.py")
SPEC = importlib.util.spec_from_file_location("collect_activity", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.zone = ZoneInfo("Asia/Taipei")

    def test_utc_bounds_are_inclusive_local_dates(self):
        self.assertEqual(
            MODULE.utc_bounds(date(2026, 7, 27), date(2026, 7, 31), self.zone),
            ("2026-07-26T16:00:00Z", "2026-07-31T16:00:00Z"),
        )

    def test_local_day_uses_requested_timezone(self):
        self.assertEqual(MODULE.local_day("2026-07-26T18:00:00Z", self.zone), "2026-07-27")

    def test_gitlab_milestones_preserve_opened_and_merged_meaning(self):
        days = {"2026-07-27": {"actions": {}, "projects": [], "evidence": [], "truncated": 0}}
        seen = {"2026-07-27": set()}
        counts = {"2026-07-27": Counter()}
        projects = {"2026-07-27": set()}
        records = [
            {
                "project_id": 7,
                "iid": 12,
                "title": "enable deployment pipeline",
                "state": "merged",
                "created_at": "2026-07-26T17:00:00Z",
                "merged_at": "2026-07-27T03:00:00Z",
                "closed_at": None,
                "updated_at": "2026-07-27T03:00:00Z",
            }
        ]
        MODULE.add_gitlab_work_items(
            records,
            "merge_request",
            {7: "group/repo"},
            days,
            seen,
            counts,
            projects,
            self.zone,
            40,
        )
        self.assertEqual([item["action"] for item in days["2026-07-27"]["evidence"]], ["opened", "merged"])
        self.assertEqual(counts["2026-07-27"]["merge_request_merged"], 1)

    def test_bounded_add_reports_truncation(self):
        day = {"evidence": [], "truncated": 0}
        seen = set()
        MODULE.bounded_add(
            day,
            {"provider": "gitlab", "project": "g/r", "kind": "event", "action": "opened", "title": "one"},
            seen,
            1,
        )
        MODULE.bounded_add(
            day,
            {"provider": "gitlab", "project": "g/r", "kind": "event", "action": "opened", "title": "two"},
            seen,
            1,
        )
        self.assertEqual(len(day["evidence"]), 1)
        self.assertEqual(day["truncated"], 1)

    @patch.object(MODULE, "run_json")
    def test_github_restricted_activity_marks_evidence_incomplete(self, run_json):
        run_json.side_effect = [
            {"login": "sam", "name": "Sam", "html_url": "https://github.com/sam"},
            {
                "data": {
                    "user": {
                        "contributionsCollection": {
                            "restrictedContributionsCount": 2,
                            "commitContributionsByRepository": [],
                            "pullRequestContributions": {"pageInfo": {"hasNextPage": False}, "nodes": []},
                            "pullRequestReviewContributions": {"pageInfo": {"hasNextPage": False}, "nodes": []},
                            "issueContributions": {"pageInfo": {"hasNextPage": False}, "nodes": []},
                        }
                    }
                }
            },
        ]
        report = MODULE.collect_github(date(2026, 8, 1), date(2026, 8, 2), self.zone, 40)
        self.assertFalse(report["evidence_complete"])
        self.assertEqual(report["limitations"], [{"type": "restricted_contributions", "count": 2}])

    def test_timezone_is_required_by_cli(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            MODULE.build_parser().parse_args(["--gitlab-from", "2026-07-27", "--gitlab-to", "2026-07-31"])


if __name__ == "__main__":
    unittest.main()
