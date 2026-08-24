#!/usr/bin/env python3
"""Check Helm values overlay risks for GitOps implementation work.

This script is read-only. It highlights duplicate overlay values, null clears,
and chart defaults that may be inherited or intentionally cleared by an
environment overlay. It can also fail on warnings for CI gates.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml


def load_yaml(path: str) -> dict[str, Any]:
    data = yaml.safe_load(Path(path).read_text())
    return data if isinstance(data, dict) else {}


def subtree(data: dict[str, Any], key: str | None) -> dict[str, Any]:
    if not key:
        return data
    value = data.get(key)
    return value if isinstance(value, dict) else {}


def flatten(data: Any, prefix: tuple[str, ...] = ()) -> dict[str, Any]:
    if isinstance(data, dict):
        out: dict[str, Any] = {}
        for key, value in data.items():
            out.update(flatten(value, prefix + (str(key),)))
        return out
    if isinstance(data, list):
        return {".".join(prefix): data}
    return {".".join(prefix): data}


def common_values(data: dict[str, Any]) -> dict[str, Any]:
    value = data.get("common")
    return value if isinstance(value, dict) else data


def get_path(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def is_dynamic_chart_value(path: str) -> bool:
    dynamic_roots = {
        "config.envs",
        "config.configFiles",
        "config.secretFiles",
        "services",
        "extraContainers",
        "extraVolumes",
        "extraVolumeMounts",
        "nodeSelector",
        "tolerations",
        "affinity",
        "podAnnotations",
        "podLabels",
    }
    dynamic_prefixes = tuple(f"{root}." for root in dynamic_roots)
    return path in dynamic_roots or path.startswith(dynamic_prefixes)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check values overlay risks.")
    parser.add_argument("--base", required=True, help="App values.yaml path.")
    parser.add_argument("--env", required=True, help="App values.<env>.yaml path.")
    parser.add_argument("--chart-defaults", help="Chart default values.yaml path.")
    parser.add_argument("--alias", default="stable", help="Dependency alias to inspect in chart defaults.")
    parser.add_argument("--fail-on-warning", action="store_true", help="Exit 1 when review warnings are found.")
    args = parser.parse_args()

    base = common_values(load_yaml(args.base))
    env = common_values(load_yaml(args.env))
    base_flat = flatten(base)
    env_flat = flatten(env)

    duplicate_same = []
    duplicate_changed = []
    nulls = []
    for key, value in sorted(env_flat.items()):
        if value is None:
            nulls.append(key)
        if key in base_flat:
            if base_flat[key] == value:
                duplicate_same.append(key)
            else:
                duplicate_changed.append(key)

    chart_defaults: dict[str, Any] = {}
    if args.chart_defaults:
        raw_defaults = load_yaml(args.chart_defaults)
        # A chart's own values.yaml is not nested by alias. If a parent chart
        # values file is passed instead, allow --alias extraction.
        chart_defaults = subtree(raw_defaults, args.alias) or raw_defaults

    chart_flat = flatten(chart_defaults) if chart_defaults else {}
    possible_unknown = []
    if chart_flat:
        for key in sorted(env_flat):
            # App-specific values.yaml may define keys outside shared chart defaults.
            # Warn only when an env-only structural key is absent from both
            # base and chart defaults; skip known dynamic maps such as env vars
            # and named services.
            if key not in base_flat and key not in chart_flat and not is_dynamic_chart_value(key):
                possible_unknown.append(key)

    chart_envs = get_path(chart_defaults, "config.envs") if chart_defaults else {}
    env_envs = get_path(env, "config.envs") or {}

    print("# Values Overlay Check")
    print()
    print(f"- base: {args.base}")
    print(f"- env: {args.env}")
    print(f"- duplicate same-value leaves: {len(duplicate_same)}")
    print(f"- duplicate changed leaves: {len(duplicate_changed)}")
    print(f"- null overrides: {len(nulls)}")
    print(f"- env-only keys absent from base/chart defaults: {len(possible_unknown)}")

    if duplicate_same:
        print()
        print("## Duplicate Same-Value Leaves")
        for key in duplicate_same:
            print(f"- {key}")

    if duplicate_changed:
        print()
        print("## Intentional Overrides To Review")
        for key in duplicate_changed:
            print(f"- {key}: base={base_flat[key]!r} env={env_flat[key]!r}")

    if nulls:
        print()
        print("## Null Overrides")
        for key in nulls:
            print(f"- {key}")

    if possible_unknown:
        print()
        print("## Env-Only Keys Absent From Base And Chart Defaults")
        print("Review these for typos or unsupported chart values.")
        for key in possible_unknown:
            print(f"- {key}")

    if isinstance(chart_envs, dict):
        missing_defaults = sorted(k for k in chart_envs if isinstance(env_envs, dict) and k not in env_envs)
        cleared_defaults = sorted(k for k in chart_envs if isinstance(env_envs, dict) and env_envs.get(k) is None)
        print()
        print("## Chart config.envs Defaults")
        print(f"- chart defaults: {', '.join(sorted(chart_envs)) or 'none'}")
        print(f"- env overlay keys: {', '.join(sorted(env_envs)) if isinstance(env_envs, dict) else 'none'}")
        print(f"- inherited if omitted: {', '.join(missing_defaults) or 'none'}")
        print(f"- cleared with null: {', '.join(cleared_defaults) or 'none'}")
        if "LOG_LEVEL" in cleared_defaults:
            print("- WARNING: LOG_LEVEL is explicitly cleared; confirm this is intended and compare live ConfigMap.")
        elif "LOG_LEVEL" in missing_defaults:
            print("- LOG_LEVEL is omitted from the overlay and should inherit the chart default if Helm render confirms it.")

    warnings = bool(possible_unknown)
    warnings = warnings or bool(nulls)
    if args.fail_on_warning and warnings:
        print()
        print("ERROR: warnings found and --fail-on-warning was set.")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
