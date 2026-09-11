#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPT_PATH = Path(__file__).resolve().parents[1] / "wiki.py"
SPEC = importlib.util.spec_from_file_location("llm_wiki", SCRIPT_PATH)
assert SPEC and SPEC.loader
WIKI = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = WIKI
SPEC.loader.exec_module(WIKI)
REPO = SCRIPT_PATH.resolve().parents[4]
FIND_FIXTURES = SCRIPT_PATH.parent / "fixtures" / "find-cases.json"


class RepositoryFixture:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root_index = root / "knowledge" / "INDEX.md"
        self.topic_index = root / "knowledge" / "topics" / "examples" / "INDEX.md"
        self.note = root / "knowledge" / "notes" / "fundamentals" / "bounded-example.md"
        self.write_valid()

    def write(self, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def write_valid(self) -> None:
        self.write(
            self.root_index,
            """# Topic Index

| Topic | Keywords | When to search | Index |
| --- | --- | --- | --- |
| examples | bounded, example | Searching bounded example knowledge | [Index](topics/examples/INDEX.md) |
""",
        )
        self.write(
            self.topic_index,
            """# Example Notes

| ID | Type | Status | Keywords | Aliases | Summary | Note |
| --- | --- | --- | --- | --- | --- | --- |
| bounded-example | fundamental | verified | bounded, example | small-search | A bounded index returns metadata without reading note bodies. | [Note](../../notes/fundamentals/bounded-example.md) |
""",
        )
        self.write(
            self.note,
            """---
id: bounded-example
title: Bounded example
type: fundamental
status: verified
topic: examples
summary: A bounded index returns metadata without reading note bodies.
when_to_read: Testing deterministic Markdown wiki behavior.
keywords: [bounded, example]
aliases: [small-search]
scope: public-source
created: 2026-09-11
updated: 2026-09-11
---

# Bounded example

## TL;DR

The index keeps lookup small. [S1]

## When To Read

Use this for a checker fixture.

## Knowledge

The note body contains the sentinel NOTE_BODY_SENTINEL.

## Sources

| ID | Source | Accessed | Supports |
| --- | --- | --- | --- |
| S1 | [Agent Skills Specification](https://agentskills.io/specification) | 2026-09-11 | Progressive disclosure separates discovery metadata from detailed resources. |

## Related Notes

- None.
""",
        )


class CurrentRepositoryFindFixtureTest(unittest.TestCase):
    def test_find_cases(self) -> None:
        cases = json.loads(FIND_FIXTURES.read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["id"]):
                result = WIKI.find_notes(REPO, case["query"], 5)
                self.assertEqual(result["topic"], case["topic"])
                note_ids = [match["id"] for match in result["matches"]]
                if case["note"] is None:
                    self.assertEqual(note_ids, [])
                else:
                    self.assertIn(case["note"], note_ids)

    def test_find_output_uses_indexes_without_note_body(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            result = WIKI.find_notes(fixture.root, "bounded small search", 5)
            rendered = json.dumps(result)
            self.assertIn("bounded-example", rendered)
            self.assertNotIn("NOTE_BODY_SENTINEL", rendered)

    def test_find_returns_at_most_five_metadata_matches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            rows = []
            for number in range(6):
                rows.append(
                    f"| bounded-example-{number} | fundamental | verified | bounded, example | small-search-{number} | "
                    f"Bounded example metadata {number}. | [Note](../../notes/fundamentals/bounded-example.md) |"
                )
            fixture.topic_index.write_text(
                "# Example Notes\n\n"
                "| ID | Type | Status | Keywords | Aliases | Summary | Note |\n"
                "| --- | --- | --- | --- | --- | --- | --- |\n"
                + "\n".join(rows)
                + "\n",
                encoding="utf-8",
            )
            result = WIKI.find_notes(fixture.root, "bounded example", 5)
            self.assertEqual(len(result["matches"]), 5)

    def test_find_rejects_more_than_five_results(self) -> None:
        with self.assertRaisesRegex(ValueError, "between 1 and 5"):
            WIKI.find_notes(REPO, "markdown", 6)

    def test_find_rejects_oversized_selected_topic_index(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            with fixture.topic_index.open("a", encoding="utf-8") as stream:
                stream.write("\n" + "x" * WIKI.TOPIC_INDEX_LIMIT)
            with self.assertRaisesRegex(WIKI.WikiFormatError, "topic index exceeds"):
                WIKI.find_notes(fixture.root, "bounded example", 5)


class WikiCheckTest(unittest.TestCase):
    def check_fixture(self, fixture: RepositoryFixture) -> WIKI.CheckResult:
        return WIKI.check_repository(fixture.root)

    def test_accepts_valid_repository(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            result = self.check_fixture(fixture)
            self.assertEqual(result.errors, ())
            self.assertEqual((result.topics, result.notes, result.sources), (1, 1, 1))

    def test_rejects_root_index_over_size_limit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            with fixture.root_index.open("a", encoding="utf-8") as stream:
                stream.write("\n" + "x" * WIKI.ROOT_INDEX_LIMIT)
            result = self.check_fixture(fixture)
            self.assertTrue(any("knowledge/INDEX.md exceeds" in error for error in result.errors))

    def test_rejects_mutable_github_file_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            content = fixture.note.read_text(encoding="utf-8").replace(
                "https://agentskills.io/specification",
                "https://github.com/example/project/blob/main/docs/guide.md",
            )
            fixture.note.write_text(content, encoding="utf-8")
            result = self.check_fixture(fixture)
            self.assertTrue(
                any("full commit-SHA permalink" in error for error in result.errors)
            )

    def test_rejects_synthetic_scope_without_case_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            content = fixture.note.read_text(encoding="utf-8").replace(
                "scope: public-source", "scope: synthetic-private-case"
            )
            fixture.note.write_text(content, encoding="utf-8")
            result = self.check_fixture(fixture)
            self.assertTrue(any("educational-case notice" in error for error in result.errors))
            self.assertTrue(any("Synthetic Source Packet" in error for error in result.errors))

    def test_rejects_verified_incident_without_cause_fix_and_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            content = fixture.note.read_text(encoding="utf-8")
            content = content.replace("type: fundamental", "type: incident")
            content = content.replace(
                "## Sources",
                """## Investigation

Evidence remains incomplete.

## Wrong Turns

- None recorded.

## Root Cause And Contributing Factors

- Root cause: unknown

## Resolution

- Applied change: pending

## Validation

- Behavior checked: pending
- Result: inconclusive

## Sources""",
            )
            incident_path = (
                fixture.root
                / "knowledge"
                / "notes"
                / "incidents"
                / "bounded-example.md"
            )
            fixture.write(incident_path, content)
            fixture.note.unlink()
            fixture.topic_index.write_text(
                fixture.topic_index.read_text(encoding="utf-8").replace(
                    "| bounded-example | fundamental |",
                    "| bounded-example | incident |",
                ).replace(
                    "../../notes/fundamentals/bounded-example.md",
                    "../../notes/incidents/bounded-example.md",
                ),
                encoding="utf-8",
            )
            result = self.check_fixture(fixture)
            for label in ("Root cause", "Applied change", "Behavior checked", "Result"):
                self.assertTrue(
                    any(f"requires supported {label}" in error for error in result.errors),
                    msg=f"missing error for {label}: {result.errors}",
                )

    def test_rejects_non_english_wiki_prose(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            with fixture.root_index.open("a", encoding="utf-8") as stream:
                stream.write("\n這不是英文。\n")
            result = self.check_fixture(fixture)
            self.assertTrue(any("must be written in English" in error for error in result.errors))

    def test_rejects_no_ai_slop_banned_wording(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            with fixture.root_index.open("a", encoding="utf-8") as stream:
                stream.write("\nThis guide will delve into the index.\n")
            result = self.check_fixture(fixture)
            self.assertTrue(any("banned wording: delve" in error for error in result.errors))

    def test_rejects_index_metadata_drift(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            content = fixture.topic_index.read_text(encoding="utf-8").replace(
                "A bounded index returns metadata without reading note bodies.",
                "A different summary.",
            )
            fixture.topic_index.write_text(content, encoding="utf-8")
            result = self.check_fixture(fixture)
            self.assertTrue(any("Summary mismatch" in error for error in result.errors))

    def test_rejects_external_link_outside_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fixture = RepositoryFixture(Path(directory))
            content = fixture.note.read_text(encoding="utf-8").replace(
                "The note body contains the sentinel NOTE_BODY_SENTINEL.",
                "Read [mutable guidance](https://example.com/guide) next.",
            )
            fixture.note.write_text(content, encoding="utf-8")
            result = self.check_fixture(fixture)
            self.assertTrue(
                any("external links must appear in the Sources table" in error for error in result.errors)
            )


if __name__ == "__main__":
    unittest.main()
