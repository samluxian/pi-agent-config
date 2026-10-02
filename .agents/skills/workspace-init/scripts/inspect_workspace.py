#!/usr/bin/env python3
"""Read-only workspace discovery and private-context destination checks."""

import argparse
import json
import subprocess
from pathlib import Path


class UnsafeWorkspace(ValueError):
    pass


def git(path, *args):
    result = subprocess.run(
        ["git", "-C", str(path), *args], capture_output=True, text=True,
        timeout=10, check=False,
    )
    output = result.stdout if result.returncode == 0 else result.stderr
    return result.returncode, output.strip()


def inspect(workspace, skills_repo):
    owner = Path(skills_repo).resolve(strict=True)
    # Match init-workspace.sh: explicit directory, otherwise the skills repo's parent.
    root = Path(workspace).resolve(strict=True) if workspace is not None else owner.parent
    if not root.is_dir() or root == owner or owner in root.parents:
        raise UnsafeWorkspace("Workspace must be outside the public skills repository.")
    destination = root / ".pi" / "APPEND_SYSTEM.md"
    if (root / ".pi").is_symlink() or destination.is_symlink():
        raise UnsafeWorkspace("Private context path must not use symlinks.")
    if (root / ".pi").exists() and not (root / ".pi").is_dir():
        raise UnsafeWorkspace("The .pi path is not a directory.")
    if destination.exists() and not destination.is_file():
        raise UnsafeWorkspace("Private context destination is not a regular file.")
    # A .pi directory can itself be a repository, so inspect the closest existing parent.
    parent = destination.parent if destination.parent.exists() else root
    code, top = git(parent, "rev-parse", "--show-toplevel")
    if code == 0:
        repo = Path(top).resolve(strict=True)
        relative = str(destination.relative_to(repo))
        tracked, _ = git(repo, "ls-files", "--error-unmatch", "--", relative)
        if tracked == 0:
            raise UnsafeWorkspace("Private context destination is already tracked by Git.")
        if tracked != 1:
            raise UnsafeWorkspace("Cannot establish private context tracking status.")
        ignored, _ = git(repo, "check-ignore", "-q", "--", relative)
        if ignored != 0:
            raise UnsafeWorkspace("Private context must already be ignored by its owning repository.")
        boundary = "ignored and untracked"
    else:
        # Git is only a destination privacy check, never the workspace definition.
        # Do not inspect ancestor .git directories or special-case cache artifacts.
        if code != 128 or not top.startswith("fatal: not a git repository"):
            raise UnsafeWorkspace("Cannot establish private context destination ownership.")
        boundary = "outside Git repositories"
    projects = []
    candidates = sorted(p for p in root.iterdir() if not p.name.startswith("."))
    omitted = 0
    for child in candidates:
        if child.is_symlink() or not child.is_dir() or child.resolve() == owner:
            continue
        if child.name in {"node_modules", "vendor", "dist", "build", "coverage", "tmp", "__pycache__"}:
            continue
        if len(projects) >= 30:
            omitted += 1
            continue
        files = [name for name in ("AGENTS.md", "README.md", "Makefile", "package.json")
                 if (child / name).is_file() and not (child / name).is_symlink()]
        projects.append({"path": str(child), "candidate_files": files})
    return {
        "workspace": str(root), "context_path": str(destination),
        "context_exists": destination.exists(), "git_boundary": boundary,
        "projects": projects, "omitted_projects": omitted,
        "coverage": "direct non-hidden directories; Git tracking not required; symlinks and build/cache paths excluded",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-root", help="Defaults to the parent of --skills-repo.")
    parser.add_argument("--skills-repo", required=True)
    args = parser.parse_args()
    try:
        result = inspect(args.workspace_root, args.skills_repo)
    except UnsafeWorkspace as error:
        print(json.dumps({"status": "blocked", "reason": str(error)}))
        return 1
    except (OSError, subprocess.SubprocessError, ValueError):
        print(json.dumps({"status": "blocked", "reason": "Workspace or Git inspection failed; do not write."}))
        return 1
    print(json.dumps({"status": "ready", **result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
