#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
install_tools=false
bashrc=${HOME}/.bashrc
while (($#)); do
    case $1 in
        --install-tools) install_tools=true; shift ;;
        --bashrc) [[ $# -ge 2 ]] || { echo 'Missing --bashrc path' >&2; exit 2; }; bashrc=$2; shift 2 ;;
        --help|-h)
            printf '%s\n' 'Usage: bash scripts/setup-ubuntu-shell.sh [--install-tools] [--bashrc PATH]' \
                'Default: update only a managed cosmetics block; preserve other Bash settings.' \
                '--install-tools: user-operated Ubuntu installer; requires sudo and network.'
            exit 0 ;;
        *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done

if $install_tools; then
    [[ $(id -u) != 0 ]] || { echo 'Run as a normal user, not root.' >&2; exit 1; }
    # System metadata only; no cloud credentials or context changes.
    source /etc/os-release
    [[ ${ID:-} == ubuntu ]] || { echo 'Tool installation supports Ubuntu only.' >&2; exit 1; }
    sudo apt-get update
    sudo apt-get install -y build-essential procps curl file git ca-certificates gnupg python3
    if ! [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
        installer=$(mktemp)
        trap 'rm -f "$installer"' EXIT
        curl --fail --show-error --location https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$installer"
        bash "$installer"
        rm -f "$installer"
        trap - EXIT
    fi
    brew=/home/linuxbrew/.linuxbrew/bin/brew
    [[ -x $brew ]] || { echo 'Expected Linux Homebrew prefix is missing.' >&2; exit 1; }
    for formula in git kubernetes-cli kubectx kube-ps1 helm hashicorp/tap/terraform; do
        if ! "$brew" list --versions "$formula" >/dev/null 2>&1; then
            "$brew" install "$formula"
        fi
    done
    if [[ ! -s ${NVM_DIR:-$HOME/.nvm}/nvm.sh ]]; then
        installer=$(mktemp)
        trap 'rm -f "$installer"' EXIT
        curl --fail --show-error --location https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh -o "$installer"
        PROFILE=/dev/null bash "$installer"
        rm -f "$installer"
        trap - EXIT
    fi
    if ! command -v gcloud >/dev/null 2>&1; then
        # Dedicated managed repository files; never configure or authenticate gcloud.
        key=$(mktemp)
        trap 'rm -f "$key"' EXIT
        curl --fail --show-error --location https://packages.cloud.google.com/apt/doc/apt-key.gpg -o "$key"
        sudo gpg --dearmor --yes -o /usr/share/keyrings/pi-agent-google-cloud.gpg "$key"
        printf '%s\n' 'deb [signed-by=/usr/share/keyrings/pi-agent-google-cloud.gpg] https://packages.cloud.google.com/apt cloud-sdk main' |
            sudo tee /etc/apt/sources.list.d/pi-agent-google-cloud.list >/dev/null
        rm -f "$key"
        trap - EXIT
        sudo apt-get update
        sudo apt-get install -y google-cloud-cli
    fi
fi

command -v python3 >/dev/null || { echo 'python3 is required to safely update bashrc.' >&2; exit 1; }
python3 - "$bashrc" "$root/config/bashrc-cosmetics.sh" <<'PY'
import os
from pathlib import Path
import shutil
import sys
import tempfile

path, template = map(Path, sys.argv[1:])
start = '# >>> pi-agent-config bash cosmetics >>>'
end = '# <<< pi-agent-config bash cosmetics <<<'
if path.is_symlink():
    raise SystemExit('Refusing to replace a symlink bashrc.')
text = path.read_text() if path.exists() else ''
block = start + '\n' + template.read_text().rstrip('\n') + '\n' + end + '\n'
if start in text or end in text:
    if text.count(start) != 1 or text.count(end) != 1:
        raise SystemExit('Malformed or duplicate managed block; no changes made.')
    before, rest = text.split(start, 1)
    if end not in rest:
        raise SystemExit('Reversed managed markers; no changes made.')
    _, after = rest.split(end, 1)
    updated = before + block.rstrip('\n') + after
else:
    updated = text + ('\n' if text and not text.endswith('\n') else '') + block
if updated == text:
    print('Bash cosmetics already current.')
    raise SystemExit(0)
backup = path.with_name(path.name + '.pi-agent-config.bak')
if path.exists() and not backup.exists():
    shutil.copy2(path, backup)
fd, temporary = tempfile.mkstemp(prefix='.pi-bashrc-', dir=path.parent)
try:
    with os.fdopen(fd, 'w') as stream:
        stream.write(updated)
    os.chmod(temporary, path.stat().st_mode & 0o777 if path.exists() else 0o600)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print('Updated Bash cosmetics. Open a new terminal to activate.')
PY
