#!/usr/bin/env python3

import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stderr
from collections import Counter
from unittest.mock import patch
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo


sys.dont_write_bytecode = True
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

    def test_tracked_local_day_records_missing_and_malformed_values(self):
        failures = Counter()

        self.assertIsNone(MODULE.tracked_local_day(None, self.zone, failures, required=True))
        self.assertIsNone(MODULE.tracked_local_day("not-a-timestamp", self.zone, failures, required=True))

        self.assertEqual(failures, Counter({"missing": 1, "malformed": 1}))
        limitations = []
        MODULE.add_timestamp_limitations(limitations, "github", failures)
        self.assertEqual(
            limitations,
            [
                {"type": "github_activity_timestamp_missing", "count": 1},
                {"type": "github_activity_timestamp_malformed", "count": 1},
            ],
        )

    def test_gitlab_event_sort_handles_mixed_timestamp_types(self):
        events = [{"created_at": "2026-07-26T17:00:00Z"}, {"created_at": {"bad": "value"}}]

        ordered = sorted(events, key=MODULE.gitlab_event_timestamp_sort_key)
        failures = Counter()
        days = [
            MODULE.tracked_local_day(event.get("created_at"), self.zone, failures, required=True)
            for event in ordered
        ]

        self.assertEqual(days, [None, "2026-07-27"])
        self.assertEqual(failures, Counter({"malformed": 1}))

    def test_gitlab_project_path_requires_matching_api_id(self):
        valid = {"id": 7, "path_with_namespace": "group/repo"}
        mismatched = {"id": 8, "path_with_namespace": "wrong/repo"}

        self.assertEqual(MODULE.verified_gitlab_project_path(valid, 7), "group/repo")
        self.assertIsNone(MODULE.verified_gitlab_project_path(mismatched, 7))
        self.assertIsNone(MODULE.verified_gitlab_project_path([], 7))

    def test_link_details_require_safe_url_and_positive_typed_identifier(self):
        self.assertTrue(MODULE.has_complete_link_details(12, "https://example.test/item/12", "opened"))
        self.assertTrue(
            MODULE.linked_url_matches(
                "https://gitlab.example/group/repo/-/merge_requests/12",
                "group/repo",
                12,
                "gitlab",
            )
        )
        self.assertFalse(
            MODULE.linked_url_matches(
                "https://gitlab.example/wrong/repo/-/merge_requests/12",
                "group/repo",
                12,
                "gitlab",
            )
        )
        for values in (
            (None, "https://example.test/item/12", "opened"),
            (0, "https://example.test/item/12", "opened"),
            (-1, "https://example.test/item/12", "opened"),
            (12, [], "opened"),
            (12, "javascript:alert(1)", "opened"),
            (12, "https://example.test/item/12", None),
            (True, "https://example.test/item/12", "opened"),
        ):
            with self.subTest(values=values):
                self.assertFalse(MODULE.has_complete_link_details(*values))

    @patch.object(MODULE, "run_json")
    def test_malformed_gitlab_identifiers_are_rejected_without_lookup(self, run_json):
        events = [
            {"project_id": {}, "target_iid": 12, "target_type": "MergeRequest"},
            {"project_id": 7, "target_iid": "12", "target_type": "MergeRequest"},
        ]
        records = [
            {"project_id": {}, "iid": 12},
            {"project_id": 7, "iid": "12"},
        ]

        details, limitations = MODULE.resolve_gitlab_merge_request_details(events, records)

        self.assertEqual(details, {})
        self.assertEqual(
            limitations,
            [{"type": "gitlab_merge_request_detail_lookup_failed", "count": 4}],
        )
        run_json.assert_not_called()

    @patch.object(MODULE, "run_json")
    def test_gitlab_merge_request_event_resolves_api_details(self, run_json):
        run_json.return_value = {
            "project_id": 7,
            "iid": 12,
            "title": "enable deployment pipeline",
            "state": "merged",
            "web_url": "https://gitlab.example/group/repo/-/merge_requests/12",
        }
        events = [{"project_id": 7, "target_iid": 12, "target_type": "MergeRequest"}]

        details, limitations = MODULE.resolve_gitlab_merge_request_details(events, [])

        self.assertEqual(limitations, [])
        self.assertEqual(details[(7, 12)]["state"], "merged")
        self.assertEqual(
            details[(7, 12)]["web_url"],
            "https://gitlab.example/group/repo/-/merge_requests/12",
        )
        run_json.assert_called_once_with(["glab", "api", "projects/7/merge_requests/12"])

    @patch.object(MODULE, "run_json")
    def test_incomplete_gitlab_list_record_resolves_api_details(self, run_json):
        run_json.return_value = {
            "project_id": 7,
            "iid": 12,
            "title": "enable deployment pipeline",
            "state": "opened",
            "web_url": "https://gitlab.example/group/repo/-/merge_requests/12",
        }
        records = [{"project_id": 7, "iid": 12, "state": None, "web_url": None}]

        details, limitations = MODULE.resolve_gitlab_merge_request_details([], records)

        self.assertEqual(limitations, [])
        self.assertEqual(details[(7, 12)]["state"], "opened")
        self.assertEqual(
            details[(7, 12)]["web_url"],
            "https://gitlab.example/group/repo/-/merge_requests/12",
        )
        run_json.assert_called_once_with(["glab", "api", "projects/7/merge_requests/12"])

    @patch.object(MODULE, "run_json")
    def test_gitlab_detail_without_matching_iid_is_rejected(self, run_json):
        run_json.return_value = {
            "title": "enable deployment pipeline",
            "state": "merged",
            "web_url": "https://gitlab.example/group/repo/-/merge_requests/12",
        }
        events = [{"project_id": 7, "target_iid": 12, "target_type": "MergeRequest"}]

        details, limitations = MODULE.resolve_gitlab_merge_request_details(events, [])

        self.assertEqual(details, {})
        self.assertEqual(
            limitations,
            [{"type": "gitlab_merge_request_detail_lookup_failed", "count": 1}],
        )

    @patch.object(MODULE, "run_json")
    def test_gitlab_detail_with_mismatched_project_is_rejected(self, run_json):
        run_json.return_value = {
            "project_id": 8,
            "iid": 12,
            "state": "merged",
            "web_url": "https://gitlab.example/other/repo/-/merge_requests/12",
        }
        events = [{"project_id": 7, "target_iid": 12, "target_type": "MergeRequest"}]

        details, limitations = MODULE.resolve_gitlab_merge_request_details(events, [])

        self.assertEqual(details, {})
        self.assertEqual(
            limitations,
            [{"type": "gitlab_merge_request_detail_lookup_failed", "count": 1}],
        )

    @patch.object(MODULE, "run_json")
    def test_malformed_gitlab_detail_response_is_rejected(self, run_json):
        run_json.return_value = []
        events = [{"project_id": 7, "target_iid": 12, "target_type": "MergeRequest"}]

        details, limitations = MODULE.resolve_gitlab_merge_request_details(events, [])

        self.assertEqual(details, {})
        self.assertEqual(
            limitations,
            [{"type": "gitlab_merge_request_detail_lookup_failed", "count": 1}],
        )

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
                "web_url": "https://gitlab.example/group/repo/-/merge_requests/12",
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
        evidence = days["2026-07-27"]["evidence"]
        self.assertEqual([item["action"] for item in evidence], ["opened", "merged"])
        self.assertEqual(
            [item["url"] for item in evidence],
            [
                "https://gitlab.example/group/repo/-/merge_requests/12",
                "https://gitlab.example/group/repo/-/merge_requests/12",
            ],
        )
        self.assertEqual(counts["2026-07-27"]["merge_request_merged"], 1)

    def test_incomplete_gitlab_list_record_is_not_classified_as_merge_request(self):
        days = {"2026-07-27": {"actions": {}, "projects": [], "evidence": [], "truncated": 0}}
        seen = {"2026-07-27": set()}
        counts = {"2026-07-27": Counter()}
        projects = {"2026-07-27": set()}
        records = [
            {
                "project_id": 7,
                "iid": 12,
                "title": "enable deployment pipeline",
                "state": None,
                "web_url": None,
                "created_at": "2026-07-26T17:00:00Z",
                "merged_at": None,
                "closed_at": None,
                "updated_at": "2026-07-26T17:00:00Z",
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

        item = days["2026-07-27"]["evidence"][0]
        self.assertEqual(item["kind"], "event")
        self.assertNotIn("url", item)
        self.assertNotIn("state", item)
        self.assertEqual(counts["2026-07-27"]["event_opened"], 1)

    def test_gitlab_merge_request_with_unverified_project_is_downgraded(self):
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
                "web_url": "https://gitlab.example/group/repo/-/merge_requests/12",
                "created_at": "2026-07-26T17:00:00Z",
                "merged_at": None,
                "closed_at": None,
                "updated_at": "2026-07-26T17:00:00Z",
            }
        ]

        MODULE.add_gitlab_work_items(
            records,
            "merge_request",
            {7: "7"},
            days,
            seen,
            counts,
            projects,
            self.zone,
            40,
            verified_project_ids=set(),
        )

        item = days["2026-07-27"]["evidence"][0]
        self.assertEqual(item["kind"], "event")
        self.assertNotIn("url", item)
        self.assertNotIn("iid", item)

    def test_github_work_item_preserves_api_link_number_and_state(self):
        days = {"2026-07-27": {"actions": {}, "projects": [], "evidence": [], "truncated": 0}}
        seen = {"2026-07-27": set()}
        counts = {"2026-07-27": Counter()}
        projects = {"2026-07-27": set()}

        MODULE.add_github_item(
            occurred_at="2026-07-26T17:00:00Z",
            project="group/repo",
            kind="pull_request",
            action="opened",
            title="enable deployment pipeline",
            count=1,
            days=days,
            seen=seen,
            action_counts=counts,
            project_sets=projects,
            zone=self.zone,
            max_items=40,
            url="https://github.example/group/repo/pull/12",
            number=12,
            state="OPEN",
        )

        self.assertEqual(
            days["2026-07-27"]["evidence"][0],
            {
                "provider": "github",
                "project": "group/repo",
                "kind": "pull_request",
                "action": "opened",
                "title": "enable deployment pipeline",
                "count": 1,
                "url": "https://github.example/group/repo/pull/12",
                "number": 12,
                "state": "OPEN",
            },
        )

    @patch.object(MODULE, "run_json")
    def test_incomplete_github_pull_request_is_downgraded_and_reported(self, run_json):
        run_json.side_effect = [
            {"login": "sam", "name": "Sam", "html_url": "https://github.com/sam"},
            {
                "data": {
                    "user": {
                        "contributionsCollection": {
                            "restrictedContributionsCount": 0,
                            "commitContributionsByRepository": [],
                            "pullRequestContributions": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [
                                    {
                                        "occurredAt": "2026-07-26T17:00:00Z",
                                        "pullRequest": {
                                            "number": 12,
                                            "title": "enable deployment pipeline",
                                            "state": "OPEN",
                                            "url": None,
                                            "repository": {"nameWithOwner": "group/repo"},
                                        },
                                    }
                                ],
                            },
                            "pullRequestReviewContributions": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [],
                            },
                            "issueContributions": {"pageInfo": {"hasNextPage": False}, "nodes": []},
                        }
                    }
                }
            },
        ]

        report = MODULE.collect_github(date(2026, 7, 27), date(2026, 7, 27), self.zone, 40)

        self.assertFalse(report["evidence_complete"])
        self.assertIn(
            {"type": "github_pull_request_details_incomplete", "count": 1},
            report["limitations"],
        )
        item = report["days"]["2026-07-27"]["evidence"][0]
        self.assertEqual(item["kind"], "event")
        self.assertNotIn("url", item)

    @patch.object(MODULE, "run_json")
    def test_malformed_github_pull_request_payload_is_downgraded_and_reported(self, run_json):
        run_json.side_effect = [
            {"login": "sam", "name": "Sam", "html_url": "https://github.com/sam"},
            {
                "data": {
                    "user": {
                        "contributionsCollection": {
                            "restrictedContributionsCount": 0,
                            "commitContributionsByRepository": [],
                            "pullRequestContributions": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [
                                    {
                                        "occurredAt": "2026-07-26T17:00:00Z",
                                        "pullRequest": "malformed",
                                    }
                                ],
                            },
                            "pullRequestReviewContributions": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [],
                            },
                            "issueContributions": {"pageInfo": {"hasNextPage": False}, "nodes": []},
                        }
                    }
                }
            },
        ]

        report = MODULE.collect_github(date(2026, 7, 27), date(2026, 7, 27), self.zone, 40)

        self.assertFalse(report["evidence_complete"])
        self.assertIn(
            {"type": "github_pull_request_details_incomplete", "count": 1},
            report["limitations"],
        )
        self.assertIn(
            {"type": "github_contribution_payload_malformed", "count": 1},
            report["limitations"],
        )
        self.assertEqual(report["days"]["2026-07-27"]["evidence"][0]["kind"], "event")

    def test_bounded_add_canonicalizes_unhashable_api_fields(self):
        day = {"evidence": [], "truncated": 0}
        seen = set()
        first = {
            "provider": "gitlab",
            "project": "group/repo",
            "kind": "issue",
            "action": "opened",
            "title": {"b": 2, "a": 1},
            "iid": {"value": 12},
        }
        duplicate = {**first, "title": {"a": 1, "b": 2}}

        MODULE.bounded_add(day, first, seen, 10)
        MODULE.bounded_add(day, duplicate, seen, 10)

        self.assertEqual(len(day["evidence"]), 1)

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

    @patch.object(MODULE, "glab_list")
    @patch.object(MODULE, "run_json")
    def test_malformed_gitlab_event_fields_are_downgraded_and_reported(self, run_json, glab_list):
        run_json.side_effect = [
            {"id": 1, "username": "sam", "name": "Sam"},
            {"id": 7, "path_with_namespace": "group/repo"},
        ]
        glab_list.side_effect = [
            [
                {
                    "project_id": 7,
                    "created_at": "2026-07-26T17:00:00Z",
                    "push_data": ["malformed"],
                    "action_name": ["malformed"],
                    "target_type": {"malformed": True},
                    "target_iid": {"malformed": True},
                }
            ],
            [],
            [],
        ]

        report = MODULE.collect_gitlab(date(2026, 7, 27), date(2026, 7, 27), self.zone, 40)

        self.assertIn(
            {"type": "gitlab_event_payload_malformed", "count": 4},
            report["limitations"],
        )
        self.assertEqual(report["days"]["2026-07-27"]["evidence"][0]["kind"], "event")

    @patch.object(MODULE, "run_json", return_value=[])
    def test_malformed_gitlab_identity_raises_controlled_error(self, _run_json):
        with self.assertRaisesRegex(MODULE.CollectorError, "unexpected shape"):
            MODULE.collect_gitlab(date(2026, 8, 1), date(2026, 8, 1), self.zone, 40)

    @patch.object(MODULE, "run_json", return_value=[])
    def test_malformed_github_identity_raises_controlled_error(self, _run_json):
        with self.assertRaisesRegex(MODULE.CollectorError, "unexpected shape"):
            MODULE.collect_github(date(2026, 8, 1), date(2026, 8, 1), self.zone, 40)

    @patch.object(MODULE, "run_json")
    def test_malformed_github_commit_count_is_skipped_and_reported(self, run_json):
        run_json.side_effect = [
            {"login": "sam", "name": "Sam", "html_url": "https://github.com/sam"},
            {
                "data": {
                    "user": {
                        "contributionsCollection": {
                            "restrictedContributionsCount": 0,
                            "commitContributionsByRepository": [
                                {
                                    "repository": {"nameWithOwner": "group/repo"},
                                    "contributions": {
                                        "pageInfo": {"hasNextPage": False},
                                        "nodes": [
                                            {
                                                "occurredAt": "2026-07-26T17:00:00Z",
                                                "commitCount": "2",
                                            }
                                        ],
                                    },
                                }
                            ],
                            "pullRequestContributions": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [],
                            },
                            "pullRequestReviewContributions": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [],
                            },
                            "issueContributions": {"pageInfo": {"hasNextPage": False}, "nodes": []},
                        }
                    }
                }
            },
        ]

        report = MODULE.collect_github(date(2026, 7, 27), date(2026, 7, 27), self.zone, 40)

        self.assertIn(
            {"type": "github_commit_payload_malformed", "count": 1},
            report["limitations"],
        )
        self.assertEqual(report["days"]["2026-07-27"]["evidence"], [])

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

    def test_skill_contract_contains_fixed_markdown_shape(self):
        skill = SCRIPT.parent.parent.joinpath("SKILL.md").read_text(encoding="utf-8")
        for marker in (
            "## 工作摘要與 MR",
            "### YYYY-MM-DD（<使用者提供且可解析的日期標籤>）",
            "<authenticated API URL>",
            "已合併／進行中／已關閉",
            "沒有相對應 MR/PR",
            "fallback identity, platform, and window",
            "此日期沒有足夠 activity evidence，未補寫無證據內容。",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, skill)

    def test_timezone_defaults_to_asia_taipei(self):
        args = MODULE.build_parser().parse_args(
            ["--gitlab-from", "2026-07-27", "--gitlab-to", "2026-07-31"]
        )
        self.assertEqual(args.timezone, "Asia/Taipei")

    def test_explicit_timezone_overrides_default(self):
        args = MODULE.build_parser().parse_args(
            [
                "--gitlab-from",
                "2026-07-27",
                "--gitlab-to",
                "2026-07-31",
                "--timezone",
                "UTC",
            ]
        )
        self.assertEqual(args.timezone, "UTC")

    def test_unknown_timezone_is_rejected(self):
        argv = [
            "collect_activity.py",
            "--gitlab-from",
            "2026-07-27",
            "--gitlab-to",
            "2026-07-31",
            "--timezone",
            "Not/A_Timezone",
        ]
        with patch.object(MODULE.sys, "argv", argv), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                MODULE.main()
        self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
