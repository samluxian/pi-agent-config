#!/usr/bin/env python3
"""Summarize kubectl diff output as compact JSON.

The script keeps resource names, changed fields, immutable-selector hints, and a
small number of safe snippets. It intentionally does not echo the full diff.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


DIFF_HEADER = re.compile(r"^diff -u -N (?P<old>\S+) (?P<new>\S+)")
RESOURCE_FROM_PATH = re.compile(r"/(?P<kind>[^/]+)/(?P<namespace>[^/]+)/(?P<name>[^/\s]+)$")
FIELD_LINE = re.compile(r"^[+-]\s{0,8}(?P<field>[A-Za-z0-9_.\"'/:-]+):")
SECRETISH = re.compile(r"(password|token|secret|credential|private[_-]?key|authorization)", re.IGNORECASE)


def read_text(path: str | None) -> str:
    return sys.stdin.read() if not path or path == "-" else Path(path).read_text()


def resource_from_header(line: str) -> dict[str, str]:
    match = DIFF_HEADER.match(line)
    if not match:
        return {}
    for side in ("new", "old"):
        resource_match = RESOURCE_FROM_PATH.search(match.group(side))
        if resource_match:
            return resource_match.groupdict()
    return {}


def safe_snippet(line: str) -> str | None:
    if SECRETISH.search(line):
        return None
    text = line.strip()
    if len(text) > 180:
        text = f"{text[:177]}..."
    return text


def summarize(text: str, max_snippets: int) -> dict[str, Any]:
    resources: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    changed_fields: Counter[str] = Counter()
    immutable_hints: list[str] = []
    additions = removals = 0

    for line in text.splitlines():
        header_resource = resource_from_header(line)
        if header_resource:
            current = {
                "kind": header_resource.get("kind"),
                "namespace": header_resource.get("namespace"),
                "name": header_resource.get("name"),
                "changed_fields": [],
                "snippets": [],
            }
            resources.append(current)
            continue

        if line.startswith("+") and not line.startswith("+++"):
            additions += 1
        elif line.startswith("-") and not line.startswith("---"):
            removals += 1

        if "field is immutable" in line or "Invalid value" in line and "selector" in line:
            snippet = safe_snippet(line)
            if snippet:
                immutable_hints.append(snippet)

        field_match = FIELD_LINE.match(line)
        if field_match and current is not None:
            field = field_match.group("field").strip('"')
            changed_fields[field] += 1
            if field not in current["changed_fields"]:
                current["changed_fields"].append(field)

        if current is not None and len(current["snippets"]) < max_snippets:
            snippet = safe_snippet(line)
            if snippet and (line.startswith("+") or line.startswith("-")) and not line.startswith(("+++", "---")):
                current["snippets"].append(snippet)

    result = "pass"
    findings: list[dict[str, str]] = []
    if resources:
        result = "warning"
    if immutable_hints:
        result = "fail"
        findings.append({
            "level": "fail",
            "check": "immutable_field_hint",
            "message": "; ".join(immutable_hints[:3]),
        })

    risky_fields = {
        "selector": "service_or_deployment_selector_changed",
        "type": "service_type_changed",
        "clusterIP": "service_cluster_ip_changed",
        "nodePort": "service_node_port_changed",
        "serviceAccountName": "workload_identity_surface_changed",
    }
    for field, check in risky_fields.items():
        if field in changed_fields:
            findings.append({
                "level": "warn",
                "check": check,
                "message": f"{field} changed in {changed_fields[field]} diff lines",
            })

    return {
        "schema_version": "gitops-summary/v1",
        "type": "kubectl_diff_summary",
        "result": result,
        "line_counts": {
            "total": len(text.splitlines()),
            "additions": additions,
            "removals": removals,
        },
        "resource_count": len(resources),
        "resources": resources,
        "changed_field_counts": dict(sorted(changed_fields.items())),
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize kubectl diff output as JSON.")
    parser.add_argument("--diff", "-d", help="kubectl diff output path; defaults to stdin.")
    parser.add_argument("--max-snippets", type=int, default=6, help="Maximum snippets per resource.")
    args = parser.parse_args()

    print(json.dumps(summarize(read_text(args.diff), args.max_snippets), ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
