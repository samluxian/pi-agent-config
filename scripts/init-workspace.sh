#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/init-workspace.sh [--workspace-root <path>] [--no-pi-local] [--install-runtimes] [--check]

Rebuild the managed workspace contract, skills, extensions, and dependencies.
Unknown extensions are preserved; unmanaged contract paths stop installation.

  <workspace-root>/AGENTS.md       -> <skills-repo>/AGENTS.md
  <workspace-root>/.agents/skills -> <skills-repo>/.agents/skills

The workspace root defaults to the parent directory of the skills repository.

Options:
  --no-pi-local  Do not install extensions or project-local Pi packages.
  --pi-local     Compatibility alias; Pi-local installation is enabled by default.
  --install-runtimes  Install a missing/incompatible JDK 17 on Ubuntu using sudo/apt.
                      Existing JDK 17+ is preserved; requires Pi-local installation.
  --check        Report workspace, extension and parser-runtime readiness without
                 changing files, even when --install-runtimes is supplied.
EOF
}

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
skills_repo="$(dirname -- "$script_dir")"
workspace_root="$(dirname -- "$skills_repo")"
pi_local=true
check_only=false
install_runtimes=false

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
    --install-runtimes)
      install_runtimes=true
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

if $install_runtimes && ! $pi_local; then
  echo "error: --install-runtimes requires Pi-local installation; cannot combine with --no-pi-local" >&2
  exit 2
fi

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

pi_dir="$workspace_root/.pi"
pi_settings="$pi_dir/settings.json"
extensions_source="$skills_repo/extensions"
extensions_destination="$pi_dir/extensions"
managed_manifest="$pi_dir/pi-agent-config-managed.json"
dependencies_manifest="$skills_repo/package.json"
web_access_package="npm:pi-web-access@0.23.0"
web_access_destination="$pi_dir/npm/node_modules/pi-web-access"
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
declared_extensions="$(PACKAGE_JSON="$dependencies_manifest" node <<'NODE'
const fs = require("node:fs");
const packagePath = process.env.PACKAGE_JSON;
let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
} catch {
  console.error(`error: invalid package manifest: ${packagePath}`);
  process.exit(1);
}
const extensions = packageJson.pi?.extensions;
if (Array.isArray(extensions) && extensions.includes("./extensions/code-intelligence")
    && typeof packageJson.dependencies?.typescript !== "string") {
  console.error(`error: code-intelligence requires a declared TypeScript runtime dependency: ${packagePath}`);
  process.exit(1);
}
if (!Array.isArray(extensions)) {
  console.error(`error: package manifest must declare pi.extensions: ${packagePath}`);
  process.exit(1);
}
const names = new Set();
for (const extension of extensions) {
  const match = typeof extension === "string" && /^\.\/extensions\/([A-Za-z0-9._-]+)$/.exec(extension);
  if (!match || match[1] === "." || match[1] === ".." || names.has(match[1])) {
    console.error(`error: invalid or duplicate pi.extensions entry: ${packagePath}`);
    process.exit(1);
  }
  names.add(match[1]);
}
console.log([...names].sort().join("\n"));
NODE
)"
if [[ "$(printf '%s\n' "${extension_names[@]}")" != "$declared_extensions" ]]; then
  echo "error: extensions directory and package pi.extensions inventory differ: $dependencies_manifest" >&2
  exit 1
fi

is_desired_extension() {
  local candidate="$1"
  local extension_name
  for extension_name in "${extension_names[@]}"; do
    [[ "$candidate" == "$extension_name" ]] && return 0
  done
  return 1
}

load_managed_extensions() {
  [[ -f "$managed_manifest" ]] || {
    # First upgrade from the legacy installer: current source names are the only
    # extension paths we may safely claim. Unknown workspace extensions remain.
    printf '%s\n' "${extension_names[@]}"
    return 0
  }
  MANAGED_MANIFEST="$managed_manifest" node <<'NODE'
const fs = require("node:fs");
const manifestPath = process.env.MANAGED_MANIFEST;
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch {
  console.error(`error: invalid managed manifest: ${manifestPath}`);
  process.exit(1);
}
if (manifest.version !== 1 || !Array.isArray(manifest.extensions)) {
  console.error(`error: unsupported managed manifest: ${manifestPath}`);
  process.exit(1);
}
for (const name of manifest.extensions) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name) || name === "." || name === "..") {
    console.error(`error: unsafe extension name in managed manifest: ${manifestPath}`);
    process.exit(1);
  }
  console.log(name);
}
NODE
}

managed_extensions_output="$(load_managed_extensions)"
mapfile -t managed_extension_names < <(printf '%s' "$managed_extensions_output")

is_managed_extension() {
  local candidate="$1"
  local extension_name
  for extension_name in "${managed_extension_names[@]}"; do
    [[ "$candidate" == "$extension_name" ]] && return 0
  done
  return 1
}

find_unmanaged_extensions() {
  local candidate
  [[ -d "$extensions_destination" ]] || return 0
  while IFS= read -r candidate; do
    is_managed_extension "$candidate" || printf '%s\n' "$candidate"
  done < <(
    find "$extensions_destination" -mindepth 1 -maxdepth 1 \
      \( \( -type d -o -type l \) ! -name node_modules \
      -o -type f \( -name '*.ts' -o -name '*.js' \) \) -printf '%f\n' | sort
  )
}

write_managed_manifest() {
  local temporary_manifest="${managed_manifest}.tmp"
  MANAGED_MANIFEST="$temporary_manifest" EXTENSION_NAMES="$(printf '%s\n' "${extension_names[@]}")" node <<'NODE'
const fs = require("node:fs");
const names = process.env.EXTENSION_NAMES.split("\n").filter(Boolean).sort();
fs.writeFileSync(process.env.MANAGED_MANIFEST, `${JSON.stringify({ version: 1, extensions: names }, null, 2)}\n`);
NODE
  mv -- "$temporary_manifest" "$managed_manifest"
}

web_access_status() {
  PI_SETTINGS="$pi_settings" PI_PACKAGE="$web_access_package" \
    PI_PACKAGE_DIR="$web_access_destination" node <<'NODE'
const fs = require("node:fs");
const settingsPath = process.env.PI_SETTINGS;
const packageSource = process.env.PI_PACKAGE;
const packageDir = process.env.PI_PACKAGE_DIR;
let childOnly = false;
if (fs.existsSync(settingsPath)) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    childOnly = Array.isArray(settings.packages) && settings.packages.some((entry) =>
      entry && typeof entry === "object" && entry.source === packageSource
      && Array.isArray(entry.extensions) && entry.extensions.length === 0);
  } catch {
    console.log("settings-invalid");
    process.exit(0);
  }
}
let installed = false;
try {
  const manifest = JSON.parse(fs.readFileSync(`${packageDir}/package.json`, "utf8"));
  installed = manifest.name === "pi-web-access" && manifest.version === "0.23.0";
} catch {}
console.log(childOnly && installed ? "ready" : childOnly || installed ? "drifted" : "missing");
NODE
}

typescript_status() {
  PACKAGE_JSON="$dependencies_manifest" EXTENSION_DIR="$extensions_destination" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const manifest = JSON.parse(fs.readFileSync(process.env.PACKAGE_JSON, "utf8"));
try {
  // Resolve from the deployed extension, never from a global TypeScript install.
  const localRequire = createRequire(path.join(process.env.EXTENSION_DIR, "code-intelligence", "index.ts"));
  const resolved = localRequire.resolve("typescript");
  const dependencyRoot = path.join(process.env.EXTENSION_DIR, "node_modules", "typescript");
  const rel = path.relative(dependencyRoot, resolved);
  if (rel.startsWith(`..${path.sep}`) || rel === ".." || path.isAbsolute(rel)) {
    console.log("missing-local-dependency");
    process.exit(0);
  }
  const ts = localRequire(resolved);
  if (ts.version !== manifest.dependencies.typescript) {
    console.log("version-mismatch");
  } else if (typeof ts.createProgram !== "function" || typeof ts.resolveModuleName !== "function") {
    console.log("compiler-api-unavailable");
  } else {
    const parsed = ts.createSourceFile("runtime-check.ts", "export const ready = true;", ts.ScriptTarget.Latest, true);
    console.log(parsed.parseDiagnostics?.length === 0 ? "ready" : "parser-unusable");
  }
} catch {
  console.log("missing-or-unusable");
}
NODE
}

jdk_status() {
  local java_version javac_version java_major=0 javac_major=0 modules line
  if ! command -v java >/dev/null 2>&1 || ! command -v javac >/dev/null 2>&1; then
    echo "missing"
    return
  fi
  if ! java_version="$(java -version 2>&1)" || ! javac_version="$(javac -version 2>&1)"; then
    echo "unusable"
    return
  fi
  # Ignore launcher warnings (for example JAVA_TOOL_OPTIONS) and only parse
  # actual version lines. Never print captured launcher output.
  while IFS= read -r line; do
    if [[ "$line" =~ ^(openjdk|java)[[:space:]]version[[:space:]]\"([0-9]+)(\.([0-9]+))? ]]; then
      java_major="${BASH_REMATCH[2]}"
      [[ "$java_major" != 1 ]] || java_major="${BASH_REMATCH[4]:-0}"
      break
    fi
  done <<<"$java_version"
  while IFS= read -r line; do
    if [[ "$line" =~ ^javac[[:space:]]([0-9]+)(\.([0-9]+))? ]]; then
      javac_major="${BASH_REMATCH[1]}"
      [[ "$javac_major" != 1 ]] || javac_major="${BASH_REMATCH[3]:-0}"
      break
    fi
  done <<<"$javac_version"
  if ((java_major == 0 || javac_major == 0)); then
    echo "unusable"
    return
  fi
  if ((java_major < 17 || javac_major < 17)); then
    echo "unsupported-version"
    return
  fi
  if ! modules="$(java --list-modules 2>/dev/null)"; then
    echo "compiler-module-missing"
  elif grep -Eq '^jdk\.compiler(@|$)' <<<"$modules"; then
    echo "ready"
  else
    echo "compiler-module-missing"
  fi
}

ensure_jdk_runtime() {
  local status
  status="$(jdk_status)"
  if [[ "$status" == ready ]]; then
    echo "Code intelligence Java runtime: ready (existing JDK preserved)"
    return
  fi
  # User-operated system setup only. No external repositories, home changes,
  # forced update-alternatives selection, or automatic privileged retries.
  if [[ "$(id -u)" == 0 ]]; then
    echo "error: run runtime installation as a normal user, not root" >&2
    return 1
  fi
  if [[ ! -r /etc/os-release ]]; then
    echo "error: automatic JDK installation supports Ubuntu only; install a full JDK 17+ manually" >&2
    return 1
  fi
  source /etc/os-release
  if [[ "${ID:-}" != ubuntu ]]; then
    echo "error: automatic JDK installation supports Ubuntu only; install a full JDK 17+ manually" >&2
    return 1
  fi
  if ! command -v sudo >/dev/null 2>&1 || ! command -v apt-get >/dev/null 2>&1; then
    echo "error: sudo and apt-get are required for Ubuntu JDK installation" >&2
    return 1
  fi
  echo "Installing code intelligence JDK: openjdk-17-jdk-headless (Ubuntu system package)"
  sudo apt-get update || return 1
  sudo apt-get install -y openjdk-17-jdk-headless || return 1
  hash -r
  status="$(jdk_status)"
  if [[ "$status" != ready ]]; then
    echo "error: JDK installation finished but selected java/javac are not ready ($status); select a full JDK 17+ in PATH before retrying initialization" >&2
    return 1
  fi
  echo "Code intelligence Java runtime: ready"
}

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
    extension_source="$extensions_source/$extension_name"
    extension_destination="$extensions_destination/$extension_name"
    if [[ ! -d "$extension_destination" ]]; then
      echo "Pi extension ($extension_name): missing"
    elif diff -qr -- "$extension_source" "$extension_destination" >/dev/null; then
      echo "Pi extension ($extension_name): ready"
    else
      echo "Pi extension ($extension_name): drifted"
    fi
  done
  while IFS= read -r extension_name; do
    echo "Pi extension ($extension_name): unmanaged (preserved)"
  done < <(find_unmanaged_extensions)
  if [[ -f "$extensions_destination/package.json" ]] && cmp -s -- "$dependencies_manifest" "$extensions_destination/package.json"; then
    echo "Pi extension manifest: ready"
  else
    echo "Pi extension manifest: drifted"
  fi
  [[ -d "$extensions_destination/node_modules" ]] && echo "Pi extension dependencies: present" || echo "Pi extension dependencies: missing"
  if is_desired_extension code-intelligence; then
    echo "Code intelligence TypeScript runtime: $(typescript_status)"
    echo "Code intelligence Java runtime: $(jdk_status)"
  fi
  echo "Pi package (pi-web-access@0.23.0): $(web_access_status)"
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

# Fail prerequisite/opt-in runtime installation checks before touching managed
# workspace links or extensions. Default initialization remains usable for JS/TS
# without silently installing a system JDK.
if $pi_local; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm is required to install Pi extension dependencies" >&2
    exit 1
  fi
  if ! command -v pi >/dev/null 2>&1; then
    echo "error: pi is required to install project-local packages" >&2
    exit 1
  fi
  if is_desired_extension code-intelligence; then
    if $install_runtimes; then
      ensure_jdk_runtime
    else
      java_status="$(jdk_status)"
      echo "Code intelligence Java runtime: $java_status"
      if [[ "$java_status" != ready ]]; then
        echo "warning: Java analysis is unavailable ($java_status); Ubuntu users may opt into --install-runtimes, otherwise provide a full JDK 17+" >&2
      fi
    fi
  fi
fi

create_link() {
  local destination="$1"
  local source="$2"
  local relative_source

  relative_source="$(realpath --relative-to="$(dirname -- "$destination")" "$source")"
  ln -s -- "$relative_source" "$destination"
  echo "initialized: $destination -> $relative_source"
}

if [[ ! -d "$agents_dir" ]]; then
  mkdir -- "$agents_dir"
fi

# Preflight above proves both paths are either absent or managed links. Rebuild
# them on every install so the result never depends on stale symlink text.
[[ -L "$agents_destination" ]] && rm -- "$agents_destination"
[[ -L "$skills_destination" ]] && rm -- "$skills_destination"
create_link "$agents_destination" "$agents_source"
create_link "$skills_destination" "$skills_source"

if $pi_local; then
  mkdir -p -- "$extensions_destination"

  # Remove only paths recorded as managed, plus current source names for the
  # first upgrade from the legacy installer. Unknown extensions are preserved.
  printf '%s\n' "${managed_extension_names[@]}" "${extension_names[@]}" | sort -u |
    while IFS= read -r extension_name; do
      [[ -n "$extension_name" ]] || continue
      extension_destination="$extensions_destination/$extension_name"
      if [[ -e "$extension_destination" || -L "$extension_destination" ]]; then
        rm -rf -- "$extension_destination"
        echo "Pi extension removed for reinstall: $extension_destination"
      fi
    done

  for extension_name in "${extension_names[@]}"; do
    extension_source="$extensions_source/$extension_name"
    extension_destination="$extensions_destination/$extension_name"
    cp -a -- "$extension_source" "$extension_destination"
    echo "Pi extension installed: $extension_destination"
  done

  rm -rf -- "$extensions_destination/node_modules"
  rm -f -- "$extensions_destination/package.json" "$extensions_destination/package-lock.json"
  cp -- "$dependencies_manifest" "$extensions_destination/package.json"
  (cd "$extensions_destination" && npm install --omit=dev --omit=peer)
  echo "Pi extension dependencies installed: $extensions_destination/node_modules"
  if is_desired_extension code-intelligence; then
    typescript_runtime_status="$(typescript_status)"
    echo "Code intelligence TypeScript runtime: $typescript_runtime_status"
    if [[ "$typescript_runtime_status" != ready ]]; then
      echo "error: installed TypeScript runtime failed its version/compiler API smoke check" >&2
      exit 1
    fi
  fi

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

  (cd "$workspace_root" && pi install -l "$web_access_package")
  PI_SETTINGS="$pi_settings" PI_PACKAGE="$web_access_package" node <<'NODE'
const fs = require("node:fs");
const settingsPath = process.env.PI_SETTINGS;
const packageSource = process.env.PI_PACKAGE;
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
const filtered = [];
let found = false;
for (const entry of packages) {
  const matches = entry === packageSource
    || (entry && typeof entry === "object" && entry.source === packageSource);
  if (!matches) {
    filtered.push(entry);
    continue;
  }
  if (!found) {
    filtered.push(entry && typeof entry === "object"
      ? { ...entry, source: packageSource, extensions: [] }
      : { source: packageSource, extensions: [] });
    found = true;
  }
}
if (!found) filtered.push({ source: packageSource, extensions: [] });
settings.packages = filtered;
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE
  if [[ "$(web_access_status)" != "ready" ]]; then
    echo "error: child-only Pi package is not ready after install: $web_access_package" >&2
    exit 1
  fi
  echo "Pi package ready for child-only use: $web_access_package"
  write_managed_manifest
  echo "Pi managed manifest written: $managed_manifest"
fi
