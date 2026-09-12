#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
VALIDATOR_PATH = Path(__file__).resolve().parents[1] / "validate_repo_contract.py"
SPEC = importlib.util.spec_from_file_location("validate_repo_contract", VALIDATOR_PATH)
assert SPEC and SPEC.loader
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)


class ContractFixture(unittest.TestCase):
    def create_repo(self, agents_lines: int = 1) -> Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        (root / "AGENTS.md").write_text("\n".join("rule" for _ in range(agents_lines)) + "\n", encoding="utf-8")
        (root / ".agents" / "skills").mkdir(parents=True)
        return root

    def write_skill(
        self,
        root: Path,
        name: str = "example-skill",
        frontmatter: str | None = None,
        body: str = "# Example\n",
        directory: str | None = None,
    ) -> Path:
        skill_dir = root / ".agents" / "skills" / (directory or name)
        skill_dir.mkdir(parents=True, exist_ok=True)
        metadata = frontmatter or f"name: {name}\ndescription: What this skill does and when to use it."
        path = skill_dir / "SKILL.md"
        path.write_text(f"---\n{metadata}\n---\n{body}", encoding="utf-8")
        return path

    def codes(self, report) -> set[str]:
        return {finding.code for finding in report.findings}


class FrontmatterParserTest(ContractFixture):
    def test_parses_plain_quoted_and_folded_scalars(self) -> None:
        block = """name: example-skill
plain: value
single: 'it''s valid'
double: "line\\nvalue"
quoted-hash: "value # retained"
description: >-
  Does useful work across
  several inputs. Use when needed.
literal: |-
  first
  second
"""
        parsed = VALIDATOR.parse_frontmatter(block)
        self.assertEqual(parsed["plain"], "value")
        self.assertEqual(parsed["single"], "it's valid")
        self.assertEqual(parsed["double"], "line\nvalue")
        self.assertEqual(parsed["quoted-hash"], "value # retained")
        self.assertEqual(parsed["description"], "Does useful work across several inputs. Use when needed.")
        self.assertEqual(parsed["literal"], "first\nsecond")

    def test_parses_crlf_and_utf8_bom(self) -> None:
        block, body = VALIDATOR.split_frontmatter(
            "\ufeff---\r\nname: example-skill\r\ndescription: 說明\r\n---\r\n# Body\r\n"
        )
        self.assertEqual(VALIDATOR.parse_frontmatter(block)["description"], "說明")
        self.assertEqual(body, "# Body\n")

    def test_parses_string_metadata_map(self) -> None:
        parsed = VALIDATOR.parse_frontmatter(
            'name: example-skill\ndescription: Useful skill\nmetadata:\n  author: example-org\n  version: "1.0"'
        )
        self.assertEqual(parsed["metadata"], {"author": "example-org", "version": "1.0"})

    def test_rejects_duplicate_and_unexpected_indentation(self) -> None:
        with self.assertRaisesRegex(VALIDATOR.FrontmatterError, "duplicate"):
            VALIDATOR.parse_frontmatter("name: one\nname: two")
        with self.assertRaisesRegex(VALIDATOR.FrontmatterError, "indentation"):
            VALIDATOR.parse_frontmatter("  name: one")

    def test_preserves_unknown_collection_syntax_for_lenient_clients(self) -> None:
        self.assertEqual(VALIDATOR.parse_frontmatter("interfaces: [one, two]")["interfaces"], "[one, two]")
        parsed = VALIDATOR.parse_frontmatter(
            "interfaces:\n  - name: one\n    properties:\n      value: two"
        )
        self.assertIn("- name: one", parsed["interfaces"])


class MetadataContractTest(ContractFixture):
    def test_accepts_complete_agent_skills_metadata(self) -> None:
        root = self.create_repo()
        self.write_skill(
            root,
            frontmatter="""name: example-skill
description: >-
  Analyze examples. Use when an example needs analysis.
license: MIT
compatibility: Requires Python 3.
metadata:
  author: example-org
  version: "1.0"
allowed-tools: Read Bash(git:*)
disable-model-invocation: true""",
        )
        report = VALIDATOR.validate_repository(root)
        self.assertEqual(report.errors, ())
        self.assertEqual(report.description_chars, 53)

    def test_requires_skill_file_and_frontmatter(self) -> None:
        root = self.create_repo()
        (root / ".agents" / "skills" / "missing").mkdir()
        self.write_skill(root, name="bad-frontmatter").write_text("# Missing\n", encoding="utf-8")
        report = VALIDATOR.validate_repository(root)
        self.assertEqual(self.codes(report), {"skill-file-missing", "skill-frontmatter-invalid"})

    def test_name_length_boundaries(self) -> None:
        valid_name = "a" * 64
        root = self.create_repo()
        self.write_skill(root, name="a")
        self.write_skill(root, name=valid_name)
        too_long = "b" * 65
        self.write_skill(root, name=too_long)
        report = VALIDATOR.validate_repository(root)
        self.assertEqual([item.code for item in report.errors], ["skill-name-length"])

    def test_rejects_name_format_and_path_mismatch(self) -> None:
        root = self.create_repo()
        cases = {
            "uppercase": "Uppercase",
            "leading": "-leading",
            "trailing": "trailing-",
            "double": "two--hyphens",
        }
        for directory, name in cases.items():
            self.write_skill(root, name=name, directory=directory)
        self.write_skill(root, name="different-name", directory="path-name")
        report = VALIDATOR.validate_repository(root)
        codes = [item.code for item in report.errors]
        self.assertEqual(codes.count("skill-name-format"), 4)
        self.assertEqual(codes.count("skill-name-path"), 1)

    def test_description_length_boundaries_and_types(self) -> None:
        root = self.create_repo()
        self.write_skill(root, name="one", frontmatter="name: one\ndescription: x")
        self.write_skill(root, name="maximum", frontmatter=f"name: maximum\ndescription: {'x' * 1024}")
        self.write_skill(root, name="folded-over", frontmatter=f"name: folded-over\ndescription: >\n  {'x' * 1024}")
        self.write_skill(root, name="empty", frontmatter="name: empty\ndescription: ''")
        self.write_skill(root, name="too-long", frontmatter=f"name: too-long\ndescription: {'x' * 1025}")
        self.write_skill(root, name="boolean", frontmatter="name: boolean\ndescription: true")
        report = VALIDATOR.validate_repository(root)
        codes = [item.code for item in report.errors]
        self.assertEqual(codes.count("skill-description-length"), 3)
        self.assertEqual(codes.count("skill-description-invalid"), 1)

    def test_optional_field_constraints(self) -> None:
        root = self.create_repo()
        self.write_skill(root, name="compat-ok", frontmatter=f"name: compat-ok\ndescription: useful\ncompatibility: {'x' * 500}")
        self.write_skill(root, name="compat", frontmatter=f"name: compat\ndescription: useful\ncompatibility: {'x' * 501}")
        self.write_skill(root, name="license-type", frontmatter="name: license-type\ndescription: useful\nlicense: true")
        self.write_skill(root, name="metadata-type", frontmatter="name: metadata-type\ndescription: useful\nmetadata:\n  version: 1")
        self.write_skill(root, name="tools-type", frontmatter="name: tools-type\ndescription: useful\nallowed-tools: true")
        report = VALIDATOR.validate_repository(root)
        self.assertEqual(
            self.codes(report),
            {
                "skill-compatibility-invalid",
                "skill-license-invalid",
                "skill-metadata-invalid",
                "skill-allowed-tools-invalid",
            },
        )


class ContextSignalTest(ContractFixture):
    def test_missing_agents_is_nonblocking_but_missing_skills_is_an_error(self) -> None:
        missing_agents = self.create_repo()
        (missing_agents / "AGENTS.md").unlink()
        self.write_skill(missing_agents)
        report = VALIDATOR.validate_repository(missing_agents)
        self.assertIn("agents-file-missing", self.codes(report))
        self.assertEqual(report.errors, ())

        missing_skills = self.create_repo()
        (missing_skills / ".agents" / "skills").rmdir()
        report = VALIDATOR.validate_repository(missing_skills)
        self.assertEqual([item.code for item in report.errors], ["skills-directory-missing"])

    def test_agents_line_signal_is_nonblocking(self) -> None:
        at_limit = self.create_repo(VALIDATOR.AGENTS_REVIEW_LINES)
        self.write_skill(at_limit)
        self.assertNotIn("agents-lines", self.codes(VALIDATOR.validate_repository(at_limit)))

        over_limit = self.create_repo(VALIDATOR.AGENTS_REVIEW_LINES + 1)
        self.write_skill(over_limit)
        report = VALIDATOR.validate_repository(over_limit)
        self.assertIn("agents-lines", self.codes(report))
        self.assertEqual(report.errors, ())

    def test_agents_portability_signal_is_nonblocking(self) -> None:
        root = self.create_repo()
        (root / "AGENTS.md").write_text("x" * VALIDATOR.AGENTS_PORTABILITY_BYTES, encoding="utf-8")
        self.write_skill(root)
        report = VALIDATOR.validate_repository(root)
        self.assertIn("agents-portability", self.codes(report))
        self.assertEqual(report.errors, ())

    def test_skill_line_signal_is_nonblocking(self) -> None:
        at_limit = self.create_repo()
        self.write_skill(at_limit, body="\n".join("instruction" for _ in range(496)) + "\n")
        self.assertNotIn("skill-lines", self.codes(VALIDATOR.validate_repository(at_limit)))

        over_limit = self.create_repo()
        self.write_skill(over_limit, body="\n".join("instruction" for _ in range(497)) + "\n")
        report = VALIDATOR.validate_repository(over_limit)
        self.assertIn("skill-lines", self.codes(report))
        self.assertEqual(report.errors, ())

    def test_skill_token_estimate_is_nonblocking(self) -> None:
        under_limit = self.create_repo()
        self.write_skill(under_limit, body="x" * ((VALIDATOR.SKILL_PERFORMANCE_TOKENS - 1) * VALIDATOR.ESTIMATED_BYTES_PER_TOKEN))
        self.assertNotIn("skill-token-estimate", self.codes(VALIDATOR.validate_repository(under_limit)))

        at_limit = self.create_repo()
        body = "x" * (VALIDATOR.SKILL_PERFORMANCE_TOKENS * VALIDATOR.ESTIMATED_BYTES_PER_TOKEN)
        self.write_skill(at_limit, body=body)
        report = VALIDATOR.validate_repository(at_limit)
        self.assertIn("skill-token-estimate", self.codes(report))
        self.assertEqual(report.errors, ())

    def test_focus_signals_are_nonblocking(self) -> None:
        root = self.create_repo()
        (root / "AGENTS.md").write_text("## Skill Routing\n", encoding="utf-8")
        body = "Summary:\nValidation:\nRisk:\nNext step:\n"
        self.write_skill(root, body=body)
        report = VALIDATOR.validate_repository(root)
        self.assertEqual(
            self.codes(report),
            {"agents-routing-owner", "skill-report-owner"},
        )
        self.assertEqual(report.errors, ())

    def test_bounds_emitted_findings_without_changing_error_state(self) -> None:
        findings = tuple(
            VALIDATOR.Finding("REVIEW", "example", f"path-{index}", "bounded")
            for index in range(VALIDATOR.MAX_EMITTED_FINDINGS + 5)
        )
        emitted, omitted = VALIDATOR.emitted_findings(findings)
        self.assertEqual(len(emitted), VALIDATOR.MAX_EMITTED_FINDINGS)
        self.assertEqual(omitted, 5)

    def test_findings_have_deterministic_severity_path_order(self) -> None:
        root = self.create_repo(VALIDATOR.AGENTS_REVIEW_LINES + 1)
        self.write_skill(root, name="z-skill", frontmatter="name: wrong\ndescription: useful")
        self.write_skill(root, name="a-skill", body="Summary:\nValidation:\nRisk:\nNext step:\n")
        report = VALIDATOR.validate_repository(root)
        actual = [(item.severity, item.path, item.code) for item in report.findings]
        expected = sorted(actual, key=lambda item: (VALIDATOR.SEVERITY_ORDER[item[0]], item[1], item[2]))
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
