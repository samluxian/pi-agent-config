#!/usr/bin/env python3
"""Run real Pi model trials against skill invocation fixtures."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROUTE_PROMPT = """Routing benchmark only. Treat REQUEST below as the complete user task.
Do not perform the task or inspect implementation files. Choose at most one
primary project skill. If a skill matches, use the read tool to load its
SKILL.md, then stop and output exactly ROUTE: <skill-name>. If no project skill
matches, do not use a tool and output exactly ROUTE: none.

REQUEST:
{request}
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark actual model skill routing with isolated read-only Pi runs."
    )
    parser.add_argument("--repo", type=Path, help="devops-pi-agent repo root")
    parser.add_argument("--provider", default=os.environ.get("PI_PROVIDER", "openai-codex"))
    parser.add_argument("--model", default=os.environ.get("PI_MODEL", "gpt-5.6-sol"))
    parser.add_argument("--thinking", default="low")
    parser.add_argument("--timeout", type=int, default=180, help="seconds per case")
    parser.add_argument("--case", action="append", dest="case_ids", help="run only this case id; repeatable")
    parser.add_argument("--output-dir", type=Path, help="raw JSONL and summary destination")
    return parser.parse_args()


def text_content(message: dict[str, Any]) -> str:
    return "".join(
        block.get("text", "")
        for block in message.get("content", [])
        if isinstance(block, dict) and block.get("type") == "text"
    )


def parse_events(stdout: str, known_skills: set[str]) -> dict[str, Any]:
    loaded: list[str] = []
    assistant_texts: list[str] = []
    usage = {
        "input": 0,
        "output": 0,
        "cacheRead": 0,
        "cacheWrite": 0,
        "reasoning": 0,
        "totalTokens": 0,
        "cost": 0.0,
    }
    provider = None
    model = None
    errors: list[str] = []

    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        if event.get("type") == "tool_execution_start" and event.get("toolName") == "read":
            path_value = event.get("args", {}).get("path")
            if isinstance(path_value, str):
                path = Path(path_value)
                if path.name == "SKILL.md" and path.parent.name in known_skills:
                    loaded.append(path.parent.name)

        if event.get("type") != "message_end":
            continue
        message = event.get("message", {})
        if message.get("role") != "assistant":
            continue

        provider = message.get("provider") or provider
        model = message.get("model") or model
        text = text_content(message).strip()
        if text:
            assistant_texts.append(text)
        if message.get("errorMessage"):
            errors.append(str(message["errorMessage"]))

        message_usage = message.get("usage", {})
        for key in ("input", "output", "cacheRead", "cacheWrite", "reasoning", "totalTokens"):
            value = message_usage.get(key)
            if isinstance(value, (int, float)):
                usage[key] += value
        cost = message_usage.get("cost", {}).get("total")
        if isinstance(cost, (int, float)):
            usage["cost"] += cost

    route_match = None
    for text in reversed(assistant_texts):
        match = re.search(r"(?:^|\n)ROUTE:\s*([a-z0-9-]+|none)\s*$", text)
        if match:
            route_match = match.group(1)
            break

    return {
        "loadedSkills": list(dict.fromkeys(loaded)),
        "reportedRoute": route_match,
        "assistantText": assistant_texts[-1] if assistant_texts else "",
        "provider": provider,
        "model": model,
        "usage": usage,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    repo = args.repo.expanduser().resolve() if args.repo else Path(__file__).resolve().parents[4]
    fixture_path = repo / ".agents/shared/skill-quality/fixtures/invocation-cases.json"
    skills_root = repo / ".agents/skills"
    if not fixture_path.is_file() or not skills_root.is_dir():
        print(f"ERROR: not a devops-pi-agent repository: {repo}", file=sys.stderr)
        raise SystemExit(1)

    fixtures = json.loads(fixture_path.read_text(encoding="utf-8"))
    if args.case_ids:
        requested = set(args.case_ids)
        fixtures = [case for case in fixtures if case["id"] in requested]
        missing = requested - {case["id"] for case in fixtures}
        if missing:
            print(f"ERROR: unknown case ids: {sorted(missing)}", file=sys.stderr)
            raise SystemExit(2)
    if not fixtures:
        print("ERROR: no benchmark cases selected", file=sys.stderr)
        raise SystemExit(2)

    skill_files = sorted(skills_root.glob("*/SKILL.md"))
    known_skills = {path.parent.name for path in skill_files}
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = (
        args.output_dir.expanduser().resolve()
        if args.output_dir
        else repo / "tmp" / f"invocation-benchmark-{timestamp}"
    )
    output_dir.mkdir(parents=True, exist_ok=False)
    cases_dir = output_dir / "cases"
    cases_dir.mkdir()

    common_command = [
        "pi",
        "--mode",
        "json",
        "--no-session",
        "--approve",
        "--provider",
        args.provider,
        "--model",
        args.model,
        "--thinking",
        args.thinking,
        "--no-extensions",
        "--no-prompt-templates",
        "--no-themes",
        "--no-skills",
        "--tools",
        "read",
    ]
    for skill_file in skill_files:
        common_command.extend(["--skill", str(skill_file)])

    results: list[dict[str, Any]] = []
    environment = os.environ.copy()
    environment["PI_SKIP_VERSION_CHECK"] = "1"

    for index, case in enumerate(fixtures, start=1):
        prompt = ROUTE_PROMPT.format(request=case["prompt"])
        started = datetime.now(timezone.utc)
        timed_out = False
        try:
            completed = subprocess.run(
                [*common_command, prompt],
                cwd=repo,
                env=environment,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=args.timeout,
                check=False,
            )
            stdout = completed.stdout
            stderr = completed.stderr
            exit_code = completed.returncode
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            stdout = exc.stdout if isinstance(exc.stdout, str) else ""
            stderr = exc.stderr if isinstance(exc.stderr, str) else ""
            exit_code = 124

        duration = (datetime.now(timezone.utc) - started).total_seconds()
        parsed = parse_events(stdout, known_skills)
        target = case["skill"]
        loaded = parsed["loadedSkills"]
        if case["expected"] == "invoke":
            passed = exit_code == 0 and loaded == [target]
        else:
            passed = exit_code == 0 and target not in loaded

        result = {
            **case,
            **parsed,
            "pass": passed,
            "exitCode": exit_code,
            "timedOut": timed_out,
            "durationSeconds": round(duration, 3),
        }
        results.append(result)

        stem = cases_dir / case["id"]
        stem.with_suffix(".jsonl").write_text(stdout, encoding="utf-8")
        stem.with_suffix(".stderr.txt").write_text(stderr, encoding="utf-8")
        outcome = "PASS" if passed else "FAIL"
        print(
            f"[{index:02d}/{len(fixtures):02d}] {outcome} {case['id']} "
            f"expected={case['expected']} loaded={loaded or ['none']} "
            f"reported={parsed['reportedRoute'] or 'none'} {duration:.1f}s",
            flush=True,
        )

    passed_count = sum(1 for result in results if result["pass"])
    total_usage = {
        key: sum(result["usage"][key] for result in results)
        for key in ("input", "output", "cacheRead", "cacheWrite", "reasoning", "totalTokens", "cost")
    }
    summary = {
        "timestamp": timestamp,
        "repo": str(repo),
        "provider": args.provider,
        "model": args.model,
        "thinking": args.thinking,
        "cases": len(results),
        "passed": passed_count,
        "failed": len(results) - passed_count,
        "passRate": passed_count / len(results),
        "usage": total_usage,
        "results": results,
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"SUMMARY {passed_count}/{len(results)} pass "
        f"tokens={int(total_usage['totalTokens'])} cost=${total_usage['cost']:.4f} "
        f"output={output_dir}"
    )
    raise SystemExit(0 if passed_count == len(results) else 1)


if __name__ == "__main__":
    main()
