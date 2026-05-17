# Research: Codex Personal Assistant Parrot

## Spec Kit Notes

Spec Kit frames development around specifications first, then planning, tasks, and implementation. For this feature, the important takeaway is to keep the first document focused on product behavior rather than immediately choosing every implementation detail.

Relevant Spec Kit workflow:

- Define feature behavior and user stories.
- Clarify ambiguous requirements before implementation.
- Add a technical plan after the product spec is stable.
- Break the work into tasks only after spec and plan agree.

Reference: https://github.com/github/spec-kit

## Hermes Agent Notes

Hermes Agent is useful as inspiration, not as a dependency. Its README highlights:

- Persistent memory and cross-session recall.
- Periodic nudges to persist knowledge.
- Scheduled automations through a cron-style scheduler.
- CLI and messaging entry points.
- Agent skills and self-improvement loops.

For Parrot Buddy v1, the matching ideas are:

- Keep local memory files.
- Let the assistant recall past local history.
- Add scheduled reminder checks.
- Keep the primary entry point as the desktop parrot.

Deferred ideas:

- Messaging gateways.
- Self-created skills.
- Cloud/server execution.
- Multi-agent delegation.

Reference: https://github.com/NousResearch/hermes-agent

## Local Codex CLI Notes

The installed local Codex CLI supports non-interactive execution through `codex exec`. It also supports configuration through the user's Codex setup instead of requiring Parrot Buddy to store model API keys.

Observed local help summary:

- `codex exec`: run Codex non-interactively.
- `codex login`: manage login.
- `--cd <DIR>`: set working root.
- `--sandbox <MODE>`: choose sandbox policy.
- `--ask-for-approval <POLICY>`: choose approval behavior.

Design implication:

- Parrot Buddy should call Codex through a small adapter.
- Parrot Buddy should keep file writes under its own validation layer.
- Codex output should be structured and validated before any local write.

## UX Decision

Long-press opens chat because normal click/drag already has important meaning:

- Normal drag: move whole window.
- Right-click or Option-click: show/hide window size.
- Triple click: guide.
- Resize handle: parrot size.

The long-press must cancel if the pointer moves enough to count as a drag.
