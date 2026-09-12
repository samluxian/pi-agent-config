#!/usr/bin/env python3

import json
import pathlib
import subprocess
import unittest

SCRIPT = pathlib.Path(__file__).parents[1] / "summarize_manifest_json.py"


class SummarizeManifestJsonTest(unittest.TestCase):
    def run_summary(self, text: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(SCRIPT), *args], input=text, text=True, capture_output=True, check=False
        )

    def parsed(self, text: str, *args: str) -> dict:
        result = self.run_summary(text, *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_indexes_unknown_kinds_and_projects_scaled_object(self) -> None:
        result = self.parsed(
            """apiVersion: example.test/v1
kind: ExamplePolicy
metadata:
  name: sample-policy
  namespace: sample
spec:
  opaque: do-not-project
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: sample-scaler
  namespace: sample
spec:
  scaleTargetRef:
    name: sample-workload
  minReplicaCount: 1
  maxReplicaCount: 4
  triggers:
    - type: cpu
      metadata:
        value: "70"
"""
        )
        self.assertTrue(result["complete"])
        for key in (
            "schema_version",
            "type",
            "complete",
            "result",
            "input",
            "document_count",
            "resource_counts",
            "resources",
            "findings",
        ):
            self.assertIn(key, result)
        self.assertEqual(result["document_count"], 2)
        self.assertEqual(
            [item["kind"] for item in result["resource_index"]],
            ["ExamplePolicy", "ScaledObject"],
        )
        self.assertEqual(len(result["resources"]), 1)
        self.assertEqual(result["resources"][0]["kind"], "ScaledObject")
        self.assertEqual(result["resources"][0]["max_replicas"], 4)
        self.assertEqual(result["resources"][0]["triggers"][0]["metadata_keys"], ["value"])
        self.assertNotIn('"70"', json.dumps(result))
        self.assertNotIn("opaque", json.dumps(result))

    def test_secret_and_config_values_are_not_emitted(self) -> None:
        result = self.parsed(
            """apiVersion: v1
kind: Secret
metadata:
  name: sample-secret
data:
  password: c2VudGluZWw=
stringData:
  token: do-not-emit
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: sample-config
data:
  endpoint: https://example.test/private-value
"""
        )
        serialized = json.dumps(result)
        self.assertNotIn("c2VudGluZWw=", serialized)
        self.assertNotIn("do-not-emit", serialized)
        self.assertNotIn("private-value", serialized)
        self.assertEqual(result["resources"][0]["data_keys"], ["password", "token"])
        self.assertEqual(result["resources"][1]["data_keys"], ["endpoint"])

    def test_extracts_hooks_and_manifests_from_helm_dry_run(self) -> None:
        result = self.parsed(
            """NAME: sample
NAMESPACE: sample
STATUS: pending-install
HOOKS:
---
apiVersion: batch/v1
kind: Job
metadata:
  name: sample-hook
  annotations:
    helm.sh/hook: pre-install
spec: {}
MANIFEST:
---
apiVersion: v1
kind: Service
metadata:
  name: sample-service
spec:
  ports:
    - port: 80
NOTES:
Do not parse this prose as YAML.
""",
            "--helm-output",
        )
        self.assertTrue(result["complete"])
        self.assertEqual(result["resource_counts"], {"Job": 1, "Service": 1})
        self.assertEqual(result["document_count"], 2)

    def test_projection_limit_keeps_complete_identity_index(self) -> None:
        result = self.parsed(
            """apiVersion: v1
kind: Service
metadata:
  name: first
spec: {}
---
apiVersion: v1
kind: Service
metadata:
  name: second
spec: {}
""",
            "--max-resources",
            "1",
        )
        self.assertTrue(result["complete"])
        self.assertFalse(result["content_complete"])
        self.assertTrue(result["resources_truncated"])
        self.assertEqual(result["projected_resources_omitted"], 1)
        self.assertEqual(len(result["resource_index"]), 2)
        self.assertEqual(len(result["resources"]), 1)

    def test_findings_cover_resources_omitted_from_projection(self) -> None:
        result = self.parsed(
            """apiVersion: v1
kind: Service
metadata:
  name: first
spec: {}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: omitted-risk
spec:
  template:
    spec:
      containers:
        - name: app
          image: example.test/app:latest
""",
            "--max-resources",
            "1",
        )
        self.assertTrue(result["complete"])
        self.assertFalse(result["content_complete"])
        self.assertEqual(result["result"], "fail")
        self.assertGreater(result["findings_total"], 0)
        self.assertEqual(result["findings_omitted"], 0)
        self.assertTrue(
            any(finding["resource"] == "Deployment/omitted-risk" for finding in result["findings"])
        )

    def test_findings_limit_marks_summary_incomplete(self) -> None:
        manifests = []
        for index in range(101):
            manifests.append(
                f"""apiVersion: apps/v1
kind: Deployment
metadata:
  name: workload-{index}
spec:
  template:
    spec:
      containers:
        - name: app
          image: example.test/app:latest
"""
            )
        result = self.parsed("---\n".join(manifests), "--max-resources", "200")
        self.assertFalse(result["complete"])
        self.assertEqual(result["result"], "incomplete")
        self.assertTrue(result["findings_truncated"])
        self.assertEqual(result["findings_total"], 505)
        self.assertEqual(len(result["findings"]), 500)
        self.assertEqual(result["findings_omitted"], 5)

    def test_missing_identity_is_incomplete(self) -> None:
        result = self.parsed(
            """apiVersion: v1
kind: Service
metadata: {}
spec: {}
"""
        )
        self.assertFalse(result["complete"])
        self.assertEqual(result["result"], "incomplete")

    def test_empty_input_is_incomplete(self) -> None:
        result = self.parsed("")
        self.assertFalse(result["complete"])
        self.assertEqual(result["document_count"], 0)

    def test_malformed_yaml_fails(self) -> None:
        result = self.run_summary("apiVersion: v1\nkind: [\n")
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
