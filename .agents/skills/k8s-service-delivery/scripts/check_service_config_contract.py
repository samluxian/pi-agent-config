#!/usr/bin/env python3
"""Validate the fixed flex-app service file and values ownership contract."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml


def load_mapping(path: Path, errors: list[str]) -> dict[str, Any]:
    if not path.is_file():
        errors.append(f"missing required file: {path}")
        return {}
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        errors.append(f"invalid YAML {path}: {exc}")
        return {}
    if not isinstance(value, dict):
        errors.append(f"expected YAML mapping: {path}")
        return {}
    return value


def common_mapping(data: dict[str, Any], path: Path, errors: list[str]) -> dict[str, Any]:
    value = data.get("common")
    if not isinstance(value, dict):
        errors.append(f"missing mapping 'common': {path}")
        return {}
    return value


def aliases(chart: dict[str, Any]) -> set[str]:
    result: set[str] = set()
    dependencies = chart.get("dependencies")
    if not isinstance(dependencies, list):
        return result
    for dependency in dependencies:
        if not isinstance(dependency, dict) or dependency.get("name") != "flex-app":
            continue
        alias = dependency.get("alias") or dependency.get("name")
        if isinstance(alias, str):
            result.add(alias)
    return result


def validate_app_config(
    path: Path,
    data: dict[str, Any],
    chart_aliases: set[str],
    errors: list[str],
) -> None:
    allowed_roots = {"common", *chart_aliases}
    unexpected_roots = sorted(str(key) for key in data if key not in allowed_roots)
    if unexpected_roots:
        errors.append(f"application config has unsupported top-level keys in {path}: {', '.join(unexpected_roots)}")

    common = common_mapping(data, path, errors)
    unexpected_common = sorted(str(key) for key in common if key != "config")
    if unexpected_common:
        errors.append(
            f"application config owns deployment keys in {path}: {', '.join(unexpected_common)}"
        )
    if "config" not in common or not isinstance(common.get("config"), dict):
        errors.append(f"application config must define common.config mapping: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check flex-app service configuration ownership.")
    parser.add_argument("--service", required=True, type=Path, help="Service chart directory")
    parser.add_argument("--env", required=True, help="Enabled environment name")
    parser.add_argument("--app-config", required=True, type=Path, help="Service app-config values file")
    parser.add_argument("--common-app-config", type=Path, help="Optional shared app-config values file")
    args = parser.parse_args()

    service = args.service
    chart_path = service / "Chart.yaml"
    base_path = service / "values.yaml"
    env_path = service / f"values.{args.env}.yaml"
    ignored_env_path = service / f"values.ignore.{args.env}.yaml"
    errors: list[str] = []

    if not service.is_dir():
        print(f"ERROR: service directory not found: {service}")
        return 1
    if env_path.is_file() and ignored_env_path.is_file():
        errors.append(f"enabled and ignored overlays both exist for {args.env}: {service}")

    chart = load_mapping(chart_path, errors)
    base = load_mapping(base_path, errors)
    env = load_mapping(env_path, errors)
    app_config = load_mapping(args.app_config, errors)
    chart_aliases = aliases(chart)
    if not chart_aliases:
        errors.append(f"Chart.yaml has no flex-app dependency alias: {chart_path}")

    base_common = common_mapping(base, base_path, errors)
    base_config = base_common.get("config")
    if isinstance(base_config, dict):
        if "secretFiles" in base_config:
            errors.append(f"base values must not own secret references: {base_path}")
        config_files = base_config.get("configFiles")
        if isinstance(config_files, dict):
            content_files = [
                str(name)
                for name, definition in config_files.items()
                if isinstance(definition, dict) and "content" in definition
            ]
            if content_files:
                errors.append(
                    f"base values must not own application file content in {base_path}: "
                    + ", ".join(sorted(content_files))
                )

    env_common = common_mapping(env, env_path, errors)
    if "config" in env_common:
        errors.append(f"environment deployment overlay must not own common.config: {env_path}")

    validate_app_config(args.app_config, app_config, chart_aliases, errors)
    if args.common_app_config:
        common_app_config = load_mapping(args.common_app_config, errors)
        validate_app_config(args.common_app_config, common_app_config, chart_aliases, errors)

    print("# Flex-App Service Config Contract")
    print(f"- service: {service}")
    print(f"- environment: {args.env}")
    print(f"- aliases: {', '.join(sorted(chart_aliases)) or 'none'}")
    print(f"- common app config: {args.common_app_config or 'not provided (optional)'}")
    if errors:
        print("- result: fail")
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("- result: pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
