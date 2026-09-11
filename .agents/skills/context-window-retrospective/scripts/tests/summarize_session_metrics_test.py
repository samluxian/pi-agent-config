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


def usage(
    *,
    input_tokens: int,
    output: int,
    cache_read: int = 0,
    cache_write: int = 0,
    reasoning: int | None = None,
    cost: float = 0.0,
) -> dict[str, object]:
    result: dict[str, object] = {
        "input": input_tokens,
        "output": output,
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
        "totalTokens": input_tokens + output + cache_read + cache_write,
        "cost": {"total": cost},
    }
    if reasoning is not None:
        result["reasoning"] = reasoning
    return result


def test_window_and_reviewer() -> None:
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
            "type": "thinking_level_change",
            "id": "t",
            "parentId": "a",
            "timestamp": "2026-08-21T00:00:30Z",
            "thinkingLevel": "medium",
        },
        {
            "type": "compaction",
            "id": "b",
            "parentId": "t",
            "timestamp": "2026-08-21T00:01:00Z",
            "summary": "bounded checkpoint",
            "tokensBefore": 50000,
            "usage": usage(input_tokens=10, output=2, reasoning=1),
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
                "provider": "example-provider",
                "model": "example-model",
                "usage": usage(input_tokens=100, output=5, cache_read=50, reasoning=2),
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
                "content": [{"type": "text", "text": "private reviewer output"}],
                "isError": False,
                "details": {
                    "results": [
                        {
                            "agent": "reviewer",
                            "model": "example-review-model",
                            "exitCode": 0,
                            "output": "## Verdict\n- `blocked` — missing evidence",
                            "usage": usage(input_tokens=20, output=3, cache_read=10),
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

    metrics = MODULE.summarize(entries)
    assert metrics["window"]["mode"] == "after-latest-active-compaction"
    assert metrics["window"]["checkpointId"] == "b"
    assert metrics["window"]["windowEntries"] == 3
    assert metrics["window"]["activePathCompactions"] == 1
    assert metrics["window"]["checkpointUsage"]["reasoning"] == 1
    assert metrics["messages"] == {"assistant": 1, "toolResult": 1, "user": 1}
    assert metrics["toolCalls"] == {"subagent": 1}
    assert metrics["toolResults"] == {"subagent": 1}
    assert metrics["reviewers"]["count"] == 1
    assert metrics["reviewers"]["totalDurationMs"] == 1200
    assert metrics["reviewers"]["totalToolCount"] == 4
    assert metrics["reviewers"]["verdicts"] == {"blocked": 1}

    parent = metrics["usage"]["parentByModelThinking"]
    assert parent == [
        {
            "provider": "example-provider",
            "model": "example-model",
            "thinkingLevel": "medium",
            "cacheRead": 50,
            "cacheWrite": 0,
            "costTotal": 0.0,
            "input": 100,
            "output": 5,
            "reasoning": 2,
            "totalTokens": 155,
            "usageRecords": 1,
        }
    ]
    child = metrics["usage"]["subagentsByAgentModel"]
    assert child[0]["agent"] == "reviewer"
    assert child[0]["input"] == 20
    assert child[0]["results"] == 1
    assert metrics["usage"]["missingFields"] == {}
    assert metrics["toolResultVolume"]["records"] == [
        {
            "tool": "subagent",
            "imageParts": 0,
            "maxResultTextBytes": 23,
            "results": 1,
            "textBytes": 23,
        }
    ]
    assert metrics["initiativeSignals"] == {
        "assistantTurnsWithoutTools": 0,
        "userFollowupsAfterToollessAssistant": 0,
        "toolResumptionsAfterFollowup": 0,
        "interpretation": "review-candidates-not-proof",
    }

    rendered = MODULE.render_text(metrics)
    assert "abandoned" not in rendered
    assert "private reviewer output" not in rendered
    assert "review this window" not in rendered
    assert "reasoning is a reported subset of output" in rendered


def test_usage_grouping_and_volume() -> None:
    entries = [
        {
            "type": "thinking_level_change",
            "id": "u1",
            "parentId": None,
            "thinkingLevel": "xhigh",
        },
        {
            "type": "message",
            "id": "u2",
            "parentId": "u1",
            "message": {
                "role": "assistant",
                "provider": "example-provider",
                "model": "example-model",
                "usage": usage(
                    input_tokens=10,
                    output=5,
                    cache_read=20,
                    reasoning=3,
                    cost=0.25,
                ),
                "content": [{"type": "text", "text": "do work"}],
            },
        },
        {
            "type": "message",
            "id": "u3",
            "parentId": "u2",
            "message": {
                "role": "toolResult",
                "toolName": "bash",
                "content": [
                    {"type": "text", "text": "1234"},
                    {"type": "image", "data": "not-counted", "mimeType": "image/png"},
                ],
                "isError": False,
            },
        },
        {
            "type": "thinking_level_change",
            "id": "u4",
            "parentId": "u3",
            "thinkingLevel": "low",
        },
        {
            "type": "message",
            "id": "u5",
            "parentId": "u4",
            "message": {
                "role": "assistant",
                "provider": "example-provider",
                "model": "example-model",
                "usage": usage(input_tokens=7, output=2),
                "content": [{"type": "text", "text": "finish"}],
            },
        },
    ]
    metrics = MODULE.summarize(entries)
    rows = {
        row["thinkingLevel"]: row
        for row in metrics["usage"]["parentByModelThinking"]
    }
    assert rows["xhigh"]["totalTokens"] == 35
    assert rows["xhigh"]["reasoning"] == 3
    assert rows["xhigh"]["output"] == 5
    assert rows["xhigh"]["costTotal"] == 0.25
    assert rows["low"]["totalTokens"] == 9
    assert "reasoning" not in rows["low"]
    assert metrics["usage"]["missingFields"] == {"parentReasoning": 1}
    volume = metrics["toolResultVolume"]["records"][0]
    assert volume == {
        "tool": "bash",
        "imageParts": 1,
        "maxResultTextBytes": 4,
        "results": 1,
        "textBytes": 4,
    }


def test_initiative_signals() -> None:
    entries = [
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
    metrics = MODULE.summarize(entries)
    assert metrics["initiativeSignals"] == {
        "assistantTurnsWithoutTools": 1,
        "userFollowupsAfterToollessAssistant": 1,
        "toolResumptionsAfterFollowup": 1,
        "interpretation": "review-candidates-not-proof",
    }
    rendered = MODULE.render_text(metrics)
    assert "ask user" not in rendered
    assert "follow up" not in rendered


def test_file_loading() -> None:
    with tempfile.TemporaryDirectory() as directory:
        session = Path(directory) / "session.jsonl"
        lines = [
            {"type": "session", "version": 3, "id": "session"},
            {
                "type": "message",
                "id": "a",
                "parentId": None,
                "message": {"role": "user", "content": "bounded"},
            },
        ]
        session.write_text(
            "\n".join(json.dumps(line) for line in lines) + "\n", encoding="utf-8"
        )
        loaded = MODULE.load_entries(session)
    assert len(loaded) == 1
    assert loaded[0]["id"] == "a"


def main() -> None:
    test_window_and_reviewer()
    test_usage_grouping_and_volume()
    test_initiative_signals()
    test_file_loading()
    print("OK: bounded active-window, usage, volume, reviewer, and initiative fixtures")


if __name__ == "__main__":
    main()
