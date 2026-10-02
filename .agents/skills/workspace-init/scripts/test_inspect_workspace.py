#!/usr/bin/env python3
"""Synthetic, offline tests; no Git/cloud/LLM mutation."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "inspect_workspace", Path(__file__).with_name("inspect_workspace.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
NO_REPOSITORY = (128, "fatal: not a git repository (or any of the parent directories): .git")


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.owner = self.root / "agent-tooling"
        self.owner.mkdir()

    def inspect(self):
        return module.inspect(self.root, self.owner)

    def test_outside_git_inventory_excludes_symlinks_and_secrets(self):
        project = self.root / "example-service"
        project.mkdir()
        (project / ".git").mkdir()
        (project / "README.md").write_text("# Synthetic service")
        (project / ".env").write_text("DO NOT READ")
        (project / "state.tfstate").write_text("DO NOT READ")
        (self.root / "alias").symlink_to(project, target_is_directory=True)
        with patch.object(module, "git", return_value=NO_REPOSITORY):
            result = self.inspect()
        self.assertEqual(result["git_boundary"], "outside Git repositories")
        self.assertEqual(result["projects"], [{"path": str(project), "candidate_files": ["README.md"]}])
        self.assertFalse(result["context_exists"])
        self.assertFalse((self.root / ".pi").exists())

    def test_existing_context_is_not_read_or_overwritten(self):
        destination = self.root / ".pi" / "APPEND_SYSTEM.md"
        destination.parent.mkdir()
        destination.write_text("preserve me")
        with patch.object(module, "git", return_value=NO_REPOSITORY), patch.object(Path, "read_text", side_effect=AssertionError("no content reads")):
            self.assertTrue(self.inspect()["context_exists"])
        self.assertEqual(destination.read_text(), "preserve me")

    def test_git_requires_ignored_untracked_context(self):
        with patch.object(module, "git", side_effect=[(0, str(self.root)), (1, ""), (0, "")]):
            self.assertEqual(self.inspect()["git_boundary"], "ignored and untracked")
        for responses in [
            [(0, str(self.root)), (0, "tracked")],
            [(0, str(self.root)), (1, ""), (1, "")],
            [(0, str(self.root)), (128, "")],
        ]:
            with patch.object(module, "git", side_effect=responses), self.assertRaises(module.UnsafeWorkspace):
                self.inspect()

    def test_nested_pi_repository_is_checked(self):
        pi = self.root / ".pi"
        pi.mkdir()
        with patch.object(module, "git", side_effect=[(0, str(pi)), (1, ""), (0, "")]) as query:
            self.inspect()
        self.assertEqual(query.call_args_list[0].args[0], pi)
        self.assertEqual(query.call_args_list[1].args[-1], "APPEND_SYSTEM.md")

    def test_default_workspace_matches_initializer(self):
        with patch.object(module, "git", return_value=NO_REPOSITORY):
            self.assertEqual(module.inspect(None, self.owner)["workspace"], str(self.owner.parent))

    def test_explicit_workspace_does_not_depend_on_git_root(self):
        workspace = self.root / "explicit-workspace"
        workspace.mkdir()
        with patch.object(module, "git", side_effect=[(0, str(self.root)), (1, ""), (0, "")]):
            self.assertEqual(module.inspect(workspace, self.owner)["workspace"], str(workspace))

    def test_empty_ancestor_marker_is_not_inspected(self):
        (self.root / ".git").mkdir()
        workspace = self.root / "nested-workspace"
        workspace.mkdir()
        with patch.object(module, "git", return_value=NO_REPOSITORY), patch.object(Path, "read_text", side_effect=AssertionError("no content reads")):
            self.assertEqual(module.inspect(workspace, self.owner)["git_boundary"], "outside Git repositories")
        self.assertEqual(list((self.root / ".git").iterdir()), [])

    def test_other_git_errors_stop(self):
        for result in [(128, ""), (128, "fatal: detected dubious ownership"),
                       (128, "fatal: invalid gitfile format"), (1, "error")]:
            with patch.object(module, "git", return_value=result), self.assertRaises(module.UnsafeWorkspace):
                self.inspect()

    def test_non_git_projects_are_included_and_caches_excluded(self):
        project = self.root / "untracked-project"
        project.mkdir()
        (project / "README.md").write_text("# Synthetic local project")
        for name in ("tmp", "node_modules", "build"):
            (self.root / name).mkdir()
        with patch.object(module, "git", return_value=NO_REPOSITORY):
            self.assertEqual(self.inspect()["projects"], [{"path": str(project), "candidate_files": ["README.md"]}])

    def test_public_repository_and_symlink_destinations_stop(self):
        with self.assertRaises(module.UnsafeWorkspace):
            module.inspect(self.owner, self.owner)
        (self.root / ".pi").symlink_to(self.owner, target_is_directory=True)
        with self.assertRaises(module.UnsafeWorkspace):
            self.inspect()
        (self.root / ".pi").unlink()
        (self.root / ".pi").mkdir()
        (self.root / ".pi" / "APPEND_SYSTEM.md").symlink_to(self.owner / "missing")
        with self.assertRaises(module.UnsafeWorkspace):
            self.inspect()

    def test_inventory_is_bounded(self):
        for index in range(32):
            project = self.root / f"example-{index:02}"
            project.mkdir()
            (project / ".git").mkdir()
        with patch.object(module, "git", return_value=NO_REPOSITORY):
            result = self.inspect()
        self.assertEqual(len(result["projects"]), 30)
        self.assertEqual(result["omitted_projects"], 2)


if __name__ == "__main__":
    unittest.main()
