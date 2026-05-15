# Project Constitution: Parrot Buddy

## Principles

1. Local-first operation
   - The app must run on the user's Mac without cloud services.
   - CLI monitoring must work through local processes and localhost only.

2. Visible, low-friction feedback
   - The desktop buddy must show task state at a glance: idle, running, success, and failure.
   - Finished tasks must trigger a macOS notification sound.

3. Multiple task support
   - More than one CLI task may run at once.
   - Each task needs an independent label, source, status, start time, finish time, and exit code.

4. IDE-friendly integration
   - VS Code integration should use standard `tasks.json` and a command wrapper so users do not need a custom extension for the first version.
   - The same wrapper must work from any terminal.

5. Safe defaults
   - Commands run only when the user starts them or explicitly wraps them with `buddy-run`.
   - The app must not inspect shell history, capture credentials, or monitor unrelated terminal sessions.

## Governance

- Prefer simple local protocols over platform-specific automation.
- Keep UI compact enough to behave like a desktop companion, not a full dashboard.
- Add tests around task state transitions before broadening features.

