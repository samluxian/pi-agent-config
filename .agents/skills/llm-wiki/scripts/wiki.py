#!/usr/bin/env python3
"""Bounded lookup and deterministic validation for the Markdown knowledge wiki."""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT_INDEX_LIMIT = 12 * 1024
TOPIC_INDEX_LIMIT = 24 * 1024
NOTE_LIMIT = 48 * 1024
MAX_FIND_RESULTS = 5
MAX_REPORTED_ERRORS = 50

ROOT_COLUMNS = ("Topic", "Keywords", "When to search", "Index")
TOPIC_COLUMNS = (
    "ID",
    "Type",
    "Status",
    "Keywords",
    "Aliases",
    "Summary",
    "Note",
)
SOURCE_COLUMNS = ("ID", "Source", "Accessed", "Supports")
REQUIRED_FIELDS = (
    "id",
    "title",
    "type",
    "status",
    "topic",
    "summary",
    "when_to_read",
    "keywords",
    "aliases",
    "scope",
    "created",
    "updated",
)
ALLOWED_TYPES = {"fundamental", "incident", "decision", "runbook"}
ALLOWED_STATUSES = {"draft", "open", "verified", "superseded", "archived"}
ALLOWED_SCOPES = {"public-source", "synthetic-private-case", "repository-public-case"}
TYPE_DIRECTORIES = {
    "fundamental": "fundamentals",
    "incident": "incidents",
    "decision": "decisions",
    "runbook": "runbooks",
}
SHARED_HEADINGS = (
    "## TL;DR",
    "## When To Read",
    "## Knowledge",
    "## Sources",
    "## Related Notes",
)
INCIDENT_HEADINGS = (
    "## Investigation",
    "## Wrong Turns",
    "## Root Cause And Contributing Factors",
    "## Resolution",
    "## Validation",
)
SYNTHETIC_NOTICE = "Synthetic educational case — not a sanitized incident record."
KEBAB_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TERM_RE = re.compile(r"^[a-z0-9][a-z0-9+._-]*$")
MARKER_RE = re.compile(r"\[(S[1-9][0-9]*)\]")
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
NON_ENGLISH_SCRIPT_RE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]")
NO_AI_SLOP_BANNED_WORDS = (
    "delve",
    "foster",
    "leverage",
    "utilize",
    "facilitate",
    "empower",
    "streamline",
    "robust",
    "cutting-edge",
    "paradigm shift",
    "game changer",
    "this is huge",
    "this changes everything",
    "tapestry",
    "realm",
    "beacon",
    "multifaceted",
    "meticulous",
    "intricate",
    "paramount",
    "transformative",
    "elevate",
    "embark",
    "supercharge",
    "harness",
    "ever-evolving",
)
NO_AI_SLOP_FILLER_PHRASES = (
    "it's worth noting",
    "it is worth noting",
    "it's important to note",
    "it is important to note",
    "at the end of the day",
    "when it comes to",
    "at its core",
    "in today's world",
    "in the age of",
    "in the world of",
    "the reality is",
    "the truth is",
    "in terms of",
    "with regard to",
    "in order to",
    "going forward",
    "in this article",
    "let's dive in",
    "here's the thing",
    "let me be clear",
    "what nobody tells you",
    "the part everyone misses",
    "marks a pivotal moment",
    "stands as a testament",
    "plays a vital role",
    "experts agree",
    "studies show",
)


class WikiFormatError(ValueError):
    """Raised when an index cannot be used safely."""


@dataclass(frozen=True)
class RootTopic:
    name: str
    keywords: tuple[str, ...]
    when: str
    index_path: Path


@dataclass(frozen=True)
class IndexNote:
    note_id: str
    note_type: str
    status: str
    keywords: tuple[str, ...]
    aliases: tuple[str, ...]
    summary: str
    note_path: Path


@dataclass(frozen=True)
class Note:
    path: Path
    metadata: dict[str, str | tuple[str, ...]]
    body: str


@dataclass(frozen=True)
class CheckResult:
    errors: tuple[str, ...]
    topics: int
    notes: int
    sources: int


def repository_root(script_path: Path | None = None) -> Path:
    return (script_path or Path(__file__)).resolve().parents[4]


def split_table_row(line: str) -> tuple[str, ...]:
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        raise WikiFormatError(f"invalid Markdown table row: {line.strip()}")
    return tuple(cell.strip() for cell in stripped[1:-1].split("|"))


def is_separator_row(cells: tuple[str, ...]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def find_table(text: str, columns: tuple[str, ...], label: str) -> list[tuple[str, ...]]:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("|"):
            continue
        try:
            header = split_table_row(line)
        except WikiFormatError:
            continue
        if header != columns:
            continue
        if index + 1 >= len(lines):
            break
        separator = split_table_row(lines[index + 1])
        if len(separator) != len(columns) or not is_separator_row(separator):
            raise WikiFormatError(f"{label} has an invalid separator row")
        rows: list[tuple[str, ...]] = []
        for row_line in lines[index + 2 :]:
            if not row_line.lstrip().startswith("|"):
                break
            row = split_table_row(row_line)
            if len(row) != len(columns):
                raise WikiFormatError(
                    f"{label} row has {len(row)} cells; expected {len(columns)}"
                )
            rows.append(row)
        return rows
    raise WikiFormatError(f"{label} is missing the required table")


def parse_csv(cell: str) -> tuple[str, ...]:
    if not cell or cell == "-":
        return ()
    return tuple(part.strip() for part in cell.split(",") if part.strip())


def parse_link(cell: str, label: str) -> str:
    match = re.fullmatch(r"\[[^\]]+\]\(([^)]+)\)", cell.strip())
    if not match:
        raise WikiFormatError(f"{label} must be one Markdown link")
    return match.group(1).strip()


def resolve_local_link(document: Path, target: str, root: Path, label: str) -> Path:
    path_part = target.split("#", 1)[0]
    if not path_part or target.startswith(("http://", "https://", "mailto:")):
        raise WikiFormatError(f"{label} must be a relative repository link")
    resolved = (document.parent / path_part).resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError as exc:
        raise WikiFormatError(f"{label} escapes the repository: {target}") from exc
    return resolved


def bounded_index_terms(cell: str, label: str) -> tuple[str, ...]:
    values = parse_csv(cell)
    if len(values) > 32:
        raise WikiFormatError(f"{label} has more than 32 terms")
    if any(len(value) > 64 for value in values):
        raise WikiFormatError(f"{label} contains a term longer than 64 characters")
    return values


def load_root_topics(repo: Path) -> list[RootTopic]:
    index_path = repo / "knowledge" / "INDEX.md"
    try:
        if index_path.stat().st_size > ROOT_INDEX_LIMIT:
            raise WikiFormatError(
                f"knowledge/INDEX.md exceeds {ROOT_INDEX_LIMIT} bytes"
            )
        text = index_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise WikiFormatError(f"cannot read {index_path.relative_to(repo)}: {exc}") from exc
    rows = find_table(text, ROOT_COLUMNS, "knowledge/INDEX.md")
    topics: list[RootTopic] = []
    for number, row in enumerate(rows, start=1):
        name, keyword_cell, when, link_cell = row
        if not KEBAB_RE.fullmatch(name):
            raise WikiFormatError(f"root index row {number} has invalid topic: {name}")
        if len(when) > 320:
            raise WikiFormatError(f"root index row {number} context exceeds 320 characters")
        target = parse_link(link_cell, f"root index row {number} Index")
        topics.append(
            RootTopic(
                name=name,
                keywords=bounded_index_terms(
                    keyword_cell, f"root index row {number} Keywords"
                ),
                when=when,
                index_path=resolve_local_link(index_path, target, repo, "topic index"),
            )
        )
    return topics


def load_topic_notes(repo: Path, topic: RootTopic) -> list[IndexNote]:
    try:
        if topic.index_path.stat().st_size > TOPIC_INDEX_LIMIT:
            raise WikiFormatError(
                f"topic index exceeds {TOPIC_INDEX_LIMIT} bytes: "
                f"{topic.index_path.relative_to(repo)}"
            )
        text = topic.index_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise WikiFormatError(
            f"cannot read {topic.index_path.relative_to(repo)}: {exc}"
        ) from exc
    rows = find_table(text, TOPIC_COLUMNS, f"topic index {topic.name}")
    notes: list[IndexNote] = []
    for number, row in enumerate(rows, start=1):
        note_id, note_type, status, keywords, aliases, summary, link_cell = row
        if not KEBAB_RE.fullmatch(note_id):
            raise WikiFormatError(f"{topic.name} row {number} has invalid ID: {note_id}")
        if note_type not in ALLOWED_TYPES:
            raise WikiFormatError(f"{topic.name} row {number} has invalid Type: {note_type}")
        if status not in ALLOWED_STATUSES:
            raise WikiFormatError(f"{topic.name} row {number} has invalid Status: {status}")
        if len(summary) > 240:
            raise WikiFormatError(f"{topic.name} row {number} Summary exceeds 240 characters")
        target = parse_link(link_cell, f"{topic.name} row {number} Note")
        notes.append(
            IndexNote(
                note_id=note_id,
                note_type=note_type,
                status=status,
                keywords=bounded_index_terms(
                    keywords, f"{topic.name} row {number} Keywords"
                ),
                aliases=bounded_index_terms(
                    aliases, f"{topic.name} row {number} Aliases"
                ),
                summary=summary,
                note_path=resolve_local_link(topic.index_path, target, repo, "note"),
            )
        )
    return notes


def tokens(text: str) -> tuple[str, ...]:
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return tuple(re.findall(r"[^\W_]+", normalized, flags=re.UNICODE))


def phrase_matches(query_tokens: set[str], phrase: str) -> bool:
    phrase_tokens = set(tokens(phrase))
    return bool(phrase_tokens) and phrase_tokens.issubset(query_tokens)


def route_score(query_tokens: set[str], topic: RootTopic) -> tuple[int, list[str]]:
    score = 0
    matched: list[str] = []
    if phrase_matches(query_tokens, topic.name):
        score += 14
        matched.append(f"topic:{topic.name}")
    for keyword in topic.keywords:
        if phrase_matches(query_tokens, keyword):
            score += 12
            matched.append(f"keyword:{keyword}")
    overlap = query_tokens.intersection(tokens(topic.when))
    if len(overlap) >= 2:
        score += len(overlap) * 2
        matched.extend(f"context:{term}" for term in sorted(overlap))
    return score, matched


def note_score(query_tokens: set[str], note: IndexNote) -> tuple[int, list[str]]:
    score = 0
    matched: list[str] = []
    strong_match = False
    for alias in note.aliases:
        if phrase_matches(query_tokens, alias):
            score += 14
            matched.append(f"alias:{alias}")
            strong_match = True
    for keyword in note.keywords:
        if phrase_matches(query_tokens, keyword):
            score += 12
            matched.append(f"keyword:{keyword}")
            strong_match = True
    if phrase_matches(query_tokens, note.note_id):
        score += 10
        matched.append(f"id:{note.note_id}")
        strong_match = True
    overlap = query_tokens.intersection(tokens(note.summary))
    if strong_match or len(overlap) >= 2:
        score += len(overlap) * 2
        matched.extend(f"summary:{term}" for term in sorted(overlap))
    else:
        return 0, []
    return score, matched


def find_notes(repo: Path, query: str, limit: int = MAX_FIND_RESULTS) -> dict[str, object]:
    if not 1 <= limit <= MAX_FIND_RESULTS:
        raise ValueError(f"limit must be between 1 and {MAX_FIND_RESULTS}")
    if len(query) > 512:
        raise ValueError("query must not exceed 512 characters")
    query_tokens = set(tokens(query))
    if not query_tokens:
        raise ValueError("query must contain at least one searchable term")

    ranked_topics: list[tuple[int, str, RootTopic]] = []
    for topic in load_root_topics(repo):
        score, _ = route_score(query_tokens, topic)
        if score:
            ranked_topics.append((score, topic.name, topic))
    if not ranked_topics:
        return {"topic": None, "topic_index": None, "matches": []}

    _, _, selected_topic = sorted(
        ranked_topics, key=lambda item: (-item[0], item[1])
    )[0]
    status_rank = {"verified": 0, "open": 1, "draft": 2, "superseded": 3, "archived": 4}
    ranked_notes: list[tuple[int, int, str, IndexNote, list[str]]] = []
    for note in load_topic_notes(repo, selected_topic):
        score, matched = note_score(query_tokens, note)
        if score:
            ranked_notes.append(
                (
                    score,
                    status_rank.get(note.status, 9),
                    note.note_id,
                    note,
                    matched,
                )
            )

    matches: list[dict[str, object]] = []
    for score, _, _, note, matched in sorted(
        ranked_notes, key=lambda item: (-item[0], item[1], item[2])
    )[:limit]:
        matches.append(
            {
                "id": note.note_id,
                "type": note.note_type,
                "status": note.status,
                "score": score,
                "matched": matched[:8],
                "summary": note.summary,
                "path": note.note_path.relative_to(repo).as_posix(),
            }
        )

    return {
        "topic": selected_topic.name,
        "topic_index": selected_topic.index_path.relative_to(repo).as_posix(),
        "matches": matches,
    }


def parse_frontmatter(path: Path) -> Note:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)(.*)\Z", text, flags=re.DOTALL)
    if not match:
        raise WikiFormatError("missing flat YAML frontmatter")
    block, body = match.groups()
    raw: dict[str, str] = {}
    for number, line in enumerate(block.splitlines(), start=2):
        if not line.strip():
            continue
        field = re.fullmatch(r"([a-z_]+):\s*(.*?)\s*", line)
        if not field:
            raise WikiFormatError(f"frontmatter line {number} is not a flat key/value")
        key, value = field.groups()
        if key in raw:
            raise WikiFormatError(f"duplicate frontmatter field: {key}")
        raw[key] = value
    missing = set(REQUIRED_FIELDS) - raw.keys()
    extra = raw.keys() - set(REQUIRED_FIELDS)
    if missing or extra:
        raise WikiFormatError(
            f"frontmatter fields mismatch; missing={sorted(missing)}, extra={sorted(extra)}"
        )

    metadata: dict[str, str | tuple[str, ...]] = {}
    for key in REQUIRED_FIELDS:
        value = raw[key]
        if key in {"keywords", "aliases"}:
            if not (value.startswith("[") and value.endswith("]")):
                raise WikiFormatError(f"{key} must use a flat bracketed list")
            metadata[key] = parse_csv(value[1:-1])
        else:
            if (
                len(value) >= 2
                and value[0] == value[-1]
                and value[0] in {"'", '"'}
            ):
                value = value[1:-1]
            metadata[key] = value
    return Note(path=path, metadata=metadata, body=body.lstrip("\n"))


def section_text(body: str, heading: str) -> str:
    match = re.search(
        rf"(?ms)^{re.escape(heading)}\s*$\n(.*?)(?=^##\s|\Z)", body
    )
    return match.group(1).strip() if match else ""


def labelled_value(section: str, label: str) -> str | None:
    match = re.search(
        rf"(?im)^\s*-\s+(?:\*\*)?{re.escape(label)}:(?:\*\*)?\s*(.+?)\s*$",
        section,
    )
    return match.group(1).strip() if match else None


def markdown_visible_text(text: str) -> str:
    visible: list[str] = []
    fence_character: str | None = None
    fence_length = 0
    for line in text.splitlines():
        stripped = line.lstrip()
        fence = re.match(r"(`{3,}|~{3,})", stripped)
        if fence_character is not None:
            if (
                fence
                and fence.group(1)[0] == fence_character
                and len(fence.group(1)) >= fence_length
            ):
                fence_character = None
                fence_length = 0
            continue
        if fence:
            fence_character = fence.group(1)[0]
            fence_length = len(fence.group(1))
            continue
        visible.append(line)
    return "\n".join(visible)


def inline_code_ranges(line: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    offset = 0
    while offset < len(line):
        start = line.find("`", offset)
        if start < 0:
            break
        marker_end = start
        while marker_end < len(line) and line[marker_end] == "`":
            marker_end += 1
        marker = line[start:marker_end]
        end = line.find(marker, marker_end)
        if end < 0:
            break
        ranges.append((start, end + len(marker)))
        offset = end + len(marker)
    return ranges


def markdown_links(document: Path) -> list[str]:
    text = markdown_visible_text(document.read_text(encoding="utf-8"))
    targets: list[str] = []
    for line in text.splitlines():
        code_ranges = inline_code_ranges(line)
        for match in MARKDOWN_LINK_RE.finditer(line):
            if any(start <= match.start() < end for start, end in code_ranges):
                continue
            targets.append(match.group(2).strip())
    return targets


def valid_date(value: str) -> bool:
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def validate_public_url(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return "source URL must use https with a hostname"
    if parsed.username or parsed.password:
        return "source URL must not contain user information"
    hostname = parsed.hostname.casefold().rstrip(".")
    if hostname == "localhost" or hostname.endswith((".local", ".internal", ".test")):
        return "source URL uses a non-public hostname"
    try:
        if ipaddress.ip_address(hostname).is_private:
            return "source URL uses a non-public IP address"
    except ValueError:
        pass

    parts = [part for part in parsed.path.split("/") if part]
    if hostname in {"github.com", "www.github.com"} and "blob" in parts:
        position = parts.index("blob")
        revision = parts[position + 1] if position + 1 < len(parts) else ""
        if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
            return "GitHub file source must use a full commit-SHA permalink"
    if hostname == "raw.githubusercontent.com":
        revision = parts[2] if len(parts) > 2 else ""
        if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
            return "raw GitHub source must use a full commit SHA"
    if "gitlab" in hostname and "-" in parts:
        marker = parts.index("-")
        if marker + 2 < len(parts) and parts[marker + 1] == "blob":
            revision = parts[marker + 2]
            if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
                return "GitLab file source must use a full commit-SHA permalink"
    return None


def validate_term_list(values: tuple[str, ...], label: str) -> list[str]:
    errors: list[str] = []
    if label == "keywords" and len(values) < 2:
        errors.append("keywords must contain at least two terms")
    if len(values) != len(set(values)):
        errors.append(f"{label} contains duplicates")
    for value in values:
        if not TERM_RE.fullmatch(value) or value != value.casefold():
            errors.append(f"invalid {label} term: {value}")
    return errors


def validate_note(note: Note, repo: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    metadata = note.metadata
    note_id = str(metadata["id"])
    note_type = str(metadata["type"])
    status = str(metadata["status"])
    topic = str(metadata["topic"])
    scope = str(metadata["scope"])
    keywords = metadata["keywords"]
    aliases = metadata["aliases"]
    assert isinstance(keywords, tuple) and isinstance(aliases, tuple)

    if not KEBAB_RE.fullmatch(note_id):
        errors.append(f"invalid id: {note_id}")
    if note.path.stem != note_id:
        errors.append(f"note filename must match id: {note.path.stem} != {note_id}")
    if note_type not in ALLOWED_TYPES:
        errors.append(f"invalid type: {note_type}")
    elif note.path.parent.name != TYPE_DIRECTORIES[note_type]:
        errors.append(
            f"type/path mismatch: {note_type} note is under {note.path.parent.name}"
        )
    if status not in ALLOWED_STATUSES:
        errors.append(f"invalid status: {status}")
    if not KEBAB_RE.fullmatch(topic):
        errors.append(f"invalid topic: {topic}")
    if scope not in ALLOWED_SCOPES:
        errors.append(f"invalid scope: {scope}")
    for field in ("title", "summary", "when_to_read"):
        value = str(metadata[field]).strip()
        if not value or re.search(r"<[^>]+>", value):
            errors.append(f"{field} is empty or contains a template placeholder")
    if len(str(metadata["summary"])) > 240:
        errors.append("summary exceeds 240 characters")
    if len(str(metadata["when_to_read"])) > 320:
        errors.append("when_to_read exceeds 320 characters")
    errors.extend(validate_term_list(keywords, "keywords"))
    errors.extend(validate_term_list(aliases, "aliases"))
    if set(keywords).intersection(aliases):
        errors.append("keywords and aliases must not overlap")
    for field in ("created", "updated"):
        if not valid_date(str(metadata[field])):
            errors.append(f"{field} must be a real YYYY-MM-DD date")
    if valid_date(str(metadata["created"])) and valid_date(str(metadata["updated"])):
        if str(metadata["updated"]) < str(metadata["created"]):
            errors.append("updated date precedes created date")

    visible_body = markdown_visible_text(note.body)
    title_line = f"# {metadata['title']}"
    h1_lines = [line for line in visible_body.splitlines() if line.startswith("# ")]
    if h1_lines != [title_line]:
        errors.append("body must contain exactly one H1 matching title")
    heading_positions: list[int] = []
    for heading in SHARED_HEADINGS:
        position = note.body.find(f"{heading}\n")
        if position < 0:
            errors.append(f"missing heading: {heading}")
        else:
            heading_positions.append(position)
    if len(heading_positions) == len(SHARED_HEADINGS) and heading_positions != sorted(
        heading_positions
    ):
        errors.append("shared headings are out of order")
    if note_type == "incident":
        for heading in INCIDENT_HEADINGS:
            if f"{heading}\n" not in note.body:
                errors.append(f"missing incident heading: {heading}")
    if re.search(r"<[A-Za-z][^>\n]{0,80}>", visible_body):
        errors.append("body contains a template placeholder")

    if scope == "synthetic-private-case":
        if note.body.count(SYNTHETIC_NOTICE) != 1:
            errors.append("synthetic note must contain the exact educational-case notice once")
        if "## Synthetic Source Packet\n" not in note.body:
            errors.append("synthetic note is missing ## Synthetic Source Packet")
        body_without_sources = re.sub(
            r"(?ms)^## Sources\s*$.*?(?=^##\s|\Z)", "", note.body
        )
        synthetic_patterns = (
            (r"(?:/home/|/Users/|[A-Za-z]:\\\\Users\\\\)", "private-looking home path"),
            (r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "email address"),
            (r"\b\d{4}-\d{2}-\d{2}\b", "exact calendar date outside Sources"),
            (r"\b(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "private-looking IPv4 address"),
            (r"\b192\.168\.\d{1,3}\.\d{1,3}\b", "private-looking IPv4 address"),
            (r"\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b", "private-looking IPv4 address"),
        )
        for pattern, label in synthetic_patterns:
            if re.search(pattern, body_without_sources):
                errors.append(f"synthetic note contains a {label}")

    if note_type == "incident" and status == "verified":
        root = labelled_value(
            section_text(note.body, "## Root Cause And Contributing Factors"),
            "Root cause",
        )
        applied = labelled_value(section_text(note.body, "## Resolution"), "Applied change")
        behavior = labelled_value(section_text(note.body, "## Validation"), "Behavior checked")
        result = labelled_value(section_text(note.body, "## Validation"), "Result")
        required_values = {
            "Root cause": root,
            "Applied change": applied,
            "Behavior checked": behavior,
            "Result": result,
        }
        unsupported = re.compile(
            r"\b(?:unknown|inconclusive|not established|not verified|not applied|pending)\b",
            flags=re.IGNORECASE,
        )
        for label, value in required_values.items():
            if not value or unsupported.search(value):
                errors.append(f"verified incident requires supported {label}")

    source_section = section_text(note.body, "## Sources")
    source_count = 0
    if source_section:
        try:
            source_rows = find_table(source_section, SOURCE_COLUMNS, "Sources")
        except WikiFormatError as exc:
            errors.append(str(exc))
            source_rows = []
        source_ids: set[str] = set()
        for row_number, row in enumerate(source_rows, start=1):
            source_id, source_cell, accessed, supports = row
            source_count += 1
            if not re.fullmatch(r"S[1-9][0-9]*", source_id):
                errors.append(f"source row {row_number} has invalid ID: {source_id}")
            if source_id in source_ids:
                errors.append(f"duplicate source ID: {source_id}")
            source_ids.add(source_id)
            try:
                url = parse_link(source_cell, f"source {source_id}")
            except WikiFormatError as exc:
                errors.append(str(exc))
                continue
            url_error = validate_public_url(url)
            if url_error:
                errors.append(f"source {source_id}: {url_error}")
            if not valid_date(accessed):
                errors.append(f"source {source_id} has invalid access date")
            if not supports or re.search(r"<[^>]+>", supports):
                errors.append(f"source {source_id} has no concrete Supports claim")
        prose_before_sources = note.body.split("## Sources", 1)[0]
        markers = set(MARKER_RE.findall(markdown_visible_text(prose_before_sources)))
        for source_id in sorted(source_ids - markers):
            errors.append(f"source {source_id} has no claim-local marker")
        for marker in sorted(markers - source_ids):
            errors.append(f"claim marker {marker} has no source row")
    else:
        errors.append("Sources section is empty")

    body_without_sources = re.sub(
        r"(?ms)^## Sources\s*$.*?(?=^##\s|\Z)", "", note.body
    )
    visible_without_sources = markdown_visible_text(body_without_sources)
    for _, target in MARKDOWN_LINK_RE.findall(visible_without_sources):
        if target.startswith(("https://", "http://")):
            errors.append("external links must appear in the Sources table")
    if re.search(r"(?<!\()https?://", visible_without_sources):
        errors.append("bare external URLs must appear in the Sources table")

    return errors, source_count


def check_wiki_style(document: Path) -> list[str]:
    text = document.read_text(encoding="utf-8")
    errors: list[str] = []
    visible = markdown_visible_text(text)
    visible = re.sub(r"(?ms)^## Sources\s*$.*?(?=^##\s|\Z)", "", visible)
    prose = re.sub(r"`+[^`\n]*`+", "", visible)
    if NON_ENGLISH_SCRIPT_RE.search(prose):
        errors.append("wiki prose and metadata must be written in English")

    normalized = unicodedata.normalize("NFKC", prose).casefold()
    for phrase in (*NO_AI_SLOP_BANNED_WORDS, *NO_AI_SLOP_FILLER_PHRASES):
        if re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", normalized):
            errors.append(f"no-ai-slop banned wording: {phrase}")
    return errors


def check_relative_links(document: Path, repo: Path) -> list[str]:
    errors: list[str] = []
    for target in markdown_links(document):
        if target.startswith(("https://", "http://", "mailto:", "#")):
            continue
        path_part = target.split("#", 1)[0]
        if not path_part:
            continue
        resolved = (document.parent / path_part).resolve()
        try:
            resolved.relative_to(repo.resolve())
        except ValueError:
            errors.append(f"relative link escapes repository: {target}")
            continue
        if not resolved.exists():
            errors.append(f"broken relative link: {target}")
    return errors


def check_repository(repo: Path) -> CheckResult:
    repo = repo.resolve()
    knowledge = repo / "knowledge"
    errors: list[str] = []
    root_index = knowledge / "INDEX.md"
    if not root_index.is_file():
        return CheckResult(("missing knowledge/INDEX.md",), 0, 0, 0)
    if root_index.stat().st_size > ROOT_INDEX_LIMIT:
        errors.append(
            f"knowledge/INDEX.md exceeds {ROOT_INDEX_LIMIT} bytes: {root_index.stat().st_size}"
        )

    try:
        topics = load_root_topics(repo)
    except WikiFormatError as exc:
        return CheckResult((str(exc),), 0, 0, 0)

    topic_names: set[str] = set()
    topic_paths: set[Path] = set()
    indexed_notes: dict[Path, list[tuple[str, IndexNote]]] = {}
    topic_indexes: dict[str, list[IndexNote]] = {}
    for topic in topics:
        if not KEBAB_RE.fullmatch(topic.name):
            errors.append(f"root index has invalid topic: {topic.name}")
        if topic.name in topic_names:
            errors.append(f"root index has duplicate topic: {topic.name}")
        topic_names.add(topic.name)
        if topic.index_path in topic_paths:
            errors.append(f"root index repeats topic path: {topic.index_path.relative_to(repo)}")
        topic_paths.add(topic.index_path)
        expected_path = knowledge / "topics" / topic.name / "INDEX.md"
        if topic.index_path != expected_path.resolve():
            errors.append(
                f"topic {topic.name} index path must be "
                f"{expected_path.relative_to(repo).as_posix()}"
            )
        errors.extend(validate_term_list(topic.keywords, f"topic {topic.name} keywords"))
        if not topic.when:
            errors.append(f"topic {topic.name} has empty When to search")
        if not topic.index_path.is_file():
            errors.append(f"missing topic index: {topic.index_path.relative_to(repo)}")
            continue
        if topic.index_path.stat().st_size > TOPIC_INDEX_LIMIT:
            errors.append(
                f"topic index exceeds {TOPIC_INDEX_LIMIT} bytes: "
                f"{topic.index_path.relative_to(repo)}"
            )
        try:
            entries = load_topic_notes(repo, topic)
        except WikiFormatError as exc:
            errors.append(str(exc))
            continue
        topic_indexes[topic.name] = entries
        seen_entry_ids: set[str] = set()
        for entry in entries:
            if entry.note_id in seen_entry_ids:
                errors.append(f"topic {topic.name} repeats note ID: {entry.note_id}")
            seen_entry_ids.add(entry.note_id)
            indexed_notes.setdefault(entry.note_path, []).append((topic.name, entry))

    actual_topic_paths = {
        path.resolve()
        for path in (knowledge / "topics").glob("*/INDEX.md")
        if path.is_file()
    }
    for missing in sorted(actual_topic_paths - topic_paths):
        errors.append(f"topic index is not in root index: {missing.relative_to(repo)}")
    for missing in sorted(topic_paths - actual_topic_paths):
        if missing.exists():
            errors.append(f"root index target is not a topic INDEX.md: {missing.relative_to(repo)}")

    note_paths = sorted((knowledge / "notes").rglob("*.md"))
    notes_by_path: dict[Path, Note] = {}
    ids: dict[str, Path] = {}
    source_count = 0
    for path in note_paths:
        if path.stat().st_size > NOTE_LIMIT:
            errors.append(
                f"note exceeds {NOTE_LIMIT} bytes: {path.relative_to(repo)} ({path.stat().st_size})"
            )
        try:
            note = parse_frontmatter(path)
        except (OSError, WikiFormatError) as exc:
            errors.append(f"{path.relative_to(repo)}: {exc}")
            continue
        notes_by_path[path.resolve()] = note
        note_id = str(note.metadata["id"])
        if note_id in ids:
            errors.append(
                f"duplicate note ID {note_id}: {ids[note_id].relative_to(repo)} and "
                f"{path.relative_to(repo)}"
            )
        else:
            ids[note_id] = path
        note_errors, note_sources = validate_note(note, repo)
        source_count += note_sources
        errors.extend(f"{path.relative_to(repo)}: {error}" for error in note_errors)

    for path, note in notes_by_path.items():
        entries = indexed_notes.get(path, [])
        if not entries:
            errors.append(f"note is not indexed: {path.relative_to(repo)}")
            continue
        if len(entries) > 1:
            locations = ", ".join(topic for topic, _ in entries)
            errors.append(f"note is indexed more than once: {path.relative_to(repo)} ({locations})")
            continue
        indexed_topic, entry = entries[0]
        metadata = note.metadata
        expected = {
            "ID": str(metadata["id"]),
            "Type": str(metadata["type"]),
            "Status": str(metadata["status"]),
            "Keywords": ", ".join(metadata["keywords"]),
            "Aliases": ", ".join(metadata["aliases"]),
            "Summary": str(metadata["summary"]),
        }
        actual = {
            "ID": entry.note_id,
            "Type": entry.note_type,
            "Status": entry.status,
            "Keywords": ", ".join(entry.keywords),
            "Aliases": ", ".join(entry.aliases),
            "Summary": entry.summary,
        }
        for field in expected:
            if actual[field] != expected[field]:
                errors.append(
                    f"{path.relative_to(repo)}: topic index {field} mismatch; "
                    f"expected={expected[field]!r}, actual={actual[field]!r}"
                )
        if indexed_topic != metadata["topic"]:
            errors.append(
                f"{path.relative_to(repo)}: indexed under {indexed_topic}, "
                f"frontmatter topic is {metadata['topic']}"
            )

    for path, entries in indexed_notes.items():
        if path not in notes_by_path:
            for topic, _ in entries:
                errors.append(
                    f"topic {topic} indexes a missing or invalid note: {path.relative_to(repo)}"
                )

    wiki_documents = sorted(knowledge.rglob("*.md"))
    template_documents = sorted(
        (repo / ".agents" / "skills" / "llm-wiki" / "assets").glob("*.md")
    )
    for document in [*wiki_documents, *template_documents]:
        errors.extend(
            f"{document.relative_to(repo)}: {error}"
            for error in check_wiki_style(document)
        )
    for document in wiki_documents:
        errors.extend(
            f"{document.relative_to(repo)}: {error}"
            for error in check_relative_links(document, repo)
        )

    return CheckResult(tuple(errors), len(topics), len(notes_by_path), source_count)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Find indexed wiki notes or validate the Markdown wiki contract."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    find_parser = subparsers.add_parser(
        "find", help="return bounded metadata from one selected topic index"
    )
    find_parser.add_argument("terms", nargs="*", help="search terms")
    find_parser.add_argument("--query", help="search terms as one argument")
    find_parser.add_argument("--limit", type=int, default=MAX_FIND_RESULTS)
    find_parser.add_argument("--repo-root", type=Path, help=argparse.SUPPRESS)

    check_parser = subparsers.add_parser("check", help="validate indexes and notes")
    check_parser.add_argument("--repo-root", type=Path, help=argparse.SUPPRESS)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    repo = (args.repo_root or repository_root()).expanduser().resolve()

    if args.command == "find":
        if args.query and args.terms:
            parser.error("find accepts either positional terms or --query, not both")
        query = args.query or " ".join(args.terms)
        try:
            result = find_notes(repo, query, args.limit)
        except (OSError, ValueError, WikiFormatError) as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            raise SystemExit(1)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    result = check_repository(repo)
    if result.errors:
        for error in result.errors[:MAX_REPORTED_ERRORS]:
            print(f"ERROR: {error}", file=sys.stderr)
        remaining = len(result.errors) - MAX_REPORTED_ERRORS
        if remaining > 0:
            print(f"ERROR: {remaining} additional errors suppressed", file=sys.stderr)
        raise SystemExit(1)
    print(
        f"OK: {result.topics} topics, {result.notes} notes, "
        f"{result.sources} public sources"
    )


if __name__ == "__main__":
    main()
