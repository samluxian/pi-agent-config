#!/usr/bin/env python3
"""Summarize bounded workflow and usage metrics for the active context window."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


VERDICT_PATTERN = re.compile(
    r"^## Verdict\s*\n\s*-\s*`?(pass|fail|blocked)`?", re.IGNORECASE | re.MULTILINE
)
USAGE_FIELDS = ("input", "output", "cacheRead", "cacheWrite", "reasoning", "totalTokens")
MAX_GROUP_RECORDS = 50


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


def add_usage(target: Counter[str], usage: Any) -> bool:
    if not isinstance(usage, dict):
        target["missingUsage"] += 1
        return False
    target["usageRecords"] += 1
    for field in USAGE_FIELDS:
        value = usage.get(field)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            target[field] += value
    cost = usage.get("cost")
    if isinstance(cost, dict):
        total = cost.get("total")
        if isinstance(total, (int, float)) and not isinstance(total, bool):
            target["costTotal"] += total
    return True


def subagent_outcome(result: dict[str, Any]) -> str:
    progress = result.get("progress")
    progress = progress if isinstance(progress, dict) else {}
    status = str(progress.get("status") or "").lower()
    error = progress.get("error")
    error = error.lower() if isinstance(error, str) else ""
    if bool(progress.get("timedOut")) or "timed out" in error or status == "timeout":
        return "timeout"
    if status in {"aborted", "cancelled", "canceled"} or any(
        marker in error for marker in ("aborted by parent", "parent request", "user request")
    ):
        return "parentOrUserAborted"
    exit_code = result.get("exitCode")
    if status == "completed" and exit_code in {None, 0}:
        return "completed"
    if isinstance(exit_code, int) and not isinstance(exit_code, bool) and exit_code != 0:
        return "processFailure"
    if status in {"failed", "error"}:
        return "processFailure"
    return "unknown"


def text_volume(content: Any) -> tuple[int, int]:
    if isinstance(content, str):
        return len(content.encode("utf-8")), 0
    if not isinstance(content, list):
        return 0, 0
    text_bytes = 0
    image_parts = 0
    for part in content:
        if not isinstance(part, dict):
            continue
        if part.get("type") == "text" and isinstance(part.get("text"), str):
            text_bytes += len(part["text"].encode("utf-8"))
        elif part.get("type") == "image":
            image_parts += 1
    return text_bytes, image_parts


def usage_groups(
    records: dict[tuple[str, ...], Counter[str]], labels: tuple[str, ...]
) -> tuple[list[dict[str, Any]], int]:
    output: list[dict[str, Any]] = []
    for key in sorted(records):
        row = {label: value for label, value in zip(labels, key)}
        row.update(dict(sorted(records[key].items())))
        output.append(row)
    return output[:MAX_GROUP_RECORDS], max(0, len(output) - MAX_GROUP_RECORDS)


def summarize(entries: list[dict[str, Any]]) -> dict[str, Any]:
    branch = active_branch(entries)
    compaction_indexes = [
        index for index, entry in enumerate(branch) if entry.get("type") == "compaction"
    ]
    compaction_index = compaction_indexes[-1] if compaction_indexes else -1
    checkpoint = branch[compaction_index] if compaction_index >= 0 else None
    window = branch[compaction_index + 1 :]

    message_counts: Counter[str] = Counter()
    tool_calls: Counter[str] = Counter()
    tool_results: Counter[str] = Counter()
    tool_errors = 0
    reviewer_records: list[dict[str, Any]] = []
    conversation_turns: list[dict[str, Any]] = []
    parent_usage: dict[tuple[str, str, str], Counter[str]] = defaultdict(Counter)
    subagent_usage: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    subagent_outcomes: Counter[str] = Counter()
    tool_result_volume: dict[str, Counter[str]] = defaultdict(Counter)
    usage_missing_fields: Counter[str] = Counter()
    thinking_level = "unrecorded-session-default"

    checkpoint_usage: Counter[str] = Counter()
    if checkpoint is not None and checkpoint.get("usage") is not None:
        add_usage(checkpoint_usage, checkpoint.get("usage"))

    for index, entry in enumerate(branch):
        entry_type = entry.get("type")
        if entry_type == "thinking_level_change":
            value = entry.get("thinkingLevel")
            thinking_level = value if isinstance(value, str) else "unknown"
        if index <= compaction_index or entry_type != "message":
            continue

        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if isinstance(role, str):
            message_counts[role] += 1

        assistant_has_tool = False
        if role == "assistant":
            content = message.get("content")
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "toolCall":
                        assistant_has_tool = True
                        name = part.get("name")
                        if isinstance(name, str):
                            tool_calls[name] += 1
            provider = message.get("provider")
            model = message.get("model")
            key = (
                provider if isinstance(provider, str) else "unknown",
                model if isinstance(model, str) else "unknown",
                thinking_level,
            )
            usage = message.get("usage")
            if add_usage(parent_usage[key], usage):
                if not isinstance(usage.get("reasoning"), (int, float)):
                    usage_missing_fields["parentReasoning"] += 1
            else:
                usage_missing_fields["parentUsage"] += 1

        if role in {"user", "assistant"}:
            conversation_turns.append({"role": role, "hasTool": assistant_has_tool})

        if role != "toolResult":
            continue
        tool_name = message.get("toolName")
        tool_name = tool_name if isinstance(tool_name, str) else "unknown"
        tool_results[tool_name] += 1
        if message.get("isError") is True:
            tool_errors += 1

        byte_count, image_parts = text_volume(message.get("content"))
        volume = tool_result_volume[tool_name]
        volume["results"] += 1
        volume["textBytes"] += byte_count
        volume["maxResultTextBytes"] = max(volume["maxResultTextBytes"], byte_count)
        volume["imageParts"] += image_parts

        if tool_name != "subagent":
            continue
        details = message.get("details")
        results = details.get("results") if isinstance(details, dict) else None
        if not isinstance(results, list):
            continue
        for result in results:
            if not isinstance(result, dict):
                continue
            agent = result.get("agent")
            model = result.get("model")
            child_key = (
                agent if isinstance(agent, str) else "unknown",
                model if isinstance(model, str) else "unknown",
            )
            subagent_usage[child_key]["results"] += 1
            subagent_outcomes[subagent_outcome(result)] += 1
            usage = result.get("usage")
            if not add_usage(subagent_usage[child_key], usage):
                usage_missing_fields["subagentUsage"] += 1

            if result.get("agent") != "reviewer":
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

    assistant_turns_without_tools = sum(
        turn["role"] == "assistant" and not turn["hasTool"]
        for turn in conversation_turns
    )
    user_followups_after_toolless_assistant = sum(
        conversation_turns[index]["role"] == "user"
        and conversation_turns[index - 1]["role"] == "assistant"
        and not conversation_turns[index - 1]["hasTool"]
        for index in range(1, len(conversation_turns))
    )
    tool_resumptions_after_followup = sum(
        conversation_turns[index]["role"] == "assistant"
        and conversation_turns[index]["hasTool"]
        and conversation_turns[index - 1]["role"] == "user"
        and conversation_turns[index - 2]["role"] == "assistant"
        and not conversation_turns[index - 2]["hasTool"]
        for index in range(2, len(conversation_turns))
    )

    parent_rows, parent_truncated = usage_groups(
        parent_usage, ("provider", "model", "thinkingLevel")
    )
    child_rows, child_truncated = usage_groups(
        subagent_usage, ("agent", "model")
    )
    volume_rows, volume_truncated = usage_groups(
        {(name,): values for name, values in tool_result_volume.items()}, ("tool",)
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
            "activePathCompactions": len(compaction_indexes),
            "checkpointUsage": dict(sorted(checkpoint_usage.items())),
        },
        "messages": dict(sorted(message_counts.items())),
        "toolCalls": dict(sorted(tool_calls.items())),
        "toolResults": dict(sorted(tool_results.items())),
        "toolErrors": tool_errors,
        "toolResultVolume": {
            "unit": "UTF-8 text bytes, not tokens; image payload bytes excluded",
            "records": volume_rows,
            "recordsTruncated": volume_truncated,
        },
        "usage": {
            "parentByModelThinking": parent_rows,
            "parentRecordsTruncated": parent_truncated,
            "subagentsByAgentModel": child_rows,
            "subagentOutcomes": dict(sorted(subagent_outcomes.items())),
            "subagentOutcomeSemantics": "bounded structured metadata only; ambiguous records remain unknown",
            "subagentRecordsTruncated": child_truncated,
            "missingFields": dict(sorted(usage_missing_fields.items())),
            "semantics": [
                "reasoning is a reported subset of output; do not add it to totalTokens",
                "cacheRead is reported separately from uncached input",
                "parent and subagent records are separate; do not sum duplicate nested tool usage",
                "provider-reported usage is not a verified invoice",
            ],
        },
        "initiativeSignals": {
            "assistantTurnsWithoutTools": assistant_turns_without_tools,
            "userFollowupsAfterToollessAssistant": user_followups_after_toolless_assistant,
            "toolResumptionsAfterFollowup": tool_resumptions_after_followup,
            "interpretation": "review-candidates-not-proof",
        },
        "reviewers": {
            "count": len(reviewer_records),
            "totalDurationMs": sum(record["durationMs"] for record in reviewer_records),
            "totalToolCount": sum(record["toolCount"] for record in reviewer_records),
            "timedOut": sum(1 for record in reviewer_records if record["timedOut"]),
            "verdicts": dict(sorted(verdicts.items())),
            "records": reviewer_records[:MAX_GROUP_RECORDS],
            "recordsTruncated": max(0, len(reviewer_records) - MAX_GROUP_RECORDS),
        },
    }


def render_text(metrics: dict[str, Any]) -> str:
    window = metrics["window"]
    reviewers = metrics["reviewers"]
    initiative = metrics["initiativeSignals"]
    usage = metrics["usage"]
    duration_seconds = reviewers["totalDurationMs"] / 1000
    lines = [
        f"window_mode={window['mode']}",
        f"checkpoint_id={window['checkpointId'] or 'none'}",
        f"window_entries={window['windowEntries']}",
        f"active_path_compactions={window['activePathCompactions']}",
        f"checkpoint_usage={json.dumps(window['checkpointUsage'], sort_keys=True)}",
        f"messages={json.dumps(metrics['messages'], sort_keys=True)}",
        f"tool_calls={json.dumps(metrics['toolCalls'], sort_keys=True)}",
        f"tool_results={json.dumps(metrics['toolResults'], sort_keys=True)}",
        f"tool_errors={metrics['toolErrors']}",
        f"tool_result_volume={json.dumps(metrics['toolResultVolume'], sort_keys=True)}",
        f"parent_usage={json.dumps(usage['parentByModelThinking'], sort_keys=True)}",
        f"subagent_usage={json.dumps(usage['subagentsByAgentModel'], sort_keys=True)}",
        f"subagent_outcomes={json.dumps(usage['subagentOutcomes'], sort_keys=True)}",
        f"usage_missing_fields={json.dumps(usage['missingFields'], sort_keys=True)}",
        f"usage_semantics={json.dumps(usage['semantics'], sort_keys=True)}",
        f"initiative_signals={json.dumps(initiative, sort_keys=True)}",
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
