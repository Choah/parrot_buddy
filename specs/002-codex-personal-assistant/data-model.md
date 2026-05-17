# Data Model: Codex Personal Assistant Parrot

## AssistantSettings

```json
{
  "version": 1,
  "language": "ko",
  "timezone": "Asia/Seoul",
  "assistantRoot": "~/.parrot-buddy/assistant",
  "codexCommand": "codex",
  "codexProfile": null,
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "08:00"
  }
}
```

## DailyHistory

Stored as markdown at:

```text
history/YYYY-MM-DD.md
```

Recommended sections:

```markdown
# YYYY-MM-DD

## 초간단 요약

## 오늘 기록

## 할 일

## 일정 / 리마인더

## 결정한 것

## 나중에 다시 볼 것

## 원문 메모
```

## Reminder

Stored in `reminders.json`.

```json
{
  "id": "rem_20260517_150000_result-check",
  "title": "결과 확인",
  "dueAt": "2026-05-18T09:00:00+09:00",
  "timezone": "Asia/Seoul",
  "status": "open",
  "source": {
    "type": "history",
    "date": "2026-05-17",
    "sessionId": "2026-05-17-151200"
  },
  "createdAt": "2026-05-17T15:12:00+09:00",
  "updatedAt": "2026-05-17T15:12:00+09:00",
  "lastNotifiedAt": null,
  "snoozedUntil": null,
  "repeat": null
}
```

Statuses:

- `open`
- `done`
- `snoozed`
- `cancelled`

## AssistantSession

Stored as JSON in `sessions/YYYY-MM-DD-HHmmss.json`.

```json
{
  "id": "2026-05-17-151200",
  "createdAt": "2026-05-17T15:12:00+09:00",
  "userMessage": "오늘 오후 3시에 병원 예약했고 내일 결과 확인",
  "codexAvailable": true,
  "contextFiles": [
    "history/2026-05-17.md",
    "memory.md",
    "reminders.json"
  ],
  "result": {
    "reply": "저장했어요. 내일 결과 확인 리마인더도 만들었습니다.",
    "changedFiles": [
      "history/2026-05-17.md",
      "history/latest.md",
      "reminders.json"
    ],
    "createdReminderIds": [
      "rem_20260518_result-check"
    ],
    "needsConfirmation": false
  }
}
```

## CodexActionResponse

Codex should return this shape to the app.

```json
{
  "reply": "사용자에게 보여줄 짧은 답변",
  "history_patch": {
    "save": true,
    "date": "2026-05-17",
    "summary_lines": [],
    "notes": [],
    "tasks": [],
    "events": [],
    "decisions": [],
    "followups": []
  },
  "memory_patch": {
    "add": [],
    "update": []
  },
  "reminders_to_create": [],
  "reminders_to_update": [],
  "clarifying_question": null,
  "confidence": "high"
}
```
