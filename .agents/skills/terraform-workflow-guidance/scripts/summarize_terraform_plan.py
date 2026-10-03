#!/usr/bin/env python3
"""Emit bounded, deterministic evidence from Terraform text plan output."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ANSI_RE = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")
RESOURCE_RE = re.compile(
    r"^\s*#\s+(\S+)\s+(must be replaced|will be updated in-place|will be created|will be destroyed|will be imported)"
)
SUMMARY_RE = re.compile(
    r"^Plan:\s+(?:(\d+) to import,\s+)?(\d+) to add,\s+(\d+) to change,\s+(\d+) to destroy\."
)
NO_CHANGES_RE = re.compile(r"^(?:No changes\.|Your infrastructure matches the configuration\.)")
DECISION_RE = re.compile(r"^\s*[~+-]\s+(name|default_service|id)\s+=")
WARNING_RE = re.compile(r"^(Warning:|Error:)")
SECRETISH_RE = re.compile(
    r"(password|passwd|token|secret|credential|private[_ -]?key|authorization|client[_-]?secret)",
    re.IGNORECASE,
)
JWT_RE = re.compile(r"\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b")
BEARER_RE = re.compile(r"(authorization\s*:\s*bearer)\s+\S+", re.IGNORECASE)
URL_QUERY_RE = re.compile(r"(https?://[^\s?]+)\?\S+")
ACTION_NAMES = {
    "must be replaced": "replace",
    "will be updated in-place": "update",
    "will be created": "create",
    "will be destroyed": "destroy",
    "will be imported": "import",
}
MAX_RESOURCES = 2000
MAX_MESSAGES = 50


@dataclass
class Resource:
    address: str
    action: str
    replacement_order: str | None = None
    decision_fields: list[str] = field(default_factory=list)


def safe_message(line: str) -> str | None:
    if SECRETISH_RE.search(line):
        return None
    line = JWT_RE.sub("[REDACTED JWT]", line)
    line = BEARER_RE.sub(r"\1 [REDACTED]", line)
    line = URL_QUERY_RE.sub(r"\1?[REDACTED QUERY]", line)
    return line[:500]


def summary_matches_resources(
    summary: dict[str, int] | None, resources: list[Resource]
) -> bool:
    if summary is None:
        return not resources
    actions = Counter(resource.action for resource in resources)
    replacements = actions["replace"]
    return (
        summary["import"] == actions["import"]
        and summary["add"] == actions["create"] + replacements
        and summary["change"] == actions["update"]
        and summary["destroy"] == actions["destroy"] + replacements
    )


def parse_plan(text: str) -> dict[str, Any]:
    lines = ANSI_RE.sub("", text).replace("\r", "").splitlines()
    resources: list[Resource] = []
    current: Resource | None = None
    summary: dict[str, int] | None = None
    no_changes = False
    warnings: list[str] = []
    errors: list[str] = []
    redacted_lines = 0

    for line in lines:
        resource_match = RESOURCE_RE.match(line)
        if resource_match:
            current = Resource(
                address=resource_match.group(1),
                action=ACTION_NAMES[resource_match.group(2)],
            )
            resources.append(current)
            continue

        stripped = line.strip()
        if current and current.action == "replace" and stripped.startswith(("+/- resource ", "-/+ resource ")):
            current.replacement_order = stripped.split()[0]
            continue

        if current and DECISION_RE.match(line):
            message = safe_message(stripped)
            if message is None:
                redacted_lines += 1
            else:
                current.decision_fields.append(message)
            continue

        summary_match = SUMMARY_RE.match(stripped)
        if summary_match:
            imported, added, changed, destroyed = summary_match.groups()
            summary = {
                "import": int(imported or 0),
                "add": int(added),
                "change": int(changed),
                "destroy": int(destroyed),
                "replace": sum(resource.action == "replace" for resource in resources),
            }
            continue

        if NO_CHANGES_RE.match(stripped):
            no_changes = True
            continue

        warning_match = WARNING_RE.match(stripped)
        if warning_match:
            message = safe_message(stripped)
            if message is None:
                redacted_lines += 1
            elif warning_match.group(1) == "Warning:":
                warnings.append(message)
            else:
                errors.append(message)

    missing_replacement_order = [
        resource.address
        for resource in resources
        if resource.action == "replace" and resource.replacement_order is None
    ]
    unsafe_replacements = [
        resource.address for resource in resources if resource.replacement_order == "-/+"
    ]
    resources_truncated = len(resources) > MAX_RESOURCES
    messages_truncated = len(warnings) > MAX_MESSAGES or len(errors) > MAX_MESSAGES
    contradictory_completion = no_changes and (summary is not None or bool(resources))
    summary_consistent = summary_matches_resources(summary, resources)
    complete = (
        (summary is not None or no_changes)
        and summary_consistent
        and not missing_replacement_order
        and not resources_truncated
        and not messages_truncated
        and not contradictory_completion
    )

    if no_changes and complete:
        counts = {"import": 0, "add": 0, "change": 0, "destroy": 0, "replace": 0}
        result = "noop"
    elif complete and unsafe_replacements:
        counts = summary
        result = "stop"
    elif complete:
        counts = summary
        result = "changes"
    else:
        counts = summary
        result = "incomplete"

    return {
        "schema_version": "terraform-plan-summary/v1",
        "type": "terraform_text_plan_summary",
        "complete": complete,
        "result": result,
        "input_line_count": len(lines),
        "counts": counts,
        "summary_matches_resources": summary_consistent,
        "resources": [
            {
                "address": resource.address,
                "action": resource.action,
                **(
                    {"replacement_order": resource.replacement_order}
                    if resource.replacement_order is not None
                    else {}
                ),
                **(
                    {"decision_fields": resource.decision_fields}
                    if resource.decision_fields
                    else {}
                ),
            }
            for resource in resources[:MAX_RESOURCES]
        ],
        "resources_truncated": resources_truncated,
        "warnings": warnings[:MAX_MESSAGES],
        "errors": errors[:MAX_MESSAGES],
        "messages_truncated": messages_truncated,
        "redacted_line_count": redacted_lines,
        "missing_replacement_order": missing_replacement_order[:MAX_RESOURCES],
        "unsafe_replacements": unsafe_replacements[:MAX_RESOURCES],
    }


def render_text(result: dict[str, Any]) -> str:
    out: list[str] = []
    for resource in result["resources"]:
        action_text = {
            "replace": "must be replaced",
            "update": "will be updated in-place",
            "create": "will be created",
            "destroy": "will be destroyed",
            "import": "will be imported",
        }[resource["action"]]
        out.append(f"resource={resource['address']} action={action_text}")
        if resource.get("replacement_order"):
            out.append(f"replacement_order={resource['replacement_order']}")
        out.extend(resource.get("decision_fields", []))

    counts = result.get("counts")
    if counts is not None and result["result"] != "noop":
        out.append(
            "summary="
            f"import:{counts['import']} add:{counts['add']} "
            f"change:{counts['change']} destroy:{counts['destroy']}"
        )
    elif result["result"] == "noop":
        out.append("summary=import:0 add:0 change:0 destroy:0")

    out.extend(result["warnings"])
    out.extend(result["errors"])
    if result["unsafe_replacements"]:
        out.append("review=STOP destroy-first active-reference risk")
        out.extend(
            f"unsafe_replacement={address}" for address in result["unsafe_replacements"]
        )
    elif not result["complete"]:
        out.append("review=INCOMPLETE plan completion or replacement order not proven")
    else:
        out.append("review=no destroy-first replacement detected")
    return "\n".join(out[-120:])


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize Terraform text plan output.")
    parser.add_argument("--plan", help="Text plan path; defaults to stdin.")
    parser.add_argument("--json", action="store_true", help="Emit the structured processor contract.")
    args = parser.parse_args()

    text = Path(args.plan).read_text(encoding="utf-8") if args.plan else sys.stdin.read()
    result = parse_plan(text)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    print(render_text(result))
    return 3 if result["unsafe_replacements"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
