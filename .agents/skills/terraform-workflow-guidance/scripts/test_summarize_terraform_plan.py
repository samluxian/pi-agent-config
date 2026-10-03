#!/usr/bin/env python3

import json
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("summarize_terraform_plan.py")


class SummarizeTerraformPlanTest(unittest.TestCase):
    def run_summary(self, text: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(SCRIPT), *args], input=text, text=True, capture_output=True, check=False
        )

    def run_json(self, text: str) -> dict:
        result = self.run_summary(text, "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_destroy_first_replacement_stops(self) -> None:
        result = self.run_summary(
            """  # example_resource.backend[\"api\"] must be replaced
-/+ resource \"example_resource\" \"backend\" {
  ~ name = \"old-api\" -> \"new-api\" # forces replacement
}
Plan: 1 to add, 0 to change, 1 to destroy.
"""
        )
        self.assertEqual(result.returncode, 3)
        self.assertIn("replacement_order=-/+", result.stdout)
        self.assertIn("review=STOP", result.stdout)

    def test_create_first_replacement_passes(self) -> None:
        result = self.run_summary(
            """  # example_resource.backend[\"api\"] must be replaced
+/- resource \"example_resource\" \"backend\" {
  ~ name = \"old-api\" -> \"new-api\" # forces replacement
}
  # example_route.main will be updated in-place
  ~ resource \"example_route\" \"main\" {
    ~ default_service = \"old-api\" -> (known after apply)
  }
Plan: 1 to add, 1 to change, 1 to destroy.
"""
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("replacement_order=+/-", result.stdout)
        self.assertIn("summary=import:0 add:1 change:1 destroy:1", result.stdout)

    def test_output_is_bounded(self) -> None:
        text = "\n".join(f"unrelated line {index}" for index in range(1000))
        result = self.run_summary(text)
        self.assertLessEqual(len(result.stdout.splitlines()), 120)
        self.assertIn("review=INCOMPLETE", result.stdout)

    def test_json_no_changes_is_complete(self) -> None:
        result = self.run_json("No changes. Your infrastructure matches the configuration.\n")
        self.assertTrue(result["complete"])
        self.assertEqual(result["result"], "noop")
        self.assertEqual(result["counts"]["destroy"], 0)

    def test_json_covers_create_update_destroy_and_import(self) -> None:
        result = self.run_json(
            """  # example_resource.created will be created
  # example_resource.updated will be updated in-place
  # example_resource.destroyed will be destroyed
  # example_resource.imported will be imported
Plan: 1 to import, 1 to add, 1 to change, 1 to destroy.
"""
        )
        self.assertTrue(result["complete"])
        self.assertEqual(
            [resource["action"] for resource in result["resources"]],
            ["create", "update", "destroy", "import"],
        )
        self.assertEqual(result["counts"]["import"], 1)

    def test_json_rejects_summary_that_disagrees_with_resource_headers(self) -> None:
        result = self.run_json(
            """  # example_resource.created will be created
Plan: 0 to add, 0 to change, 0 to destroy.
"""
        )
        self.assertFalse(result["complete"])
        self.assertFalse(result["summary_matches_resources"])
        self.assertEqual(result["result"], "incomplete")

    def test_json_missing_replacement_order_is_incomplete(self) -> None:
        result = self.run_json(
            """  # example_resource.backend must be replaced
Plan: 1 to add, 0 to change, 1 to destroy.
"""
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["missing_replacement_order"], ["example_resource.backend"])

    def test_json_redacts_secret_like_warning(self) -> None:
        result = self.run_json(
            """Warning: password=do-not-emit
Plan: 0 to add, 0 to change, 0 to destroy.
"""
        )
        self.assertTrue(result["complete"])
        self.assertEqual(result["warnings"], [])
        self.assertEqual(result["redacted_line_count"], 1)
        self.assertNotIn("do-not-emit", json.dumps(result))

    def test_json_strips_ansi_and_preserves_safe_warnings(self) -> None:
        result = self.run_json(
            "\x1b[33mWarning: synthetic warning\x1b[0m\n"
            "Plan: 0 to add, 0 to change, 0 to destroy.\n"
        )
        self.assertTrue(result["complete"])
        self.assertEqual(result["warnings"], ["Warning: synthetic warning"])

    def test_plan_file_matches_stdin_and_default_output_stays_text(self) -> None:
        text = "No changes. Your infrastructure matches the configuration.\n"
        stdin_result = self.run_summary(text)
        with tempfile.TemporaryDirectory() as directory:
            plan = pathlib.Path(directory) / "plan.txt"
            plan.write_text(text, encoding="utf-8")
            file_result = subprocess.run(
                [str(SCRIPT), "--plan", str(plan)],
                text=True,
                capture_output=True,
                check=False,
            )
        self.assertEqual(file_result.returncode, 0)
        self.assertEqual(file_result.stdout, stdin_result.stdout)
        self.assertFalse(file_result.stdout.lstrip().startswith("{"))

    def test_json_destroy_first_keeps_stop_evidence_with_zero_exit(self) -> None:
        result = self.run_summary(
            """  # example_resource.backend must be replaced
-/+ resource "example_resource" "backend" {
}
Plan: 1 to add, 0 to change, 1 to destroy.
""",
            "--json",
        )
        self.assertEqual(result.returncode, 0)
        parsed = json.loads(result.stdout)
        self.assertEqual(parsed["result"], "stop")
        self.assertEqual(parsed["unsafe_replacements"], ["example_resource.backend"])


if __name__ == "__main__":
    unittest.main()
