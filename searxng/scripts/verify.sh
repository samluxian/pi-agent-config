#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
base_url="${SEARXNG_BASE_URL:-http://127.0.0.1:8080}"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed or not in PATH" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose v2 is unavailable" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 1
fi

echo "== compose =="
docker compose -f "$root_dir/docker-compose.yml" ps

echo "== JSON API =="
response="$(curl -fsS --max-time 15 "${base_url%/}/search?q=searxng&format=json")"
python3 -c '
import json, sys
payload = json.load(sys.stdin)
if not isinstance(payload.get("results"), list):
    raise SystemExit("response has no results array")
print("ready: {} results".format(len(payload["results"])))
' <<<"$response"

echo "Pi: export SEARXNG_BASE_URL=$base_url"
