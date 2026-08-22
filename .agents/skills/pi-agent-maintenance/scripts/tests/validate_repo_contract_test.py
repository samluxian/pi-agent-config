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
SPEC.loader.exec_module(VALIDATOR)


class MarkdownLinkTargetTest(unittest.TestCase):
    target = ".agents/skills/example/README.md"

    def targets(self, content: str) -> set[str]:
        with tempfile.TemporaryDirectory() as directory:
            document = Path(directory) / "README.md"
            document.write_text(content, encoding="utf-8")
            return VALIDATOR.markdown_link_targets(document)

    def test_accepts_rendered_markdown_link(self) -> None:
        self.assertEqual(self.targets(f"[example]({self.target})\n"), {self.target})

    def test_accepts_link_with_inline_code_label(self) -> None:
        self.assertEqual(self.targets(f"[`example`]({self.target})\n"), {self.target})

    def test_rejects_bare_target_text(self) -> None:
        self.assertEqual(self.targets(f"bare text: {self.target}\n"), set())

    def test_rejects_backtick_fenced_code(self) -> None:
        content = f"```text\n[example]({self.target})\n```\n"
        self.assertEqual(self.targets(content), set())

    def test_rejects_tilde_fenced_code(self) -> None:
        content = f"~~~~markdown\n[example]({self.target})\n~~~~\n"
        self.assertEqual(self.targets(content), set())

    def test_rejects_inline_code(self) -> None:
        content = f"Use `[example]({self.target})` as an example.\n"
        self.assertEqual(self.targets(content), set())

    def test_keeps_visible_link_next_to_code_example(self) -> None:
        content = (
            f"`[example]({self.target})`\n"
            f"[real example]({self.target})\n"
        )
        self.assertEqual(self.targets(content), {self.target})


if __name__ == "__main__":
    unittest.main()
