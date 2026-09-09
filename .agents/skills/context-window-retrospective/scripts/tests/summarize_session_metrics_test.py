#!/usr/bin/env python3
"""Deterministic tests for bounded context-window session metrics."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path


sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / "summarize_session_metrics.py"
SPEC = importlib.util.spec_from_file_location("summarize_session_metrics", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def main() -> None:
    entries = [
        {
            "type": "message",
            "id": "a",
            "parentId": None,
            "timestamp": "2026-08-21T00:00:00Z",
            "message": {"role": "user", "content": "old context"},
        },
        {
            "type": "message",
            "id": "x",
            "parentId": "a",
            "timestamp": "2026-08-21T00:00:01Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "abandoned"}]},
        },
        {
            "type": "compaction",
            "id": "b",
            "parentId": "a",
            "timestamp": "2026-08-21T00:01:00Z",
            "summary": "bounded checkpoint",
            "tokensBefore": 50000,
        },
        {
            "type": "message",
            "id": "c",
            "parentId": "b",
            "timestamp": "2026-08-21T00:02:00Z",
            "message": {"role": "user", "content": "review this window"},
        },
        {
            "type": "message",
            "id": "d",
            "parentId": "c",
            "timestamp": "2026-08-21T00:03:00Z",
            "message": {
                "role": "assistant",
                "content": [
                    {
                        "type": "toolCall",
                        "id": "call-1",
                        "name": "subagent",
                        "arguments": {"agent": "reviewer"},
                    }
                ],
            },
        },
        {
            "type": "message",
            "id": "e",
            "parentId": "d",
            "timestamp": "2026-08-21T00:04:00Z",
            "message": {
                "role": "toolResult",
                "toolName": "subagent",
                "isError": False,
                "details": {
                    "results": [
                        {
                            "agent": "reviewer",
                            "exitCode": 0,
                            "output": "## Verdict\n- `blocked` — missing evidence",
                            "progress": {
                                "durationMs": 1200,
                                "toolCount": 4,
                                "status": "completed",
                            },
                        }
                    ]
                },
            },
        },
    ]

    with tempfile.TemporaryDirectory() as directory:
        session = Path(directory) / "session.jsonl"
        lines = [{"type": "session", "version": 3, "id": "session"}, *entries]
        session.write_text("\n".join(json.dumps(line) for line in lines) + "\n", encoding="utf-8")
        metrics = MODULE.summarize(MODULE.load_entries(session))

    assert metrics["window"]["mode"] == "after-latest-active-compaction"
    assert metrics["window"]["checkpointId"] == "b"
    assert metrics["window"]["windowEntries"] == 3
    assert metrics["messages"] == {"assistant": 1, "toolResult": 1, "user": 1}
    assert metrics["toolCalls"] == {"subagent": 1}
    assert metrics["toolResults"] == {"subagent": 1}
    assert metrics["reviewers"]["count"] == 1
    assert metrics["reviewers"]["totalDurationMs"] == 1200
    assert metrics["reviewers"]["totalToolCount"] == 4
    assert metrics["reviewers"]["verdicts"] == {"blocked": 1}
    assert metrics["initiativeSignals"] == {
        "assistantTurnsWithoutTools": 0,
        "userFollowupsAfterToollessAssistant": 0,
        "toolResumptionsAfterFollowup": 0,
        "interpretation": "review-candidates-not-proof",
    }
    assert "abandoned" not in MODULE.render_text(metrics)

    initiative_entries = [
        {
            "type": "message",
            "id": "i1",
            "parentId": None,
            "message": {"role": "assistant", "content": [{"type": "text", "text": "ask user"}]},
        },
        {
            "type": "message",
            "id": "i2",
            "parentId": "i1",
            "message": {"role": "user", "content": "follow up"},
        },
        {
            "type": "message",
            "id": "i3",
            "parentId": "i2",
            "message": {
                "role": "assistant",
                "content": [{"type": "toolCall", "name": "bash", "arguments": {}}],
            },
        },
    ]
    initiative_metrics = MODULE.summarize(initiative_entries)
    assert initiative_metrics["initiativeSignals"] == {
        "assistantTurnsWithoutTools": 1,
        "userFollowupsAfterToollessAssistant": 1,
        "toolResumptionsAfterFollowup": 1,
        "interpretation": "review-candidates-not-proof",
    }
    assert "ask user" not in MODULE.render_text(initiative_metrics)
    assert "follow up" not in MODULE.render_text(initiative_metrics)
    print("OK: bounded active-window and initiative-signal fixtures")


if __name__ == "__main__":
    main()
