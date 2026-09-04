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
printf '%s\n' '# fixture contract' > "$fixture_repo/AGENTS.md"
printf '%s\n' 'alpha-v1' > "$fixture_repo/extensions/alpha/index.ts"
cat > "$fixture_repo/package.json" <<'JSON'
{
  "name": "init-workspace-fixture",
  "private": true
}
JSON
cat > "$fake_bin/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p node_modules
EOF
cat > "$fake_bin/pi" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "install" && "$2" == "-l" && "$3" == "npm:pi-web-access@0.23.0" ]]
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
chmod +x "$fake_bin/npm" "$fake_bin/pi"
mkdir -p "$workspace_root/.pi"
printf '%s\n' '{"theme":"fixture-theme"}' > "$workspace_root/.pi/settings.json"

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
if (!settings.packages?.includes("npm:pi-web-access@0.23.0")) process.exit(1);
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

printf '%s\n' 'init-workspace rebuild with ownership: ok'
