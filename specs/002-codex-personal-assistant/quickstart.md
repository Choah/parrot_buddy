# Quickstart: Codex Personal Assistant Parrot

This is the intended user flow after implementation.

## 1. Install Codex CLI

Parrot Buddy does not ask for model API keys. It uses the local `codex` command already installed and logged in on the user's Mac.

Check locally:

```bash
codex --help
codex login
```

## 2. Open Assistant Chat

- Hold the parrot briefly without dragging.
- The Joy assistant chat opens near the parrot.

## 3. Save Today's Notes

Example:

```text
오늘 오후 3시에 병원 예약했고 내일 오전에 결과 확인해야 해. 오늘은 parrot buddy README도 정리했어.
```

Expected result:

- `~/.parrot-buddy/assistant/history/YYYY-MM-DD.md` is updated.
- `~/.parrot-buddy/assistant/history/latest.md` is updated.
- `~/.parrot-buddy/assistant/reminders.json` gets a result-check reminder.
- Chat shows what was saved.

Simple greetings such as `안녕?` should get a local Joy-style reply and should not be saved to history.

## 4. Ask for Recall

Examples:

```text
오늘 정리해줘.
이번 주 할 일 보여줘.
앞으로 일정 알려줘.
```

## 5. Reminder Behavior

When a reminder is due:

- Parrot Buddy shows it in the assistant panel/status area.
- The menu bar icon can show the due state.
- The parrot uses the user-attention alert pattern.

Background indexing or internal Codex steps should stay silent.
