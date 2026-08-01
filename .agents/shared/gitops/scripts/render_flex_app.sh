#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "WARNING: render_flex_app.sh is a compatibility shim; use render_helm_values.sh for new work." >&2
exec "$script_dir/render_helm_values.sh" "$@"
