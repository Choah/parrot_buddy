# Parrot Buddy zsh integration.
# Source this file from ~/.zshrc to report foreground terminal commands.

if [[ -n "${PARROT_BUDDY_ZSH_LOADED:-}" ]]; then
  return 0
fi

typeset -g PARROT_BUDDY_ZSH_LOADED=1
typeset -g PARROT_BUDDY_SHELL_PATH="${(%):-%x}"
typeset -g PARROT_BUDDY_HOME="${PARROT_BUDDY_SHELL_PATH:A:h:h}"
typeset -g PARROT_BUDDY_EVENT_BIN="$PARROT_BUDDY_HOME/bin/buddy-event.js"
typeset -g PARROT_BUDDY_ACTIVE_ID=""

_parrot_buddy_should_ignore() {
  local cmd="$1"
  [[ -z "$cmd" ]] && return 0
  [[ "$cmd" == "exit" || "$cmd" == "logout" ]] && return 0
  [[ "$cmd" == *"$PARROT_BUDDY_HOME/parrot-buddy"* ]] && return 0
  [[ "$cmd" == *"$PARROT_BUDDY_HOME/bin/buddy-run.js"* ]] && return 0
  [[ "$cmd" == *"$PARROT_BUDDY_HOME/bin/buddy-event.js"* ]] && return 0
  [[ "$cmd" == "npm run launch"* && "$PWD" == "$PARROT_BUDDY_HOME" ]] && return 0
  [[ "$cmd" == "npm run stop"* && "$PWD" == "$PARROT_BUDDY_HOME" ]] && return 0
  return 1
}

_parrot_buddy_start() {
  local cmd="$1"
  _parrot_buddy_should_ignore "$cmd" && return 0

  local label="$cmd"
  if (( ${#label} > 80 )); then
    label="${label[1,77]}..."
  fi

  PARROT_BUDDY_ACTIVE_ID="zsh-$(date +%s)-$RANDOM"
  command node "$PARROT_BUDDY_EVENT_BIN" start "$PARROT_BUDDY_ACTIVE_ID" "$label" "$cmd" "$PWD" >/dev/null 2>&1
}

_parrot_buddy_finish() {
  local exit_code=$?
  [[ -n "$PARROT_BUDDY_ACTIVE_ID" ]] || return 0

  command node "$PARROT_BUDDY_EVENT_BIN" finish "$PARROT_BUDDY_ACTIVE_ID" "$exit_code" >/dev/null 2>&1
  PARROT_BUDDY_ACTIVE_ID=""
  return "$exit_code"
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _parrot_buddy_start
add-zsh-hook precmd _parrot_buddy_finish
