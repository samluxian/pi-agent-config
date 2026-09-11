#!/usr/bin/env python3

import pathlib
import subprocess
import unittest

SCRIPT = pathlib.Path(__file__).with_name("summarize_terraform_plan.py")


class SummarizeTerraformPlanTest(unittest.TestCase):
    def run_summary(self, text: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(SCRIPT)], input=text, text=True, capture_output=True, check=False
        )

    def test_destroy_first_replacement_stops(self) -> None:
        result = self.run_summary(
            """  # example_resource.backend[\"api\"] must be replaced
-/+ resource \"example_resource\" \"backend\" {
  ~ name = \"old-api\" -> \"new-api\" # forces replacement
}
Plan: 1 to add, 1 to change, 1 to destroy.
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


if __name__ == "__main__":
    unittest.main()
