#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

fixture_repo="$tmp_dir/devops-pi-agent"
workspace_root="$tmp_dir/workspace"
fake_bin="$tmp_dir/bin"
mkdir -p "$fixture_repo/scripts" "$fixture_repo/.agents/skills" \
  "$fixture_repo/extensions/alpha" "$workspace_root" "$fake_bin"
cp -- "$repo_root/scripts/init-workspace.sh" "$fixture_repo/scripts/init-workspace.sh"
export TEST_OS_RELEASE="$tmp_dir/os-release"
export TEST_JDK_STATE_FILE="$tmp_dir/jdk-state"
export TEST_APT_LOG="$tmp_dir/apt.log"
export TEST_MUTATION_LOG="$tmp_dir/mutations.log"
export TEST_RUNTIME_READ_LOG="$tmp_dir/runtime-reads.log"
printf '%s\n' 'ID=ubuntu' > "$TEST_OS_RELEASE"
printf '%s\n' 'unusable' > "$TEST_JDK_STATE_FILE"
: > "$TEST_APT_LOG"
: > "$TEST_MUTATION_LOG"
: > "$TEST_RUNTIME_READ_LOG"
# Only redirect the system metadata input in the copied fixture. All commands
# which could install anything are fake; the production OS check is unchanged.
FIXTURE_SCRIPT="$fixture_repo/scripts/init-workspace.sh" node <<'NODE'
const fs = require("node:fs");
const path = process.env.FIXTURE_SCRIPT;
const text = fs.readFileSync(path, "utf8");
if (text.split("/etc/os-release").length !== 3) throw new Error("Unexpected OS metadata contract");
fs.writeFileSync(path, text.replaceAll("/etc/os-release", '"${TEST_OS_RELEASE:?}"'));
NODE
printf '%s\n' '# fixture contract' > "$fixture_repo/AGENTS.md"
printf '%s\n' 'alpha-v1' > "$fixture_repo/extensions/alpha/index.ts"
cat > "$fixture_repo/package.json" <<'JSON'
{
  "name": "init-workspace-fixture",
  "private": true,
  "pi": {
    "extensions": ["./extensions/alpha"]
  }
}
JSON
cat > "$fake_bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == 'install --omit=dev --omit=peer' ]]
printf 'npm %s\n' "$*" >> "${TEST_MUTATION_LOG:?}"
mkdir -p node_modules
node <<'NODE'
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (pkg.dependencies?.typescript && process.env.TEST_TS_MODE !== "missing") {
  fs.mkdirSync("node_modules/typescript", { recursive: true });
  fs.writeFileSync("node_modules/typescript/package.json", JSON.stringify({ name: "typescript", main: "index.js" }));
  const version = process.env.TEST_TS_MODE === "mismatch" ? "fixture-mismatch" : pkg.dependencies.typescript;
  const api = process.env.TEST_TS_MODE === "bad-api" ? "" : ", ScriptTarget: { Latest: 99 }, createProgram() {}, resolveModuleName() {}, createSourceFile() { return { parseDiagnostics: [] }; }";
  fs.writeFileSync("node_modules/typescript/index.js", `module.exports = {version: ${JSON.stringify(version)}${api}};`);
}
NODE
EOF
cat > "$fake_bin/pi" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "install" && "$2" == "-l" && "$3" == "npm:pi-web-access@0.23.0" ]]
printf 'pi %s\n' "$*" >> "${TEST_MUTATION_LOG:?}"
settings="$PWD/.pi/settings.json"
package_dir="$PWD/.pi/npm/node_modules/pi-web-access"
mkdir -p "$package_dir"
SETTINGS="$settings" node <<'NODE'
const fs = require("node:fs");
const path = process.env.SETTINGS;
const settings = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
settings.packages = Array.isArray(settings.packages) ? settings.packages : [];
if (!settings.packages.includes("npm:pi-web-access@0.23.0")) {
  settings.packages.push("npm:pi-web-access@0.23.0");
}
fs.mkdirSync(require("node:path").dirname(path), { recursive: true });
fs.writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
NODE
printf '%s\n' '{"name":"pi-web-access","version":"0.23.0"}' > "$package_dir/package.json"
EOF
cat > "$fake_bin/java" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'java %s\n' "$*" >> "${TEST_RUNTIME_READ_LOG:?}"
IFS= read -r state < "${TEST_JDK_STATE_FILE:?}"
case "$state" in
  unusable) exit 127 ;;
  old) version=11.0.0 ;;
  legacy) version=1.8.0 ;;
  newer) version=21.0.0 ;;
  *) version=17.0.0 ;;
esac
case "$*" in
  -version)
    if [[ "${TEST_JAVA_WARNING:-0}" == 1 ]]; then
      printf '%s\n' 'Picked up JAVA_TOOL_OPTIONS: fixture text java version "17"' >&2
    fi
    printf 'openjdk version "%s"\n' "$version" >&2
    ;;
  --list-modules)
    printf 'java.base@%s\n' "$version"
    [[ "$state" == compiler-missing ]] || printf 'jdk.compiler@%s\n' "$version"
    ;;
  *) exit 3 ;;
esac
EOF
cat > "$fake_bin/javac" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'javac %s\n' "$*" >> "${TEST_RUNTIME_READ_LOG:?}"
[[ "$*" == '-version' ]]
IFS= read -r state < "${TEST_JDK_STATE_FILE:?}"
case "$state" in
  unusable) exit 127 ;;
  old) version=11.0.0 ;;
  legacy) version=1.8.0 ;;
  newer) version=21.0.0 ;;
  *) version=17.0.0 ;;
esac
if [[ "${TEST_JAVA_WARNING:-0}" == 1 ]]; then
  printf '%s\n' 'Picked up JAVA_TOOL_OPTIONS: fixture text javac 17' >&2
fi
printf 'javac %s\n' "$version"
EOF
cat > "$fake_bin/id" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == '-u' ]]
printf '%s\n' "${TEST_USER_ID:-1000}"
EOF
cat > "$fake_bin/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == apt-get ]]
printf 'sudo %s\n' "$*" >> "${TEST_APT_LOG:?}"
printf 'sudo %s\n' "$*" >> "${TEST_MUTATION_LOG:?}"
exec "$@"
EOF
cat > "$fake_bin/apt-get" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'apt-get %s\n' "$*" >> "${TEST_APT_LOG:?}"
[[ "${TEST_APT_FAIL:-}" != "$1" ]] || exit 7
case "$*" in
  update) ;;
  'install -y openjdk-17-jdk-headless')
    [[ "${TEST_KEEP_OLD_JAVA:-0}" == 1 ]] || printf '%s\n' ready > "${TEST_JDK_STATE_FILE:?}"
    ;;
  *) exit 3 ;;
esac
EOF
chmod +x "$fake_bin/npm" "$fake_bin/pi" "$fake_bin/java" "$fake_bin/javac" "$fake_bin/id" "$fake_bin/sudo" "$fake_bin/apt-get"
mkdir -p "$workspace_root/.pi"
printf '%s\n' '{"theme":"fixture-theme","packages":["npm:unmanaged-package@1.0.0"]}' > "$workspace_root/.pi/settings.json"

run_init() {
  PATH="$fake_bin:$PATH" "$fixture_repo/scripts/init-workspace.sh" \
    --workspace-root "$workspace_root" "$@"
}

run_init >/dev/null
extensions_destination="$workspace_root/.pi/extensions"
cmp -s -- "$fixture_repo/extensions/alpha/index.ts" \
  "$extensions_destination/alpha/index.ts"
cmp -s -- "$fixture_repo/package.json" "$extensions_destination/package.json"
[[ -d "$extensions_destination/node_modules" ]]
[[ -f "$workspace_root/.pi/npm/node_modules/pi-web-access/package.json" ]]
SETTINGS="$workspace_root/.pi/settings.json" node <<'NODE'
const fs = require("node:fs");
const settings = JSON.parse(fs.readFileSync(process.env.SETTINGS, "utf8"));
if (settings.theme !== "fixture-theme") process.exit(1);
if (!settings.packages?.includes("npm:unmanaged-package@1.0.0")) process.exit(1);
const matches = settings.packages?.filter((entry) =>
  entry && typeof entry === "object" && entry.source === "npm:pi-web-access@0.23.0");
if (matches?.length !== 1 || JSON.stringify(matches[0].extensions) !== "[]") process.exit(1);
NODE

printf '%s\n' 'workspace drift' > "$extensions_destination/alpha/index.ts"
mkdir -p "$extensions_destination/unwanted"
printf '%s\n' 'unwanted' > "$extensions_destination/unwanted/index.ts"
printf '%s\n' 'standalone' > "$extensions_destination/standalone.ts"
check_output="$(run_init --check)"
grep -Fq 'Pi extension (alpha): drifted' <<<"$check_output"
grep -Fq 'Pi extension (standalone.ts): unmanaged (preserved)' <<<"$check_output"
grep -Fq 'Pi extension (unwanted): unmanaged (preserved)' <<<"$check_output"
grep -Fq 'Pi package (pi-web-access@0.23.0): ready' <<<"$check_output"

SETTINGS="$workspace_root/.pi/settings.json" node <<'NODE'
const fs = require("node:fs");
const settings = JSON.parse(fs.readFileSync(process.env.SETTINGS, "utf8"));
settings.packages = settings.packages.map((entry) =>
  entry?.source === "npm:pi-web-access@0.23.0" ? entry.source : entry);
fs.writeFileSync(process.env.SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
NODE
check_output="$(run_init --check)"
grep -Fq 'Pi package (pi-web-access@0.23.0): drifted' <<<"$check_output"
run_init >/dev/null

rm -rf -- "$workspace_root/.pi/npm/node_modules/pi-web-access"
check_output="$(run_init --check)"
grep -Fq 'Pi package (pi-web-access@0.23.0): drifted' <<<"$check_output"

run_init >/dev/null
cmp -s -- "$fixture_repo/extensions/alpha/index.ts" \
  "$extensions_destination/alpha/index.ts"
[[ -f "$extensions_destination/standalone.ts" ]]
[[ -f "$extensions_destination/unwanted/index.ts" ]]
[[ -f "$workspace_root/.pi/pi-agent-config-managed.json" ]]
MANIFEST="$workspace_root/.pi/pi-agent-config-managed.json" node <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST, "utf8"));
if (manifest.version !== 1) process.exit(1);
if (JSON.stringify(manifest.extensions) !== JSON.stringify(["alpha"])) process.exit(1);
NODE

mv -- "$fixture_repo/extensions/alpha" "$fixture_repo/extensions/beta"
if run_init >/dev/null 2>&1; then
  echo "FAIL: extension inventory drift should block initialization" >&2
  exit 1
fi
cat > "$fixture_repo/package.json" <<'JSON'
{
  "name": "init-workspace-fixture",
  "private": true,
  "pi": {
    "extensions": ["./extensions/beta"]
  }
}
JSON
run_init >/dev/null
[[ ! -e "$extensions_destination/alpha" ]]
cmp -s -- "$fixture_repo/extensions/beta/index.ts" \
  "$extensions_destination/beta/index.ts"
[[ -f "$extensions_destination/standalone.ts" ]]
[[ -f "$extensions_destination/unwanted/index.ts" ]]

# Refuse unmanaged contract paths before removing any managed content.
unmanaged_workspace="$tmp_dir/unmanaged-workspace"
mkdir -p "$unmanaged_workspace/.agents"
printf '%s\n' 'user contract' > "$unmanaged_workspace/AGENTS.md"
if PATH="$fake_bin:$PATH" "$fixture_repo/scripts/init-workspace.sh" \
  --workspace-root "$unmanaged_workspace" --no-pi-local >/dev/null 2>&1; then
  echo "FAIL: unmanaged AGENTS.md should block initialization" >&2
  exit 1
fi
grep -Fq 'user contract' "$unmanaged_workspace/AGENTS.md"

# Activate parser runtime requirements after the legacy ownership cases above.
mkdir -p "$fixture_repo/extensions/code-intelligence"
printf '%s\n' 'code-intelligence-fixture' > "$fixture_repo/extensions/code-intelligence/index.ts"
cat > "$fixture_repo/package.json" <<'JSON'
{
  "name": "init-workspace-fixture",
  "private": true,
  "pi": {"extensions": ["./extensions/beta", "./extensions/code-intelligence"]},
  "dependencies": {"typescript": "5.9.3"}
}
JSON

# Default installs the local TypeScript dependency, but never silently uses sudo.
output="$(run_init 2>&1)"
grep -Fq 'Code intelligence TypeScript runtime: ready' <<<"$output"
grep -Fq 'warning: Java analysis is unavailable (unusable)' <<<"$output"
[[ ! -s "$TEST_APT_LOG" ]]

# --check remains read-only even with the opt-in install flag.
: > "$TEST_MUTATION_LOG"
output="$(run_init --check --install-runtimes)"
grep -Fq 'Code intelligence TypeScript runtime: ready' <<<"$output"
grep -Fq 'Code intelligence Java runtime: unusable' <<<"$output"
[[ ! -s "$TEST_MUTATION_LOG" && ! -s "$TEST_APT_LOG" ]]

# Preserve a compatible newer JDK without any privileged installation.
printf '%s\n' newer > "$TEST_JDK_STATE_FILE"
output="$(run_init --install-runtimes)"
grep -Fq 'ready (existing JDK preserved)' <<<"$output"
[[ ! -s "$TEST_APT_LOG" ]]
[[ "$(<"$TEST_JDK_STATE_FILE")" == newer ]]

# Old Java and legacy 1.x versions are not mistaken for compatible runtimes.
for state in old legacy; do
  printf '%s\n' "$state" > "$TEST_JDK_STATE_FILE"
  output="$(run_init --check)"
  grep -Fq 'Code intelligence Java runtime: unsupported-version' <<<"$output"
done
printf '%s\n' old > "$TEST_JDK_STATE_FILE"
output="$(TEST_JAVA_WARNING=1 run_init --check)"
grep -Fq 'Code intelligence Java runtime: unsupported-version' <<<"$output"
if grep -Fq 'Picked up JAVA_TOOL_OPTIONS' <<<"$output"; then
  echo 'FAIL: raw launcher output must not be reported'
  exit 1
fi
output="$(run_init --install-runtimes)"
grep -Fq 'Code intelligence Java runtime: ready' <<<"$output"
[[ "$(grep -Fc 'sudo apt-get update' "$TEST_APT_LOG")" == 1 ]]
[[ "$(grep -Fc 'sudo apt-get install -y openjdk-17-jdk-headless' "$TEST_APT_LOG")" == 1 ]]
[[ "$(wc -l < "$TEST_APT_LOG")" == 4 ]]

# A JRE-like runtime lacking the compiler module is visible and repairable.
printf '%s\n' compiler-missing > "$TEST_JDK_STATE_FILE"
output="$(run_init --check)"
grep -Fq 'Code intelligence Java runtime: compiler-module-missing' <<<"$output"
run_init --install-runtimes >/dev/null

# Failed opt-in setup stops before managed links/extensions are reconciled.
printf '%s\n' 'preserve preflight drift' > "$extensions_destination/beta/index.ts"
printf '%s\n' old > "$TEST_JDK_STATE_FILE"
: > "$TEST_APT_LOG"
if TEST_APT_FAIL=update run_init --install-runtimes > "$tmp_dir/failure.log" 2>&1; then
  echo 'FAIL: apt update failure must stop initialization' >&2
  exit 1
fi
[[ "$(wc -l < "$TEST_APT_LOG")" == 2 ]]
grep -Fq 'preserve preflight drift' "$extensions_destination/beta/index.ts"

# Unsupported OS and root execution are refused without sudo.
: > "$TEST_APT_LOG"
printf '%s\n' 'ID=fixture-unsupported' > "$TEST_OS_RELEASE"
if run_init --install-runtimes > "$tmp_dir/failure.log" 2>&1; then
  echo 'FAIL: unsupported OS must not invoke package installation' >&2
  exit 1
fi
grep -Fq 'supports Ubuntu only' "$tmp_dir/failure.log"
[[ ! -s "$TEST_APT_LOG" ]]
printf '%s\n' 'ID=ubuntu' > "$TEST_OS_RELEASE"
if TEST_USER_ID=0 run_init --install-runtimes > "$tmp_dir/failure.log" 2>&1; then
  echo 'FAIL: root runtime installation must be refused' >&2
  exit 1
fi
[[ ! -s "$TEST_APT_LOG" ]]

# Installing packages must not force a manually selected old Java alternative.
if TEST_KEEP_OLD_JAVA=1 run_init --install-runtimes > "$tmp_dir/failure.log" 2>&1; then
  echo 'FAIL: an incompatible selected runtime must not be reported ready' >&2
  exit 1
fi
grep -Fq 'select a full JDK 17+ in PATH' "$tmp_dir/failure.log"
grep -Fq 'preserve preflight drift' "$extensions_destination/beta/index.ts"

# TypeScript version and API checks test deployed-local resolution, not merely
# presence of node_modules. Fake npm never installs or executes a real compiler.
printf '%s\n' ready > "$TEST_JDK_STATE_FILE"
for mode in missing mismatch bad-api; do
  if TEST_TS_MODE="$mode" run_init > "$tmp_dir/failure.log" 2>&1; then
    echo "FAIL: TypeScript $mode must fail runtime validation" >&2
    exit 1
  fi
  grep -Fq 'failed its version/compiler API smoke check' "$tmp_dir/failure.log"
done
run_init >/dev/null

# Contract-only setup neither installs nor even probes parser runtimes.
: > "$TEST_MUTATION_LOG"
: > "$TEST_RUNTIME_READ_LOG"
run_init --no-pi-local >/dev/null
[[ ! -s "$TEST_MUTATION_LOG" && ! -s "$TEST_RUNTIME_READ_LOG" ]]
if run_init --no-pi-local --install-runtimes > "$tmp_dir/failure.log" 2>&1; then
  echo 'FAIL: conflicting install flags must stop before mutations' >&2
  exit 1
fi
[[ ! -s "$TEST_MUTATION_LOG" ]]

printf '%s\n' 'init-workspace ownership and parser runtime fixtures: ok'
