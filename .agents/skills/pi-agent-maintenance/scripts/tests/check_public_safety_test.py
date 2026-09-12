#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[1] / "check_public_safety.py"
SPEC = importlib.util.spec_from_file_location("check_public_safety", SCRIPT)
assert SPEC and SPEC.loader
CHECKER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CHECKER
SPEC.loader.exec_module(CHECKER)


class PublicSafetyTest(unittest.TestCase):
    def repository(self, base: Path) -> Path:
        repo = base / "repo"
        repo.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        return repo

    def write(self, repo: Path, relative: str, content: str) -> None:
        path = repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def test_accepts_reserved_placeholders_and_public_identifiers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = self.repository(Path(directory))
            self.write(
                repo,
                "AGENTS.md",
                "https://git.example.test/<organization>/<repository>\n"
                "example-service@example-project.iam.gserviceaccount.com\n",
            )

            findings, count = CHECKER.scan(repo, [])

            self.assertEqual(findings, [])
            self.assertEqual(count, 1)

    def test_detects_generic_private_patterns_without_echoing_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = self.repository(Path(directory))
            private_ip = "10." + "24.5.6"
            private_url = "https://service" + ".internal/path"
            home_path = "/" + "home/example-user/workspace"
            bare_private_host = "cache" + ".internal"
            service_account = "runtime@actual-test-project" + ".iam.gserviceaccount.com"
            self.write(
                repo,
                "extensions/example/README.md",
                "\n".join((private_ip, private_url, bare_private_host, home_path, service_account)),
            )

            findings, _ = CHECKER.scan(repo, [])
            output = "\n".join(finding.format() for finding in findings)

            self.assertIn("private IPv4 address", output)
            self.assertIn("private hostname", output)
            self.assertIn("machine-specific home path", output)
            self.assertIn("non-synthetic service account identifier", output)
            for value in (private_ip, private_url, bare_private_host, home_path, service_account):
                self.assertNotIn(value, output)

    def test_accepts_public_ci_and_package_manager_home_roots(self) -> None:
        for line in (
            "/home/runner/work/<repository>/<repository>",
            "/home/linuxbrew/.linuxbrew/bin",
        ):
            self.assertEqual(CHECKER.line_findings("README.md", 1, line, []), [])

    def test_detects_terminal_linux_and_macos_home_paths(self) -> None:
        linux_path = "HOME=/" + "home/example-user"
        macos_path = "USER_HOME=/" + "Users/example-user"
        path_list = "PATH=/" + "home/example-user:/usr/bin"

        linux_findings = CHECKER.line_findings("AGENTS.md", 1, linux_path, [])
        macos_findings = CHECKER.line_findings("AGENTS.md", 2, macos_path, [])
        path_list_findings = CHECKER.line_findings("AGENTS.md", 3, path_list, [])

        self.assertEqual([finding.category for finding in linux_findings], ["machine-specific home path"])
        self.assertEqual([finding.category for finding in macos_findings], ["machine-specific home path"])
        self.assertEqual([finding.category for finding in path_list_findings], ["machine-specific home path"])

    def test_machine_local_terms_cover_paths_and_text_without_echoing_term(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            repo = self.repository(base)
            term = "confidential-marker"
            terms_file = base / "private-terms.txt"
            terms_file.write_text(f"# local only\n{term}\n", encoding="utf-8")
            self.write(repo, f".agents/skills/{term}/SKILL.md", "safe text\n")
            self.write(repo, "AGENTS.md", f"contains {term}\n")

            terms = CHECKER.load_private_terms(repo, str(terms_file))
            findings, _ = CHECKER.scan(repo, terms)
            output = "\n".join(finding.format() for finding in findings)

            self.assertIn("private term in path", output)
            self.assertIn("private term", output)
            self.assertNotIn(term, output)

    def test_rejects_repository_local_or_empty_terms_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            repo = self.repository(base)
            local_terms = repo / "tmp" / "private-terms.txt"
            local_terms.parent.mkdir()
            local_terms.write_text("private-name\n", encoding="utf-8")
            empty_terms = base / "empty.txt"
            empty_terms.write_text("# no terms\n", encoding="utf-8")
            missing_terms = base / "missing.txt"

            with self.assertRaisesRegex(ValueError, "outside the repository"):
                CHECKER.load_private_terms(repo, str(local_terms))
            with self.assertRaisesRegex(ValueError, "contains no terms"):
                CHECKER.load_private_terms(repo, str(empty_terms))
            with self.assertRaisesRegex(ValueError, "missing or unreadable"):
                CHECKER.load_private_terms(repo, str(missing_terms))


if __name__ == "__main__":
    unittest.main()
