#!/usr/bin/env python3
"""Validate the devops-pi-agent skill, extension, and documentation contract."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


def run(command: list[str], cwd: Path) -> tuple[bool, str]:
    completed = subprocess.run(
        command,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return completed.returncode == 0, completed.stdout.strip()


def frontmatter(skill_file: Path) -> tuple[str, str, bool] | None:
    text = skill_file.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)", text, flags=re.DOTALL)
    if not match:
        return None

    block = match.group(1)

    def value(key: str) -> str | None:
        field = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*$", block, flags=re.MULTILINE)
        if not field:
            return None
        return field.group(1).strip().strip('"\'')

    name = value("name")
    description = value("description")
    disabled = bool(
        re.search(
            r"^disable-model-invocation:\s*true\s*$",
            block,
            flags=re.MULTILINE | re.IGNORECASE,
        )
    )
    if not name or not description:
        return None
    return name, description, disabled


def main() -> None:
    if len(sys.argv) > 2:
        print("usage: validate_repo_contract.py [repo-root]", file=sys.stderr)
        raise SystemExit(2)

    repo = (
        Path(sys.argv[1]).expanduser().resolve()
        if len(sys.argv) == 2
        else Path(__file__).resolve().parents[4]
    )
    errors: list[str] = []

    skills_root = repo / ".agents" / "skills"
    agents_path = repo / "AGENTS.md"
    readme_path = repo / "README.md"
    package_path = repo / "package.json"
    if not all((skills_root.is_dir(), agents_path.is_file(), readme_path.is_file(), package_path.is_file())):
        print(f"ERROR: not a devops-pi-agent repository: {repo}", file=sys.stderr)
        raise SystemExit(1)

    agents_text = agents_path.read_text(encoding="utf-8")
    agents_lines = len(agents_text.splitlines())
    if agents_lines > 230:
        errors.append(f"AGENTS.md context budget exceeded: {agents_lines} > 230 lines")
    if re.search(r"^## Skill Routing\s*$", agents_text, flags=re.MULTILINE):
        errors.append("AGENTS.md must not contain a skill routing table")

    readme = readme_path.read_text(encoding="utf-8")
    skill_names: set[str] = set()
    model_invoked: set[str] = set()
    model_description_chars = 0
    for skill_dir in sorted(path for path in skills_root.iterdir() if path.is_dir()):
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.is_file():
            errors.append(f"skill directory has no SKILL.md: {skill_dir.relative_to(repo)}")
            continue

        parsed = frontmatter(skill_file)
        if parsed is None:
            errors.append(f"invalid or incomplete frontmatter: {skill_file.relative_to(repo)}")
            continue
        name, description, disabled = parsed
        skill_names.add(skill_dir.name)
        skill_lines = len(skill_file.read_text(encoding="utf-8").splitlines())
        if skill_lines > 85:
            errors.append(f"SKILL.md context budget exceeded: {skill_dir.name} has {skill_lines} lines")
        if len(description) > 320:
            errors.append(f"skill description too long: {skill_dir.name} has {len(description)} characters")
        if name != skill_dir.name:
            errors.append(f"skill name/path mismatch: {name} != {skill_dir.name}")
        if not (skill_dir / "agents" / "openai.yaml").is_file():
            errors.append(f"missing UI metadata: {skill_dir.name}/agents/openai.yaml")
        if f".agents/skills/{skill_dir.name}/" not in readme:
            errors.append(f"README inventory missing skill: {skill_dir.name}")
        if not disabled:
            model_invoked.add(skill_dir.name)
            model_description_chars += len(description)
            if "Use " not in description or "Do not use" not in description:
                errors.append(
                    f"model-invoked description lacks positive/negative boundary: {skill_dir.name}"
                )

    if model_description_chars > 2100:
        errors.append(
            f"automatic description budget exceeded: {model_description_chars} > 2100 characters"
        )

    package = json.loads(package_path.read_text(encoding="utf-8"))
    configured_extensions = set(package.get("pi", {}).get("extensions", []))
    extension_dirs = {
        f"./extensions/{path.name}"
        for path in (repo / "extensions").iterdir()
        if path.is_dir() and (path / "index.ts").is_file()
    }
    if configured_extensions != extension_dirs:
        missing = sorted(extension_dirs - configured_extensions)
        extra = sorted(configured_extensions - extension_dirs)
        errors.append(f"package extension mismatch; missing={missing}, extra={extra}")
    for extension in sorted(extension_dirs):
        extension_name = Path(extension).name
        if extension_name not in readme:
            errors.append(f"README does not name extension: {extension_name}")

    for config_file in sorted((repo / "config").glob("*.json")):
        try:
            json.loads(config_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid JSON {config_file.relative_to(repo)}: {exc}")

    fixture_validator = repo / ".agents" / "shared" / "skill-quality" / "scripts" / "validate_invocation_fixtures.py"
    ok, output = run([sys.executable, str(fixture_validator)], repo)
    if not ok:
        errors.append(f"invocation fixture validation failed: {output}")

    ok, output = run(["git", "diff", "--check"], repo)
    if not ok:
        errors.append(f"git diff --check failed: {output}")

    extension_tests = sorted(str(path.relative_to(repo)) for path in (repo / "extensions").glob("*/test.mjs"))
    if extension_tests:
        test_command = ["node"]
        subagent_loader = repo / "extensions" / "subagents" / "test-loader.mjs"
        if subagent_loader.is_file():
            test_command.extend(["--import", f"./{subagent_loader.relative_to(repo)}"])
        test_command.extend(["--test", *extension_tests])
        ok, output = run(test_command, repo)
        if not ok:
            errors.append(f"extension tests failed: {output}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)

    print(
        "OK: "
        f"{len(skill_names)} skills ({len(model_invoked)} model-invoked), "
        f"{len(extension_dirs)} extensions, {len(extension_tests)} extension test files"
    )


if __name__ == "__main__":
    main()
