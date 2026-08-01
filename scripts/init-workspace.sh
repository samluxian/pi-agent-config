#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/init-workspace.sh [--workspace-root <path>] [--no-pi-local] [--check]

Create relative symlinks for the workspace contract and project-scoped skills:

  <workspace-root>/AGENTS.md       -> <skills-repo>/AGENTS.md
  <workspace-root>/.agents/skills -> <skills-repo>/.agents/skills

The workspace root defaults to the parent directory of the skills repository.

Options:
  --no-pi-local  Do not install extensions in <workspace-root>/.pi/extensions.
  --pi-local     Compatibility alias; Pi-local extension installation is enabled
                 by default.
  --check        Report workspace and Pi extension readiness without changing files.
EOF
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
skills_repo="$(dirname -- "$script_dir")"
workspace_root="$(dirname -- "$skills_repo")"
pi_local=true
check_only=false

while (($# > 0)); do
  case "$1" in
    --workspace-root)
      if (($# < 2)); then
        echo "error: --workspace-root requires a path" >&2
        usage >&2
        exit 2
      fi
      workspace_root="$2"
      shift 2
      ;;
    --pi-local)
      pi_local=true
      shift
      ;;
    --no-pi-local)
      pi_local=false
      shift
      ;;
    --check)
      check_only=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$workspace_root" ]]; then
  echo "error: workspace root is not a directory: $workspace_root" >&2
  exit 1
fi

workspace_root="$(cd -- "$workspace_root" && pwd -P)"
agents_source="$skills_repo/AGENTS.md"
skills_source="$skills_repo/.agents/skills"
agents_destination="$workspace_root/AGENTS.md"
agents_dir="$workspace_root/.agents"
skills_destination="$agents_dir/skills"

if [[ ! -f "$agents_source" ]]; then
  echo "error: canonical AGENTS.md not found: $agents_source" >&2
  exit 1
fi

if [[ ! -d "$skills_source" ]]; then
  echo "error: project-scoped skills directory not found: $skills_source" >&2
  exit 1
fi

extensions_source="$skills_repo/extensions"
extensions_destination="$workspace_root/.pi/extensions"
dependencies_manifest="$skills_repo/package.json"
if [[ ! -d "$extensions_source" ]]; then
  echo "error: extensions directory not found: $extensions_source" >&2
  exit 1
fi
if [[ ! -f "$dependencies_manifest" ]]; then
  echo "error: extension dependency manifest not found: $dependencies_manifest" >&2
  exit 1
fi
mapfile -t extension_names < <(find "$extensions_source" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
if ((${#extension_names[@]} == 0)); then
  echo "error: no extensions found in: $extensions_source" >&2
  exit 1
fi

if $check_only; then
  echo "workspace root: $workspace_root"
  echo "skills repository: $skills_repo"
  [[ -L "$agents_destination" ]] && echo "AGENTS link: ready" || echo "AGENTS link: missing"
  [[ -L "$skills_destination" ]] && echo "skills link: ready" || echo "skills link: missing"
  if command -v pi >/dev/null 2>&1; then
    echo "pi: $(command -v pi)"
  else
    echo "pi: not found"
  fi
  for extension_name in "${extension_names[@]}"; do
    if [[ -d "$extensions_destination/$extension_name" ]]; then
      echo "Pi extension ($extension_name): ready"
    else
      echo "Pi extension ($extension_name): missing"
    fi
  done
  [[ -d "$extensions_destination/node_modules" ]] && echo "Pi extension dependencies: present" || echo "Pi extension dependencies: missing"
  exit 0
fi

check_destination() {
  local destination="$1"
  local source="$2"

  if [[ -L "$destination" ]]; then
    if [[ "$(readlink -f -- "$destination")" == "$source" ]]; then
      return 0
    fi

    echo "error: refusing to replace existing symlink: $destination" >&2
    return 1
  fi

  if [[ -e "$destination" ]]; then
    echo "error: refusing to replace existing path: $destination" >&2
    return 1
  fi
}

check_destination "$agents_destination" "$agents_source"

if [[ -L "$agents_dir" ]] || [[ -e "$agents_dir" && ! -d "$agents_dir" ]]; then
  echo "error: .agents must be a directory: $agents_dir" >&2
  exit 1
fi

if [[ -d "$agents_dir" ]]; then
  check_destination "$skills_destination" "$skills_source"
  if [[ ! -w "$agents_dir" ]]; then
    echo "error: .agents directory is not writable: $agents_dir" >&2
    exit 1
  fi
elif [[ ! -w "$workspace_root" ]]; then
  echo "error: workspace root is not writable: $workspace_root" >&2
  exit 1
fi

create_link() {
  local destination="$1"
  local source="$2"
  local relative_source

  if [[ -L "$destination" ]]; then
    echo "already initialized: $destination -> $(readlink -- "$destination")"
    return 0
  fi

  relative_source="$(realpath --relative-to="$(dirname -- "$destination")" "$source")"
  ln -s -- "$relative_source" "$destination"
  echo "initialized: $destination -> $relative_source"
}

if [[ ! -d "$agents_dir" ]]; then
  mkdir -- "$agents_dir"
fi

create_link "$agents_destination" "$agents_source"
create_link "$skills_destination" "$skills_source"

if $pi_local; then
  pi_dir="$workspace_root/.pi"
  pi_settings="$pi_dir/settings.json"
  mkdir -p -- "$extensions_destination"

  if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm is required to install Pi extension dependencies" >&2
    exit 1
  fi

  for extension_name in "${extension_names[@]}"; do
    extension_source="$extensions_source/$extension_name"
    extension_destination="$extensions_destination/$extension_name"
    if [[ -e "$extension_destination" ]]; then
      echo "Pi extension already present: $extension_destination"
    else
      cp -a -- "$extension_source" "$extension_destination"
      echo "Pi extension installed: $extension_destination"
    fi
  done

  if [[ ! -f "$extensions_destination/package.json" ]]; then
    cp -- "$dependencies_manifest" "$extensions_destination/package.json"
  fi
  (cd "$extensions_destination" && npm install --omit=dev --omit=peer)
  echo "Pi extension dependencies installed: $extensions_destination/node_modules"

  # Migrate workspaces initialized by the former package-registration flow.
  # Preserve all unrelated project settings and fail rather than overwrite invalid JSON.
  if [[ -f "$pi_settings" ]]; then
    relative_package="$(realpath --relative-to="$pi_dir" "$skills_repo")"
    PI_SETTINGS="$pi_settings" PI_PACKAGE="$relative_package" node <<'NODE'
const fs = require("node:fs");
const settingsPath = process.env.PI_SETTINGS;
const packagePath = process.env.PI_PACKAGE;
let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch {
  console.error(`error: refusing to replace invalid Pi settings: ${settingsPath}`);
  process.exit(1);
}
if (Array.isArray(settings.packages)) {
  settings.packages = settings.packages.filter((entry) => entry !== packagePath);
  if (settings.packages.length === 0) delete settings.packages;
}
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE
    echo "Pi package registration removed: $pi_settings -> $relative_package"
  fi
fi
