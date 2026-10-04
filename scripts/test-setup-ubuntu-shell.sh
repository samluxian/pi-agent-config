#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
rc=$fixture/bashrc
printf '# user settings\nexport KEEP_ME=yes\n' > "$rc"
bash "$root/scripts/setup-ubuntu-shell.sh" --bashrc "$rc"
bash -n "$rc"
grep -q 'export KEEP_ME=yes' "$rc"
cmp "$rc.pi-agent-config.bak" <(printf '# user settings\nexport KEEP_ME=yes\n')
cp "$rc" "$fixture/first"
bash "$root/scripts/setup-ubuntu-shell.sh" --bashrc "$rc"
cmp "$rc" "$fixture/first"
# Updating the managed region preserves content before and after it.
printf '\n# user tail\n' >> "$rc"
python3 - "$rc" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
p.write_text(p.read_text().replace("alias k='kubectl'", "alias k='old'"))
PY
bash "$root/scripts/setup-ubuntu-shell.sh" --bashrc "$rc"
grep -q "alias k='kubectl'" "$rc"
grep -q '# user tail' "$rc"
# Reject unsafe/malformed destinations without changing them.
ln -s "$rc" "$fixture/link"
if bash "$root/scripts/setup-ubuntu-shell.sh" --bashrc "$fixture/link"; then exit 1; fi
printf '# >>> pi-agent-config bash cosmetics >>>\n' > "$fixture/broken"
cp "$fixture/broken" "$fixture/broken-before"
if bash "$root/scripts/setup-ubuntu-shell.sh" --bashrc "$fixture/broken"; then exit 1; fi
cmp "$fixture/broken" "$fixture/broken-before"
# Source only the template, never a real user's full rc. No nvm load at startup.
mkdir "$fixture/nvm"
printf 'printf loaded > "$NVM_DIR/loaded"\nnvm() { printf "mock nvm"; }\n' > "$fixture/nvm/nvm.sh"
NVM_DIR="$fixture/nvm" bash --noprofile --norc -ic '
    source "$1"
    [[ ! -e "$NVM_DIR/loaded" ]] || exit 1
    [[ $(nvm) == "mock nvm" ]] || exit 1
    [[ -e "$NVM_DIR/loaded" ]] || exit 1
    [[ $PS1 == *"\$(_pi_git_prompt)"* ]] || exit 1
' bash "$root/config/bashrc-cosmetics.sh"
printf '%s\n' 'Ubuntu shell tests: PASS (no installations or home changes).'
