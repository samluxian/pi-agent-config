# Managed Ubuntu/WSL Bash cosmetics. No private contexts or credentials.
case $- in *i*) ;; *) return ;; esac

# Avoid running brew shellenv on every shell startup.
if [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
    export HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew
    export HOMEBREW_CELLAR="$HOMEBREW_PREFIX/Cellar"
    export HOMEBREW_REPOSITORY="$HOMEBREW_PREFIX/Homebrew"
    case ":$PATH:" in
        *":$HOMEBREW_PREFIX/bin:"*) ;;
        *) export PATH="$HOMEBREW_PREFIX/bin:$HOMEBREW_PREFIX/sbin:$PATH" ;;
    esac
fi

alias k='kubectl'
alias kx='kubectx'
alias kn='kubens'

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# Load nvm only when Node tooling is first used, not at terminal startup.
_pi_load_nvm() {
    if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
        printf 'nvm is not installed at %s\n' "$NVM_DIR" >&2
        return 127
    fi
    unset -f nvm node npm npx
    source "$NVM_DIR/nvm.sh"
}
nvm() { _pi_load_nvm && nvm "$@"; }
node() { _pi_load_nvm && command node "$@"; }
npm() { _pi_load_nvm && command npm "$@"; }
npx() { _pi_load_nvm && command npx "$@"; }

# Git's official prompt helper, with no expensive dirty/untracked scan enabled.
for _pi_git_prompt in /usr/lib/git-core/git-sh-prompt /usr/share/git-core/contrib/completion/git-prompt.sh /usr/share/git/completion/git-prompt.sh /home/linuxbrew/.linuxbrew/etc/bash_completion.d/git-prompt.sh; do
    if [[ -r "$_pi_git_prompt" ]]; then
        source "$_pi_git_prompt"
        break
    fi
done
unset _pi_git_prompt
_pi_git_prompt() {
    declare -F __git_ps1 >/dev/null && __git_ps1 ' (%s)'
}

kube_prompt_context() {
    local context_without_prefix="${1#*_}"
    printf '%s' "${context_without_prefix%%_*}"
}
KUBE_PS1_SYMBOL_ENABLE=false
KUBE_PS1_CLUSTER_FUNCTION=kube_prompt_context
KUBE_PS1_PREFIX=' ['
KUBE_PS1_SUFFIX=']'
if [[ -r /home/linuxbrew/.linuxbrew/opt/kube-ps1/share/kube-ps1.sh ]]; then
    source /home/linuxbrew/.linuxbrew/opt/kube-ps1/share/kube-ps1.sh
fi
_pi_kube_prompt() {
    declare -F kube_ps1 >/dev/null && kube_ps1
}
kubectx() {
    command kubectx "$@"
    local result=$?
    _KUBE_PS1_LAST_TIME=0
    return "$result"
}
kubens() {
    command kubens "$@"
    local result=$?
    _KUBE_PS1_LAST_TIME=0
    return "$result"
}
PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[33m\]$(_pi_git_prompt)\[\033[36m\]$(_pi_kube_prompt)\[\033[00m\]\$ '
