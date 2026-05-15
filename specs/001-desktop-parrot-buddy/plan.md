# Implementation Plan

## Stack

- Electron for the macOS desktop companion window.
- Node.js for process spawning and local bridge API.
- Plain HTML/CSS/JavaScript for the renderer.
- Node test runner for state transition tests.

## Architecture

- `src/main.js`: Electron main process, transparent pet window lifecycle, slow wander behavior, IPC, spawned command handling.
- `src/task-store.js`: in-memory task state manager.
- `src/api-server.js`: localhost HTTP bridge for external CLI wrappers.
- `src/sound.js`: macOS sound playback helper.
- `src/preload.js`: safe IPC surface for the renderer.
- `src/renderer/*`: yellow lovebird pet UI, status speech bubble, hidden guide panel, and task controls.
- `bin/buddy-run.js`: CLI wrapper that reports task start/finish to the app.
- `.vscode/tasks.json`: examples for VS Code task integration.

## Local Protocol

The desktop app listens on `127.0.0.1:17872`.

- `GET /health`
- `GET /tasks`
- `POST /task/start`
- `POST /task/finish`

Payloads use JSON. If the app is not running, `buddy-run` still runs the command and plays a fallback finish sound.

## Risks

- Electron may require dependency installation before first run.
- macOS sound playback relies on `/usr/bin/afplay`.
- VS Code integrated terminal commands are only tracked when launched through `buddy-run`.
- Transparent windows still have rectangular bounds, so the visible UI should stay compact and avoid dashboard-style panels by default.

## Validation

- Unit-test `TaskStore` transitions.
- Run a CLI wrapper smoke command.
- Start the Electron app for manual verification.
- Verify the in-app guide opens, pauses wandering, and keeps usage examples visible.
