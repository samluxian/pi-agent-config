#!/usr/bin/env python3
"""Check the current repository snapshot for private-company information."""

from __future__ import annotations

import argparse
import ipaddress
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


IPV4_PATTERN = re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])")
HOME_PATH_PATTERN = re.compile(
    r"(?<![A-Za-z0-9._/-])(/(?:home|Users)/[A-Za-z0-9._-]+)"
    r"(?=/|$|[^A-Za-z0-9._-])"
)
PRIVATE_HOST_PATTERN = re.compile(
    r"(?<![A-Za-z0-9.-])"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?\.)+"
    r"(?:corp|internal|lan|local)(?::\d+)?"
    r"(?![A-Za-z0-9._-])",
    re.IGNORECASE,
)
SERVICE_ACCOUNT_PATTERN = re.compile(
    r"[A-Za-z0-9._%+-]+@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com",
    re.IGNORECASE,
)
SYNTHETIC_PROJECT_IDS = {
    "demo-project",
    "example-project",
    "fake-project",
    "sample-project",
    "test-project",
}
ALLOWED_HOME_ROOTS = ("/home/linuxbrew", "/home/runner")
DOCUMENTATION_IPV4_NETWORKS = tuple(
    ipaddress.ip_network(cidr)
    for cidr in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
)


@dataclass(frozen=True)
class Finding:
    category: str
    path: str
    line: int | None = None

    def format(self) -> str:
        location = f"{self.path}:{self.line}" if self.line is not None else self.path
        return f"{self.category}: {location}"


def repository_root(argument: str | None) -> Path:
    return (
        Path(argument).expanduser().resolve()
        if argument
        else Path(__file__).resolve().parents[4]
    )


def current_files(repo: Path) -> list[Path]:
    completed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(f"cannot list repository files: {detail}")
    files: list[Path] = []
    for raw in completed.stdout.split(b"\0"):
        if not raw:
            continue
        relative = raw.decode("utf-8", errors="surrogateescape")
        path = repo / relative
        if path.is_file() or path.is_symlink():
            files.append(path)
    return sorted(files)


def load_private_terms(repo: Path, explicit_path: str | None) -> list[str]:
    configured = explicit_path or os.environ.get("PI_PUBLIC_SAFETY_TERMS_FILE")
    if not configured:
        return []
    path = Path(configured).expanduser().resolve()
    try:
        path.relative_to(repo)
    except ValueError:
        pass
    else:
        raise ValueError("private terms file must stay outside the repository")
    if not path.is_file():
        raise ValueError("configured private terms file is missing or unreadable")
    terms = [
        line.strip().casefold()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not terms:
        raise ValueError("configured private terms file contains no terms")
    if any(len(term) < 3 for term in terms):
        raise ValueError("private terms must contain at least three characters")
    return sorted(set(terms))


def private_ipv4(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    return (
        isinstance(address, ipaddress.IPv4Address)
        and (address.is_private or address.is_link_local)
        and not address.is_loopback
        and not address.is_unspecified
        and not any(address in network for network in DOCUMENTATION_IPV4_NETWORKS)
    )


def line_findings(relative: str, line_number: int, line: str, terms: list[str]) -> list[Finding]:
    findings: list[Finding] = []
    if any(private_ipv4(match.group(0)) for match in IPV4_PATTERN.finditer(line)):
        findings.append(Finding("private IPv4 address", relative, line_number))
    home_paths = (match.group(1) for match in HOME_PATH_PATTERN.finditer(line))
    if any(path not in ALLOWED_HOME_ROOTS for path in home_paths):
        findings.append(Finding("machine-specific home path", relative, line_number))
    if PRIVATE_HOST_PATTERN.search(line):
        findings.append(Finding("private hostname", relative, line_number))
    for match in SERVICE_ACCOUNT_PATTERN.finditer(line):
        project = match.group(1).casefold()
        if project not in SYNTHETIC_PROJECT_IDS:
            findings.append(Finding("non-synthetic service account identifier", relative, line_number))
            break
    folded = line.casefold()
    if terms and any(term in folded for term in terms):
        findings.append(Finding("private term", relative, line_number))
    return findings


def scan(repo: Path, terms: list[str]) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    files = current_files(repo)
    for path in files:
        relative = path.relative_to(repo).as_posix()
        folded_path = relative.casefold()
        private_path = bool(terms and any(term in folded_path for term in terms))
        report_path = "<redacted-path>" if private_path else relative
        if private_path:
            findings.append(Finding("private term in path", report_path))
        raw = (
            os.readlink(path).encode("utf-8", errors="surrogateescape")
            if path.is_symlink()
            else path.read_bytes()
        )
        if b"\0" in raw:
            continue
        text = raw.decode("utf-8", errors="replace")
        for line_number, line in enumerate(text.splitlines(), start=1):
            findings.extend(line_findings(report_path, line_number, line, terms))
    unique = sorted(set(findings), key=lambda item: (item.path, item.line or 0, item.category))
    return unique, len(files)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_root", nargs="?", help="Repository root; defaults to this repository")
    parser.add_argument(
        "--terms-file",
        help="Machine-local literal private-term file outside the repository",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    repo = repository_root(args.repo_root)
    if not (repo / ".git").exists():
        print(f"ERROR: not a Git repository: {repo}", file=sys.stderr)
        return 1
    try:
        terms = load_private_terms(repo, args.terms_file)
        findings, file_count = scan(repo, terms)
    except (OSError, UnicodeError, ValueError) as exc:
        print(f"ERROR: public-safety scan failed: {exc}", file=sys.stderr)
        return 1
    if findings:
        for finding in findings:
            print(f"ERROR: {finding.format()}", file=sys.stderr)
        return 1
    coverage = f"{len(terms)} machine-local terms" if terms else "generic patterns only"
    print(f"OK: public-safety scan passed ({file_count} files; {coverage})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
