#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf -- "$tmp_dir"' EXIT

fixture_repo="$tmp_dir/devops-pi-agent"
workspace_root="$tmp_dir/workspace root"
call_log="$tmp_dir/call.log"
mkdir -p "$fixture_repo/scripts" "$workspace_root"
cp -- "$repo_root/Makefile" "$fixture_repo/Makefile"
cat > "$fixture_repo/scripts/init-workspace.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${CALL_LOG:?}"
EOF
chmod +x "$fixture_repo/scripts/init-workspace.sh"

help_output="$(make -s --no-print-directory -C "$fixture_repo" help)"
grep -Fq 'make workspace-check' <<<"$help_output"
grep -Fq 'make workspace-init' <<<"$help_output"
grep -Fq 'make workspace-contract-only' <<<"$help_output"
grep -Fq 'WORKSPACE_ROOT=/path/to/workspace' <<<"$help_output"
[[ ! -e "$call_log" ]]
[[ "$(make -s --no-print-directory -C "$fixture_repo")" == "$help_output" ]]

run_target() {
  local target="$1"
  shift
  rm -f -- "$call_log"
  CALL_LOG="$call_log" make -s --no-print-directory -C "$fixture_repo" \
    "$target" WORKSPACE_ROOT="$workspace_root"
  mapfile -t actual < "$call_log"
  expected=("$@")
  [[ "${#actual[@]}" -eq "${#expected[@]}" ]]
  local index
  for index in "${!expected[@]}"; do
    [[ "${actual[$index]}" == "${expected[$index]}" ]]
  done
}

run_target workspace-init --workspace-root "$workspace_root"
run_target workspace-check --workspace-root "$workspace_root" --check
run_target workspace-contract-only --workspace-root "$workspace_root" --no-pi-local

printf '%s\n' 'Makefile workspace facade: ok'
