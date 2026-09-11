#!/usr/bin/env python3
"""Emit bounded replacement evidence from Terraform text plan output."""

from __future__ import annotations

import re
import sys

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
RESOURCE_RE = re.compile(r"^\s*#\s+(\S+)\s+(must be replaced|will be updated in-place|will be created|will be destroyed)")
SUMMARY_RE = re.compile(r"^Plan:\s+(?:(\d+) to import,\s+)?(\d+) to add,\s+(\d+) to change,\s+(\d+) to destroy\.")
DECISION_RE = re.compile(r"^\s*[~+-]\s+(name|default_service|id)\s+=")
WARNING_RE = re.compile(r"^(Warning:|Error:)")


def main() -> int:
    lines = ANSI_RE.sub("", sys.stdin.read()).replace("\r", "").splitlines()
    out: list[str] = []
    unsafe: list[str] = []
    current = ""
    pending_resource = ""

    for line in lines:
        resource = RESOURCE_RE.match(line)
        if resource:
            pending_resource = resource.group(1)
            current = pending_resource
            out.append(f"resource={current} action={resource.group(2)}")
            continue

        stripped = line.strip()
        if pending_resource and stripped.startswith(("+/- resource ", "-/+ resource ")):
            order = stripped.split()[0]
            out.append(f"replacement_order={order}")
            if order == "-/+":
                unsafe.append(pending_resource)
            pending_resource = ""
            continue

        if current and DECISION_RE.match(line):
            out.append(stripped[:500])
            continue

        summary = SUMMARY_RE.match(stripped)
        if summary:
            imported, added, changed, destroyed = summary.groups()
            out.append(
                "summary="
                f"import:{int(imported or 0)} add:{added} change:{changed} destroy:{destroyed}"
            )
            continue

        if WARNING_RE.match(stripped):
            out.append(stripped[:500])

    if unsafe:
        out.append("review=STOP destroy-first active-reference risk")
        for address in unsafe:
            out.append(f"unsafe_replacement={address}")
    else:
        out.append("review=no destroy-first replacement detected")

    print("\n".join(out[-120:]))
    return 3 if unsafe else 0


if __name__ == "__main__":
    raise SystemExit(main())
