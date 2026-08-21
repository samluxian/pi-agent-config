#!/usr/bin/env python3
"""Summarize bounded workflow metrics for the active post-compaction window."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


VERDICT_PATTERN = re.compile(
    r"^## Verdict\s*\n\s*-\s*`?(pass|fail|blocked)`?", re.IGNORECASE | re.MULTILINE
)


def load_entries(session_file: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    with session_file.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSONL at line {line_number}: {exc}") from exc
            if isinstance(entry, dict) and entry.get("type") != "session":
                entries.append(entry)
    return entries


def active_branch(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexed = {
        entry["id"]: entry
        for entry in entries
        if isinstance(entry.get("id"), str)
    }
    leaf = next(
        (entry for entry in reversed(entries) if isinstance(entry.get("id"), str)),
        None,
    )
    if leaf is None:
        return []

    branch: list[dict[str, Any]] = []
    seen: set[str] = set()
    current: dict[str, Any] | None = leaf
    while current is not None:
        entry_id = current.get("id")
        if not isinstance(entry_id, str) or entry_id in seen:
            break
        seen.add(entry_id)
        branch.append(current)
        parent_id = current.get("parentId")
        current = indexed.get(parent_id) if isinstance(parent_id, str) else None
    branch.reverse()
    return branch


def reviewer_verdict(result: dict[str, Any]) -> str:
    verdict = result.get("reviewVerdict")
    if verdict in {"pass", "fail", "blocked", "missing"}:
        return verdict
    output = result.get("output")
    if isinstance(output, str):
        match = VERDICT_PATTERN.search(output)
        if match:
            return match.group(1).lower()
    return "missing"


def summarize(entries: list[dict[str, Any]]) -> dict[str, Any]:
    branch = active_branch(entries)
    compaction_index = max(
        (index for index, entry in enumerate(branch) if entry.get("type") == "compaction"),
        default=-1,
    )
    checkpoint = branch[compaction_index] if compaction_index >= 0 else None
    window = branch[compaction_index + 1 :]

    message_counts: Counter[str] = Counter()
    tool_calls: Counter[str] = Counter()
    tool_results: Counter[str] = Counter()
    tool_errors = 0
    reviewer_records: list[dict[str, Any]] = []

    for entry in window:
        if entry.get("type") != "message":
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if isinstance(role, str):
            message_counts[role] += 1

        if role == "assistant":
            content = message.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "toolCall":
                        name = part.get("name")
                        if isinstance(name, str):
                            tool_calls[name] += 1

        if role != "toolResult":
            continue
        tool_name = message.get("toolName")
        if isinstance(tool_name, str):
            tool_results[tool_name] += 1
        if message.get("isError") is True:
            tool_errors += 1
        if tool_name != "subagent":
            continue

        details = message.get("details")
        results = details.get("results") if isinstance(details, dict) else None
        if not isinstance(results, list):
            continue
        for result in results:
            if not isinstance(result, dict) or result.get("agent") != "reviewer":
                continue
            progress = result.get("progress")
            progress = progress if isinstance(progress, dict) else {}
            error = progress.get("error")
            timed_out = bool(progress.get("timedOut")) or (
                isinstance(error, str) and "timed out" in error.lower()
            )
            reviewer_records.append(
                {
                    "durationMs": int(progress.get("durationMs") or 0),
                    "toolCount": int(progress.get("toolCount") or 0),
                    "exitCode": int(result.get("exitCode") or 0),
                    "status": str(progress.get("status") or "unknown"),
                    "verdict": reviewer_verdict(result),
                    "timedOut": timed_out,
                    "reviewMode": result.get("reviewMode") or "unspecified",
                }
            )

    verdicts = Counter(record["verdict"] for record in reviewer_records)
    return {
        "window": {
            "mode": "after-latest-active-compaction" if checkpoint else "full-active-branch",
            "checkpointId": checkpoint.get("id") if checkpoint else None,
            "checkpointTimestamp": checkpoint.get("timestamp") if checkpoint else None,
            "tokensBefore": checkpoint.get("tokensBefore") if checkpoint else None,
            "activeBranchEntries": len(branch),
            "windowEntries": len(window),
        },
        "messages": dict(sorted(message_counts.items())),
        "toolCalls": dict(sorted(tool_calls.items())),
        "toolResults": dict(sorted(tool_results.items())),
        "toolErrors": tool_errors,
        "reviewers": {
            "count": len(reviewer_records),
            "totalDurationMs": sum(record["durationMs"] for record in reviewer_records),
            "totalToolCount": sum(record["toolCount"] for record in reviewer_records),
            "timedOut": sum(1 for record in reviewer_records if record["timedOut"]),
            "verdicts": dict(sorted(verdicts.items())),
            "records": reviewer_records[:50],
            "recordsTruncated": max(0, len(reviewer_records) - 50),
        },
    }


def render_text(metrics: dict[str, Any]) -> str:
    window = metrics["window"]
    reviewers = metrics["reviewers"]
    duration_seconds = reviewers["totalDurationMs"] / 1000
    lines = [
        f"window_mode={window['mode']}",
        f"checkpoint_id={window['checkpointId'] or 'none'}",
        f"window_entries={window['windowEntries']}",
        f"messages={json.dumps(metrics['messages'], sort_keys=True)}",
        f"tool_calls={json.dumps(metrics['toolCalls'], sort_keys=True)}",
        f"tool_results={json.dumps(metrics['toolResults'], sort_keys=True)}",
        f"tool_errors={metrics['toolErrors']}",
        f"reviewer_count={reviewers['count']}",
        f"reviewer_duration_seconds={duration_seconds:.1f}",
        f"reviewer_tool_count={reviewers['totalToolCount']}",
        f"reviewer_timeouts={reviewers['timedOut']}",
        f"reviewer_verdicts={json.dumps(reviewers['verdicts'], sort_keys=True)}",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Summarize bounded metrics after the latest active-branch compaction."
    )
    parser.add_argument(
        "session_file",
        nargs="?",
        default=os.environ.get("PI_SESSION_FILE"),
        help="Pi session JSONL file; defaults to PI_SESSION_FILE.",
    )
    parser.add_argument("--json", action="store_true", help="Print structured JSON.")
    args = parser.parse_args()

    if not args.session_file:
        print("ERROR: session file unavailable; pass a path or set PI_SESSION_FILE", file=sys.stderr)
        raise SystemExit(2)
    session_file = Path(args.session_file).expanduser()
    if not session_file.is_file():
        print(f"ERROR: session file not found: {session_file}", file=sys.stderr)
        raise SystemExit(2)

    try:
        metrics = summarize(load_entries(session_file))
    except (OSError, ValueError) as exc:
        print(f"ERROR: cannot summarize session metrics: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    if args.json:
        print(json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(render_text(metrics))


if __name__ == "__main__":
    main()
