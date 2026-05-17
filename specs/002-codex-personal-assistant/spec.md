# Feature Spec: Codex Personal Assistant Parrot

## Summary

Parrot Buddy should become a local-first personal assistant, not only an agent status pet. The user can long-press the parrot to open a compact chat panel, write daily notes, tasks, schedule items, reminders, and future plans, and let Codex organize important items into local history files. The assistant is named Joy (`조이`), a cool-on-the-surface but secretly warm, kind tsundere parrot. The assistant should use the user's installed and authenticated Codex CLI, not direct API keys or `.env` model credentials.

This spec follows the Spec Kit idea of defining the product behavior first: what the user needs, why it matters, and which outcomes prove the feature works. Technical details live in `plan.md`.

## User Story

As a user who keeps Parrot Buddy on the desktop while working, I want to hold the parrot and quickly tell it what happened today, what I need to do, and what I should remember later, so the parrot can maintain my personal history and remind me at the right time without requiring a separate notes app or API-key setup.

## Product Goals

- Turn Parrot Buddy into a small personal secretary that can remember the user's day.
- Keep the interaction as lightweight as the existing pet: hold parrot, type or paste, get organized output.
- Use Codex as the reasoning engine through the local Codex CLI.
- Store personal memory in simple local files that the user can inspect, back up, and edit.
- Add local reminders based on extracted dates and times.
- Preserve the current agent-status behavior for Codex and Claude Code terminals.

## External Inspiration

- GitHub Spec Kit: use a spec-driven workflow where requirements come before implementation details.
- Hermes Agent: borrow the ideas of persistent memory, cross-session recall, scheduled automations, and an agent that grows with the user.
- Parrot Buddy should not become Hermes Agent itself. It should remain a desktop companion that delegates reasoning to Codex and keeps storage local.

## Interaction Model

### Opening Assistant Chat

- Long-press the parrot for about 600 ms to open the assistant chat panel.
- If the pointer moves beyond the drag threshold, treat the gesture as window movement, not assistant chat.
- Short click, triple click, Option-click, right-click, guide, window size, and resize behavior must keep their current meaning.
- The assistant panel should open near the parrot and fit within the current real window bounds, expanding the transparent window only as needed.

### Chat Input

The user can write natural notes such as:

- "오늘 오후 3시에 병원 예약했고, 5월 20일에 결과 확인해야 해."
- "내일 오전에 README 정리하고, 이번 주 안에 dmg 릴리즈 만들기."
- "요즘 계속 parrot buddy를 개인비서처럼 만들고 싶다는 생각이 있어."
- "오늘 한 일 정리해줘."
- "이번 주에 내가 해야 할 일 보여줘."

### Assistant Output

The assistant should answer in plain, easy Korean by default:

- What it understood
- What it saved
- Any reminder it created
- Any ambiguous date or task it could not safely infer

If confirmation is needed, the app should show a clear confirmation state and use the existing "user attention" alert pattern.

## Local Files

Default root:

```text
~/.parrot-buddy/assistant/
```

Required files/directories:

```text
history/
  YYYY-MM-DD.md
  latest.md
memory.md
reminders.json
inbox.md
settings.json
sessions/
  YYYY-MM-DD-HHmmss.json
```

### File Responsibilities

- `history/YYYY-MM-DD.md`: daily user-facing journal, tasks, events, decisions, and follow-ups.
- `history/latest.md`: pointer-style summary or copy of the most recent daily history for quick opening.
- `memory.md`: durable preferences and recurring facts about the user, only updated when high confidence or explicitly requested.
- `AGENTS.md`: local instructions Codex can read when operating in the assistant root.
- `CLAUDE.md`: matching local instructions for future Claude Code compatibility.
- `reminders.json`: machine-readable reminders with due times, status, source note, and notification state.
- `inbox.md`: unresolved ambiguous notes, possible reminders that need confirmation, and unprocessed imports.
- `settings.json`: local assistant preferences such as timezone, language, reminder quiet hours, and Codex command path.
- `sessions/*.json`: raw assistant turn metadata for debugging and audit, excluding secrets.

## Functional Requirements

- FR-001: The app must open a personal assistant chat panel when the user long-presses the parrot without dragging.
- FR-002: The app must use the local `codex` CLI as the assistant reasoning engine.
- FR-003: The app must not require OpenAI, Anthropic, or other model API keys in `.env`.
- FR-004: The app must detect when Codex CLI is unavailable or not logged in and explain the fix in the chat panel.
- FR-005: The app must store all personal assistant data under `~/.parrot-buddy/assistant/` by default.
- FR-006: The app must create a daily history markdown file named by local date, for example `2026-05-17.md`.
- FR-007: The app must update `latest.md` whenever a daily history file is updated.
- FR-008: The app must extract tasks, dated events, reminders, decisions, and general notes from a user message.
- FR-008a: The app must not store simple greetings, acknowledgements, or ordinary small talk.
- FR-008b: The app must store durable user facts and preferences, such as "I like spaghetti", in `memory.md`.
- FR-009: The app must create or update `reminders.json` for items with clear due dates or times.
- FR-010: The app must ask for clarification before saving a reminder if the date, time, or intent is ambiguous.
- FR-011: The app must support "today", "tomorrow", "this week", and Korean relative dates using the user's local timezone.
- FR-012: The app must show due reminders inside Parrot Buddy and in the macOS menu bar status list.
- FR-013: The app must chirp only when a reminder is due, a user decision is needed, or a user-requested assistant action is complete.
- FR-014: The app must not chirp for internal Codex substeps, hidden tool calls, or background indexing.
- FR-015: The user must be able to ask "오늘 정리해줘", "이번 주 할 일 보여줘", and "앞으로 일정 보여줘".
- FR-016: The assistant must be able to search the user's local history files before answering recall questions.
- FR-016a: The assistant should prefer recent history before older history when answering recall questions.
- FR-017: The assistant must show what file changed after it saves information.
- FR-018: The assistant must never silently delete personal history.
- FR-019: The assistant must keep existing Codex/Claude terminal monitoring behavior intact.
- FR-020: The assistant must keep the UI compact enough that the transparent window does not block unrelated desktop clicks more than necessary.

## Non-Goals

- Cloud sync.
- Telegram, Slack, Discord, or external gateway support in the first version.
- Full calendar app replacement.
- Reading Apple Calendar, Messages, Mail, or browser history automatically.
- Monitoring all user activity without explicit input.
- Building a separate Hermes-compatible agent runtime.
- Storing model provider API keys in this app.
- Autonomous file edits outside `~/.parrot-buddy/assistant/`.

## Assistant Behavior Rules

- Default language: Korean, unless the user writes in English or changes the setting.
- Default tone: concise personal secretary, not a long consultant report.
- Assistant persona: Joy, cool on the surface, but secretly warm, kind, and gently tsundere.
- Always preserve original user wording in session metadata.
- Save structured summaries, not every raw message, into daily history.
- Simple greetings and casual chat are answered locally and not saved.
- Separate facts from guesses.
- For uncertain dates, ask before creating reminders.
- For personal preference updates, require either explicit wording or repeated high-confidence evidence.

## Reminder Rules

- A reminder has `id`, `title`, `dueAt`, `timezone`, `status`, `source`, `createdAt`, `updatedAt`, and optional `repeat`.
- Due reminders should appear in the assistant panel and tray menu.
- A reminder should not repeat chirps indefinitely. After notifying, mark `lastNotifiedAt`.
- The user can mark reminders done, snooze them, or edit them from the assistant panel.
- If the app was closed when a reminder became due, show it after launch.

## Privacy and Safety Requirements

- All assistant data must remain local unless the user explicitly exports or shares it.
- The app must disclose that Codex CLI may use the user's configured Codex account/session.
- The app must not collect shell history, clipboard contents, screen contents, email, calendar, or messages automatically.
- The app must validate any file write operation so it stays inside the assistant data root.
- The app must keep a session audit trail for assistant turns.
- The user must be able to open the assistant data folder from the guide or assistant settings.

## Acceptance Criteria

- AC-001: Holding the parrot opens a chat panel; dragging the parrot still moves the whole window.
- AC-002: Sending "오늘 오후 3시에 병원 예약했고 내일 결과 확인" creates or updates today's history file and creates one reminder for tomorrow.
- AC-003: Sending "오늘 정리해줘" returns a readable summary from today's history file.
- AC-004: Sending "이번 주 할 일 보여줘" lists upcoming reminders and open tasks from local files.
- AC-005: With Codex CLI missing, the chat panel shows a setup error instead of failing silently.
- AC-006: The app works without any `.env` model API key.
- AC-007: Reminder due events produce the user-attention alert, not hidden background chirps.
- AC-008: Existing agent status monitoring still passes the current test suite.
- AC-009: The assistant does not write outside `~/.parrot-buddy/assistant/` during normal operation.
- AC-010: The guide explains that the personal assistant uses local files and local Codex CLI.

## Open Questions

- Should the default history folder be `~/.parrot-buddy/assistant/` or a user-visible folder such as `~/Documents/Parrot Buddy/Assistant/`?
- Should reminders also use native macOS notifications, or only Parrot Buddy's own chirp and panel?
- Should the assistant support voice input later, or keep v1 text-only?
- Should Codex run once per message, or should the app keep a resumable Codex session per assistant chat?
- Should the user be able to choose a different Codex profile/model from Parrot Buddy settings?

## References

- GitHub Spec Kit: https://github.com/github/spec-kit
- Hermes Agent: https://github.com/NousResearch/hermes-agent
