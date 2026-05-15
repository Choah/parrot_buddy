# Research Notes

## VS Code Integration

The first version should not require a custom VS Code extension. VS Code Tasks can call any shell command, so a `buddy-run` wrapper provides reliable status reporting without needing access to private terminal state.

## CLI Monitoring

Shell history and arbitrary terminal introspection are avoided because they are unreliable and can expose sensitive data. Explicit wrapping gives clear consent and exact lifecycle events.

## macOS Notifications

The initial completion cue uses `afplay` with built-in macOS system sounds. This keeps the app dependency-light and works without notification permission prompts.

