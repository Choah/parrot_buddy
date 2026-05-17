# Implementation Plan: Codex Personal Assistant Parrot

## Stack

- Electron main process for assistant orchestration, reminders, and file writes.
- Existing renderer HTML/CSS/JavaScript for the compact chat panel.
- Local `codex` CLI for reasoning.
- Markdown and JSON files for local memory.
- Node test runner for parser, reminder, and storage validation.

## Architecture

### New Modules

- `src/assistant/codex-adapter.js`
  - Finds the `codex` binary.
  - Runs a non-interactive Codex turn.
  - Converts user message + relevant local context into a constrained prompt.
  - Expects structured JSON output from Codex.

- `src/assistant/assistant-store.js`
  - Owns `~/.parrot-buddy/assistant/`.
  - Creates daily history files.
  - Updates `latest.md`, `memory.md`, `inbox.md`, `reminders.json`, and session logs.
  - Guards against path traversal and writes outside the assistant root.

- `src/assistant/reminder-store.js`
  - Reads/writes reminders.
  - Computes due reminders.
  - Supports done/snooze/edit.

- `src/assistant/assistant-orchestrator.js`
  - Handles a chat message.
  - Loads relevant history.
  - Calls Codex.
  - Validates Codex proposed actions.
  - Applies local file updates.
  - Emits UI events and alert states.

- `src/assistant/history-search.js`
  - Searches local markdown history for recall questions.
  - Starts with simple full-text search over local files.
  - Can later be replaced with a richer index.

### Existing Modules to Extend

- `src/main.js`
  - Register assistant IPC handlers.
  - Start reminder scheduler.
  - Reuse existing alert functions for due reminders and user confirmation.

- `src/preload.js`
  - Expose assistant chat APIs.

- `src/renderer/app.js`
  - Add long-press detection.
  - Add assistant chat panel.
  - Render assistant messages, save results, reminders, and setup errors.

- `src/renderer/styles.css`
  - Style compact chat panel without turning the app into a large dashboard.

- `src/renderer/index.html`
  - Add assistant panel markup.

- `README.md` and `GUIDE.md`
  - Explain local Codex CLI requirement and local memory files.

## Codex Integration Contract

The app should treat Codex as a reasoning engine, not as an unrestricted file writer.

Preferred v1 flow:

1. App receives user message.
2. App gathers relevant local context from assistant files.
3. App runs `codex exec` in a temporary working directory or assistant root with a constrained prompt.
4. Codex returns JSON with:
   - `reply`
   - `history_patch`
   - `memory_patch`
   - `reminders_to_create`
   - `reminders_to_update`
   - `clarifying_question`
   - `confidence`
5. App validates the JSON.
6. App writes approved changes through `assistant-store`.
7. App sends a compact result back to the renderer.

Codex should not receive direct permission to edit arbitrary user files.

## Prompt Contract

Codex prompt must include:

- Current local date, time, and timezone.
- User message.
- Relevant excerpts from today's history, upcoming reminders, and memory.
- Clear instruction to return JSON only.
- Clear instruction that uncertain dates require clarification.
- Clear instruction to keep Korean responses concise and easy.

## Storage Contract

Default root:

```text
~/.parrot-buddy/assistant/
```

All writes must pass through a helper that verifies:

- Resolved path starts with assistant root.
- File extension is allowed: `.md`, `.json`.
- JSON files parse before and after mutation.
- Markdown files are appended or updated through known sections.

## Renderer UX

- Long-press parrot opens assistant chat.
- The assistant persona is Joy (`조이`): cool on the surface, but secretly warm, kind, and gently tsundere.
- Greetings and ordinary small talk should be handled locally without Codex and without history writes.
- Chat panel should be movable and closable.
- Assistant panel can show:
  - chat messages
  - "saved to" file links
  - reminder chips
  - clarification prompt
  - Codex setup error
- The panel should auto-fit the transparent Electron window like the guide/status box.

## Reminder Scheduler

- Runs in main process.
- Checks due reminders every 60 seconds while app is running.
- Checks missed reminders on app startup.
- Uses existing alert semantics:
  - User confirmation needed: one chirp.
  - User-requested action completed: two chirps.
  - Silent background maintenance: no chirp.

## Validation

- Unit-test date parsing handoff and reminder persistence.
- Unit-test assistant root path guard.
- Unit-test Codex output validation with malformed JSON.
- Unit-test due reminder detection and notification de-duplication.
- Manual-test long-press versus drag conflict.
- Manual-test Codex unavailable state.
- Run existing `npm test` to protect current agent monitoring behavior.

## Rollout Plan

1. Add assistant storage and reminder store with tests.
2. Add renderer chat panel behind long-press interaction.
3. Add Codex adapter with unavailable/login error handling.
4. Add orchestrator and structured JSON prompt.
5. Add reminder scheduler and UI reminder actions.
6. Generate `AGENTS.md` and `CLAUDE.md` inside the assistant root so the same memory policy is visible to Codex and future Claude Code usage.
7. Update guide and README.

## Risks

- Codex CLI output may include non-JSON text.
- Long-press can conflict with drag behavior if the threshold is too sensitive.
- Automatic date extraction can be wrong for relative Korean phrases.
- Personal history data is sensitive, so writes and logs must stay local and inspectable.
- Running Codex per message can feel slow; the UI needs a clear "thinking" state.
