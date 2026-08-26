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


def markdown_link_targets(document: Path) -> set[str]:
    text = markdown_visible_text(document.read_text(encoding="utf-8"))
    targets: set[str] = set()
    for line in text.splitlines():
        code_ranges = inline_code_ranges(line)
        for match in re.finditer(r"\[[^\]]+\]\(([^)]+)\)", line):
            if any(start <= match.start() < end for start, end in code_ranges):
                continue
            targets.add(match.group(1).strip())
    return targets


def relative_markdown_links(document: Path) -> list[str]:
    errors: list[str] = []
    for target in markdown_link_targets(document):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        path_part = target.split("#", 1)[0]
        if not path_part:
            continue
        resolved = (document.parent / path_part).resolve()
        if not resolved.exists():
            errors.append(target)
    return errors


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
    normalized_agents = re.sub(r"\s+", " ", agents_text)
    commit_rule = "If repository files changed, include a suggested commit message."
    if commit_rule not in normalized_agents:
        errors.append("AGENTS.md must require a suggested commit message after file changes")
    orchestration_rules = (
        "Default to bounded read-only delegation when evidence acquisition is expected to produce large raw output or require multiple independent searches or reads.",
        "Keep simple known-path I/O in the parent.",
        "the orchestrator owns role selection, bounded prompts, concurrency, authority boundaries, and reconciliation.",
        "After repository file mutations, the parent or approved worker runs the smallest validation that proves the final behavior and reports failures or skipped checks.",
    )
    for rule in orchestration_rules:
        if rule not in normalized_agents:
            errors.append(f"AGENTS.md missing cross-skill orchestration rule: {rule}")
    skills_main_rule = (
        "when explicitly requested, any repository-owned source, test, script, "
        "extension, configuration, or documentation file may be created, edited, "
        "renamed, or deleted on this skills repository's `main` branch."
    )
    if skills_main_rule not in normalized_agents:
        errors.append("AGENTS.md missing the explicit skills-repository main-branch exception")
    skills_main_exclusions = (
        "This exception does not apply to sibling or target repositories",
        "secrets, credentials, generated artifacts, caches, or git-ignored temporary files",
        "it never permits Git or remote mutations",
    )
    for exclusion in skills_main_exclusions:
        if exclusion not in normalized_agents:
            errors.append(f"AGENTS.md missing skills-repository main exclusion: {exclusion}")
    public_safety_rules = (
        "Treat this skills repository as public source.",
        "Never add company or client names",
        "Use descriptive placeholders and reserved example domains.",
        "machine-local terms file outside the repository",
        "A clean current snapshot does not sanitize Git history.",
    )
    for rule in public_safety_rules:
        if rule not in normalized_agents:
            errors.append(f"AGENTS.md missing public repository safety rule: {rule}")
    for relative in (
        ".agents/skills/gitops-service-delivery/SKILL.md",
        ".agents/skills/kubernetes-platform-delivery/SKILL.md",
        ".agents/skills/pi-agent-maintenance/SKILL.md",
    ):
        if "Commit message:" not in (repo / relative).read_text(encoding="utf-8"):
            errors.append(f"skill output contract missing commit message: {relative}")

    terraform_skill_path = skills_root / "terraform-repository-maintenance" / "SKILL.md"
    normalized_terraform_skill = re.sub(
        r"\s+", " ", terraform_skill_path.read_text(encoding="utf-8")
    )
    terraform_validation_rules = (
        "After the final edit, the parent or approved worker runs formatting, validation, and an unsaved remote-state plan",
        "Treat every unapproved source or legacy root as read-only evidence",
        "scripts/run-terraform.sh plan <service-path> <env>",
        "Require an add/change/destroy/replace summary and explicit unexpected-drift findings.",
        "Accept `No changes.` or an explicit zero-action summary as no-op.",
        "Do not retry authentication or state-lock failures.",
        "Never save plan files or print sensitive state, plan output, or secrets.",
    )
    for rule in terraform_validation_rules:
        if rule not in normalized_terraform_skill:
            errors.append(f"Terraform maintenance skill missing validation-plan rule: {rule}")
    if "user-operated plan" in normalized_terraform_skill:
        errors.append("Terraform maintenance skill must not delegate post-edit plan to the user")

    readme = readme_path.read_text(encoding="utf-8")
    normalized_readme = re.sub(r"\s+", " ", readme)
    readme_main_rules = (
        "使用者明確要求維護本 repository 時",
        "建立、修改、重新命名 或刪除 repository-owned source、tests、scripts、extensions、configuration 與 documentation",
        "不延伸到 sibling/target repositories",
        "不涵蓋 secrets、credentials、generated artifacts、caches 或 git-ignored temporary files",
        "不允許 agent commit、push、修改 Git 或操作 remotes",
        "完整 authority boundary 以 [`AGENTS.md`](AGENTS.md) 為準",
    )
    for rule in readme_main_rules:
        if rule not in normalized_readme:
            errors.append(f"README missing skills-repository main rule: {rule}")
    root_readme_targets = markdown_link_targets(readme_path)
    skill_names: set[str] = set()
    model_invoked: set[str] = set()
    model_description_chars = 0
    skill_readmes: list[Path] = []
    for skill_dir in sorted(path for path in skills_root.iterdir() if path.is_dir()):
        skill_file = skill_dir / "SKILL.md"
        skill_readme = skill_dir / "README.md"
        if not skill_file.is_file():
            errors.append(f"skill directory has no SKILL.md: {skill_dir.relative_to(repo)}")
            continue
        if not skill_readme.is_file():
            errors.append(f"skill directory has no README.md: {skill_dir.relative_to(repo)}")
        else:
            skill_readmes.append(skill_readme)

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
        readme_target = f".agents/skills/{skill_dir.name}/README.md"
        if readme_target not in root_readme_targets:
            errors.append(f"README inventory missing skill README link: {skill_dir.name}")
        skill_readme_text = skill_readme.read_text(encoding="utf-8") if skill_readme.is_file() else ""
        skill_readme_targets = markdown_link_targets(skill_readme) if skill_readme.is_file() else set()
        if "SKILL.md" not in skill_readme_targets:
            errors.append(f"skill README does not link SKILL.md: {skill_dir.name}")
        if disabled:
            invocation = f"/skill:{skill_dir.name}"
            if invocation not in readme:
                errors.append(f"root README manual invocation missing skill: {skill_dir.name}")
            if invocation not in skill_readme_text:
                errors.append(f"skill README manual invocation missing skill: {skill_dir.name}")
        else:
            model_invoked.add(skill_dir.name)
            model_description_chars += len(description)
            if "Use " not in description or "Do not use" not in description:
                errors.append(
                    f"model-invoked description lacks positive/negative boundary: {skill_dir.name}"
                )

    if model_description_chars > 2850:
        errors.append(
            f"automatic description budget exceeded: {model_description_chars} > 2850 characters"
        )

    for documentation in [readme_path, *skill_readmes]:
        for target in relative_markdown_links(documentation):
            errors.append(
                f"broken relative README link: {documentation.relative_to(repo)} -> {target}"
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

    public_safety_script = Path(__file__).parent / "check_public_safety.py"
    public_safety_test = Path(__file__).parent / "tests" / "check_public_safety_test.py"
    ok, output = run([sys.executable, str(public_safety_test)], repo)
    if not ok:
        errors.append(f"public repository safety test failed: {output}")
    ok, output = run([sys.executable, str(public_safety_script), str(repo)], repo)
    if not ok:
        errors.append(f"public repository safety scan failed: {output}")

    retrospective_test = (
        skills_root
        / "context-window-retrospective"
        / "scripts"
        / "tests"
        / "summarize_session_metrics_test.py"
    )
    ok, output = run([sys.executable, str(retrospective_test)], repo)
    if not ok:
        errors.append(f"context-window retrospective metrics test failed: {output}")

    contract_test = Path(__file__).parent / "tests" / "validate_repo_contract_test.py"
    ok, output = run([sys.executable, str(contract_test)], repo)
    if not ok:
        errors.append(f"repository contract validator test failed: {output}")

    developer_activity_test = (
        skills_root / "developer-activity-summary" / "scripts" / "test_collect_activity.py"
    )
    ok, output = run([sys.executable, str(developer_activity_test)], repo)
    if not ok:
        errors.append(f"developer activity collector test failed: {output}")

    makefile_test = repo / "scripts" / "test-makefile.sh"
    ok, output = run(["bash", str(makefile_test)], repo)
    if not ok:
        errors.append(f"workspace Makefile test failed: {output}")

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
        f"{len(skill_readmes)} skill READMEs, {len(extension_dirs)} extensions, "
        f"{len(extension_tests)} extension test files"
    )


if __name__ == "__main__":
    main()
