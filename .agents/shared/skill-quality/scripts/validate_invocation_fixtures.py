#!/usr/bin/env python3
"""Validate the structure of shared skill invocation regression fixtures."""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path


REQUIRED_FIELDS = {"id", "skill", "expected", "prompt", "reason"}
EXPECTED_VALUES = {"invoke", "skip"}


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    script_path = Path(__file__).resolve()
    shared_root = script_path.parents[1]
    agents_root = script_path.parents[3]
    fixture_path = shared_root / "fixtures" / "invocation-cases.json"
    skills_root = agents_root / "skills"

    try:
        cases = json.loads(fixture_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read {fixture_path}: {exc}")

    if not isinstance(cases, list) or not cases:
        fail("fixture root must be a non-empty JSON array")

    seen_ids: set[str] = set()
    seen_prompts: set[str] = set()
    coverage: dict[str, set[str]] = defaultdict(set)

    for index, case in enumerate(cases, start=1):
        if not isinstance(case, dict):
            fail(f"case {index} must be an object")

        missing = REQUIRED_FIELDS - case.keys()
        extra = case.keys() - REQUIRED_FIELDS
        if missing or extra:
            fail(
                f"case {index} fields mismatch; missing={sorted(missing)}, "
                f"extra={sorted(extra)}"
            )

        case_id = case["id"]
        skill = case["skill"]
        expected = case["expected"]
        prompt = case["prompt"]
        reason = case["reason"]

        if not all(isinstance(value, str) and value.strip() for value in case.values()):
            fail(f"case {index} fields must be non-empty strings")
        if case_id in seen_ids:
            fail(f"duplicate case id: {case_id}")
        if prompt in seen_prompts:
            fail(f"duplicate prompt: {prompt}")
        if expected not in EXPECTED_VALUES:
            fail(f"case {case_id} has invalid expected value: {expected}")
        if not (skills_root / skill / "SKILL.md").is_file():
            fail(f"case {case_id} references missing skill: {skill}")
        if not reason.endswith("."):
            fail(f"case {case_id} reason must end with a period")

        seen_ids.add(case_id)
        seen_prompts.add(prompt)
        coverage[skill].add(expected)

    model_invoked_skills: set[str] = set()
    for skill_file in sorted(skills_root.glob("*/SKILL.md")):
        text = skill_file.read_text(encoding="utf-8")
        frontmatter = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)", text, flags=re.DOTALL)
        if not frontmatter:
            fail(f"skill has invalid frontmatter: {skill_file}")
        disabled = re.search(
            r"^disable-model-invocation:\s*true\s*$",
            frontmatter.group(1),
            flags=re.MULTILINE | re.IGNORECASE,
        )
        if not disabled:
            model_invoked_skills.add(skill_file.parent.name)

    unexpected = set(coverage) - model_invoked_skills
    if unexpected:
        fail(f"fixtures reference non-model-invoked skills: {sorted(unexpected)}")

    missing = model_invoked_skills - set(coverage)
    if missing:
        fail(f"model-invoked skills lack invocation fixtures: {sorted(missing)}")

    for skill in sorted(model_invoked_skills):
        if coverage[skill] != EXPECTED_VALUES:
            fail(f"skill {skill} must have both invoke and skip cases")

    print(
        f"OK: {len(cases)} invocation fixtures across {len(coverage)} skills "
        "with positive and negative coverage"
    )


if __name__ == "__main__":
    main()
