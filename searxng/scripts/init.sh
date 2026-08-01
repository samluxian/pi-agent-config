#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
env_file="$root_dir/.env"
settings_file="$root_dir/core-config/settings.yml"

if [[ ! -f "$env_file" ]]; then
  cp "$root_dir/.env.example" "$env_file"
  echo "created: $env_file"
else
  echo "preserved: $env_file"
fi

if [[ -f "$settings_file" ]]; then
  echo "preserved: $settings_file"
  exit 0
fi

if command -v openssl >/dev/null 2>&1; then
  secret="$(openssl rand -hex 32)"
elif command -v python3 >/dev/null 2>&1; then
  secret="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
else
  echo "error: openssl or python3 is required to generate server.secret_key" >&2
  exit 1
fi

sed "s/CHANGE_ME/$secret/" "$root_dir/core-config/settings.yml.example" >"$settings_file"
chmod 600 "$settings_file"
unset secret
echo "created: $settings_file"
echo "next: cd $root_dir && docker compose up -d"
