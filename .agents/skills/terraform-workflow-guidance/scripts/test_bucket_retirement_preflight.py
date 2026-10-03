#!/usr/bin/env python3
"""Verify the Google Cloud Storage bucket-retirement preflight contract."""

from __future__ import annotations

import unittest
from pathlib import Path

RUNBOOK = Path(__file__).resolve().parents[1] / "references" / "beginner-runbook.md"

CASES = {
    "abandon": (
        '`deletion_policy = "ABANDON"`',
        "release state ownership without deleting the live bucket",
    ),
    "empty_bucket": (
        "Bucket is expected to be empty",
        "independently confirm it is empty",
    ),
    "approved_object_deletion": (
        "Bucket has objects and their deletion is explicitly approved",
        "`force_destroy = true`",
    ),
    "retained_objects": (
        "Bucket has objects that must be retained",
        "Do not set `force_destroy = true` or remove the resource",
    ),
}


class BucketRetirementPreflightTest(unittest.TestCase):
    def setUp(self) -> None:
        self.content = RUNBOOK.read_text(encoding="utf-8")

    def test_required_cases_are_documented(self) -> None:
        for case, required_text in CASES.items():
            with self.subTest(case=case):
                for text in required_text:
                    self.assertIn(text, self.content)

    def test_final_destroy_requires_a_fresh_exact_plan(self) -> None:
        self.assertIn("After each policy update, require a fresh plan.", self.content)
        self.assertIn("must name\nthe exact bucket address", self.content)


if __name__ == "__main__":
    unittest.main()
