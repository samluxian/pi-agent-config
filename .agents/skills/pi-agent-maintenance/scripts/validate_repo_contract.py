#!/usr/bin/env python3
"""Validate Agent Skills metadata and report instruction-context pressure."""

from __future__ import annotations

import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

AGENTS_REVIEW_LINES = 200
AGENTS_PORTABILITY_BYTES = 32 * 1024
SKILL_REVIEW_LINES = 500
SKILL_PERFORMANCE_TOKENS = 5_000
ESTIMATED_BYTES_PER_TOKEN = 4
MAX_EMITTED_FINDINGS = 100
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
FRONTMATTER_KEY = re.compile(r"^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$")
METADATA_ENTRY = re.compile(r"^[ \t]+([^:#][^:]*):(?:[ \t]*(.*))?$")


class FrontmatterError(ValueError):
    """Raised when the supported Agent Skills frontmatter profile is malformed."""


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class ValidationReport:
    findings: tuple[Finding, ...]
    skill_count: int
    description_chars: int
    agents_lines: int
    agents_bytes: int
    agents_estimated_tokens: int

    @property
    def errors(self) -> tuple[Finding, ...]:
        return tuple(item for item in self.findings if item.severity == "ERROR")


SEVERITY_ORDER = {"ERROR": 0, "REVIEW": 1, "NOTICE": 2}


def estimated_tokens(text: str) -> int:
    """Return a stable byte-derived estimate, not a model tokenizer count."""
    return math.ceil(len(text.encode("utf-8")) / ESTIMATED_BYTES_PER_TOKEN)


def split_frontmatter(text: str) -> tuple[str, str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if normalized.startswith("\ufeff"):
        normalized = normalized[1:]
    if not normalized.startswith("---\n"):
        raise FrontmatterError("missing opening YAML frontmatter delimiter")
    end = normalized.find("\n---", 4)
    if end < 0 or (end + 4 < len(normalized) and normalized[end + 4] != "\n"):
        raise FrontmatterError("missing closing YAML frontmatter delimiter")
    frontmatter = normalized[4:end]
    body = normalized[end + 4 :]
    if body.startswith("\n"):
        body = body[1:]
    return frontmatter, body


def strip_plain_comment(value: str) -> str:
    quote: str | None = None
    escaped = False
    for index, character in enumerate(value):
        if escaped:
            escaped = False
            continue
        if quote == '"' and character == "\\":
            escaped = True
            continue
        if character in {"'", '"'}:
            if quote is None:
                quote = character
            elif quote == character:
                quote = None
            continue
        if character == "#" and quote is None and index > 0 and value[index - 1].isspace():
            return value[:index].rstrip()
    return value.rstrip()


def parse_quoted_scalar(value: str) -> str:
    quote = value[0]
    if len(value) < 2 or value[-1] != quote:
        raise FrontmatterError("unterminated quoted scalar")
    inner = value[1:-1]
    if quote == "'":
        return inner.replace("''", "'")
    try:
        import json

        parsed = json.loads(value)
    except (ValueError, TypeError) as exc:
        raise FrontmatterError("invalid double-quoted scalar") from exc
    if not isinstance(parsed, str):
        raise FrontmatterError("quoted scalar is not a string")
    return parsed


def parse_inline_scalar(raw: str) -> Any:
    value = strip_plain_comment(raw.strip())
    if not value:
        return ""
    if value[0] in {"'", '"'}:
        return parse_quoted_scalar(value)
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if lowered in {"null", "~"}:
        return None
    if re.fullmatch(r"[-+]?\d+", value):
        return int(value)
    if re.fullmatch(r"[-+]?(?:\d+\.\d*|\d*\.\d+)", value):
        return float(value)
    return value


def fold_block(lines: list[str], style: str) -> str:
    values = [line.lstrip(" \t") for line in lines]
    if style.startswith("|"):
        result = "\n".join(values)
    else:
        parts: list[str] = []
        pending_break = False
        for value in values:
            if not value:
                pending_break = True
                continue
            if parts:
                parts.append("\n" if pending_break else " ")
            parts.append(value)
            pending_break = False
        result = "".join(parts)
    if style.endswith("-"):
        return result.rstrip("\n")
    return result + "\n"


def parse_frontmatter(block: str) -> dict[str, Any]:
    lines = block.split("\n")
    parsed: dict[str, Any] = {}
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            index += 1
            continue
        if line[0].isspace():
            raise FrontmatterError(f"unexpected indentation on frontmatter line {index + 1}")
        match = FRONTMATTER_KEY.fullmatch(line)
        if not match:
            raise FrontmatterError(f"invalid frontmatter line {index + 1}")
        key, raw = match.group(1), match.group(2) or ""
        if key in parsed:
            raise FrontmatterError(f"duplicate frontmatter field: {key}")
        index += 1
        if raw in {">", ">-", ">+", "|", "|-", "|+"}:
            block_lines: list[str] = []
            while index < len(lines) and (not lines[index] or lines[index][0].isspace()):
                block_lines.append(lines[index])
                index += 1
            if not block_lines:
                raise FrontmatterError(f"empty block scalar: {key}")
            parsed[key] = fold_block(block_lines, raw)
            continue
        if not raw:
            nested_lines: list[str] = []
            while index < len(lines) and (not lines[index] or lines[index][0].isspace()):
                nested_lines.append(lines[index])
                index += 1
            if key != "metadata":
                parsed[key] = "\n".join(nested_lines)
                continue
            entries: dict[str, Any] = {}
            for nested in nested_lines:
                if not nested.strip() or nested.lstrip().startswith("#"):
                    continue
                entry = METADATA_ENTRY.fullmatch(nested)
                if not entry:
                    raise FrontmatterError(f"invalid nested mapping for {key}")
                nested_key = entry.group(1).strip()
                if nested_key in entries:
                    raise FrontmatterError(f"duplicate nested field: {key}.{nested_key}")
                entries[nested_key] = parse_inline_scalar(entry.group(2) or "")
            parsed[key] = entries
            continue
        parsed[key] = parse_inline_scalar(raw)
    return parsed


def repeats_workspace_report(text: str) -> bool:
    fields = ("Summary:", "Validation:", "Risk:", "Next step:")
    return all(re.search(rf"^{re.escape(field)}\s*$", text, flags=re.MULTILINE) for field in fields)


def validate_skill(skill_dir: Path, repo: Path) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    skill_file = skill_dir / "SKILL.md"
    relative = str(skill_file.relative_to(repo))
    if not skill_file.is_file():
        return [Finding("ERROR", "skill-file-missing", relative, "skill directory must contain SKILL.md")], 0
    try:
        text = skill_file.read_text(encoding="utf-8")
        block, body = split_frontmatter(text)
        metadata = parse_frontmatter(block)
    except (OSError, UnicodeError, FrontmatterError) as exc:
        return [Finding("ERROR", "skill-frontmatter-invalid", relative, str(exc))], 0

    name = metadata.get("name")
    if not isinstance(name, str):
        findings.append(Finding("ERROR", "skill-name-invalid", relative, "name must be a string"))
    elif not (1 <= len(name) <= 64):
        findings.append(Finding("ERROR", "skill-name-length", relative, f"name has {len(name)} characters; expected 1..64"))
    elif not NAME_PATTERN.fullmatch(name):
        findings.append(Finding("ERROR", "skill-name-format", relative, "name must use lowercase letters, digits, and single internal hyphens"))
    elif name != skill_dir.name:
        findings.append(Finding("ERROR", "skill-name-path", relative, f"name {name!r} must match directory {skill_dir.name!r}"))

    description = metadata.get("description")
    description_chars = len(description) if isinstance(description, str) else 0
    if not isinstance(description, str):
        findings.append(Finding("ERROR", "skill-description-invalid", relative, "description must be a string"))
    elif not description.strip() or len(description) > 1024:
        findings.append(Finding("ERROR", "skill-description-length", relative, f"description has {len(description)} characters; expected a non-empty value of at most 1024"))

    compatibility = metadata.get("compatibility")
    if compatibility is not None and (
        not isinstance(compatibility, str) or not compatibility.strip() or len(compatibility) > 500
    ):
        findings.append(Finding("ERROR", "skill-compatibility-invalid", relative, "compatibility must be a 1..500 character string"))

    license_value = metadata.get("license")
    if license_value is not None and not isinstance(license_value, str):
        findings.append(Finding("ERROR", "skill-license-invalid", relative, "license must be a string"))

    additional_metadata = metadata.get("metadata")
    if additional_metadata is not None and (
        not isinstance(additional_metadata, dict)
        or any(not isinstance(key, str) or not isinstance(value, str) for key, value in additional_metadata.items())
    ):
        findings.append(Finding("ERROR", "skill-metadata-invalid", relative, "metadata must map string keys to string values"))

    allowed_tools = metadata.get("allowed-tools")
    if allowed_tools is not None and not isinstance(allowed_tools, str):
        findings.append(Finding("ERROR", "skill-allowed-tools-invalid", relative, "allowed-tools must be a space-separated string"))

    total_lines = len(text.splitlines())
    if total_lines > SKILL_REVIEW_LINES:
        findings.append(Finding("REVIEW", "skill-lines", relative, f"{total_lines} lines exceeds the {SKILL_REVIEW_LINES}-line review signal"))
    body_tokens = estimated_tokens(body)
    if body_tokens >= SKILL_PERFORMANCE_TOKENS:
        findings.append(Finding("NOTICE", "skill-token-estimate", relative, f"body byte-estimate is {body_tokens} tokens at 4 bytes/token; recommendation is below {SKILL_PERFORMANCE_TOKENS}"))
    if repeats_workspace_report(body):
        findings.append(Finding("REVIEW", "skill-report-owner", relative, "skill repeats the complete workspace report skeleton"))
    return findings, description_chars


def validate_repository(repo: Path) -> ValidationReport:
    findings: list[Finding] = []
    agents_path = repo / "AGENTS.md"
    skills_root = repo / ".agents" / "skills"
    agents_text = ""
    if not agents_path.is_file():
        findings.append(Finding("REVIEW", "agents-file-missing", "AGENTS.md", "always-on repository guidance is unavailable"))
    else:
        try:
            agents_text = agents_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            findings.append(Finding("REVIEW", "agents-file-invalid", "AGENTS.md", str(exc)))

    agents_lines = len(agents_text.splitlines())
    agents_bytes = len(agents_text.encode("utf-8"))
    if agents_lines > AGENTS_REVIEW_LINES:
        findings.append(Finding("REVIEW", "agents-lines", "AGENTS.md", f"{agents_lines} lines exceeds the {AGENTS_REVIEW_LINES}-line review signal"))
    if agents_bytes >= AGENTS_PORTABILITY_BYTES:
        findings.append(Finding("NOTICE", "agents-portability", "AGENTS.md", f"local file is {agents_bytes} bytes; Codex defaults to {AGENTS_PORTABILITY_BYTES} combined bytes"))
    if re.search(r"^## Skill Routing\s*$", agents_text, flags=re.MULTILINE):
        findings.append(Finding("REVIEW", "agents-routing-owner", "AGENTS.md", "skill routing belongs in skill descriptions, not always-on instructions"))

    skill_count = 0
    description_chars = 0
    if not skills_root.is_dir():
        findings.append(Finding("ERROR", "skills-directory-missing", ".agents/skills", "skills directory is missing"))
    else:
        for skill_dir in sorted(path for path in skills_root.iterdir() if path.is_dir()):
            skill_count += 1
            skill_findings, chars = validate_skill(skill_dir, repo)
            findings.extend(skill_findings)
            description_chars += chars

    findings.sort(key=lambda item: (SEVERITY_ORDER[item.severity], item.path, item.code))
    return ValidationReport(
        findings=tuple(findings),
        skill_count=skill_count,
        description_chars=description_chars,
        agents_lines=agents_lines,
        agents_bytes=agents_bytes,
        agents_estimated_tokens=estimated_tokens(agents_text),
    )


def emitted_findings(findings: tuple[Finding, ...]) -> tuple[tuple[Finding, ...], int]:
    visible = findings[:MAX_EMITTED_FINDINGS]
    return visible, len(findings) - len(visible)


def main() -> None:
    if len(sys.argv) > 2:
        print("usage: validate_repo_contract.py [repo-root]", file=sys.stderr)
        raise SystemExit(2)
    repo = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) == 2 else Path(__file__).resolve().parents[4]
    report = validate_repository(repo)
    visible_findings, omitted = emitted_findings(report.findings)
    for finding in visible_findings:
        stream = sys.stderr if finding.severity == "ERROR" else sys.stdout
        print(f"{finding.severity} [{finding.code}] {finding.path}: {finding.message}", file=stream)
    if omitted:
        print(f"NOTICE [findings-omitted] {omitted} additional findings omitted from bounded output")
    counts = {severity: sum(item.severity == severity for item in report.findings) for severity in SEVERITY_ORDER}
    print(
        "PASS" if not report.errors else "FAIL",
        f"skills={report.skill_count}",
        f"metadata_chars={report.description_chars}",
        f"agents_lines={report.agents_lines}",
        f"agents_bytes={report.agents_bytes}",
        f"agents_estimated_tokens={report.agents_estimated_tokens}",
        f"errors={counts['ERROR']}",
        f"reviews={counts['REVIEW']}",
        f"notices={counts['NOTICE']}",
    )
    raise SystemExit(1 if report.errors else 0)


if __name__ == "__main__":
    main()
