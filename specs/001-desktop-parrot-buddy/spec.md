# Feature Spec: Desktop Parrot Buddy

## User Story

As a developer working in VS Code and multiple terminals on macOS, I want a cute yellow lovebird desktop buddy that shows whether my tracked commands are running or finished, so I can notice build/test completion without constantly checking each terminal.

## Requirements

- The app must run locally on macOS as a transparent desktop pet, not as a normal dashboard window.
- The buddy must display a cute animated yellow lovebird inspired by a rosy-faced lovebird.
- The buddy must wander slowly on the desktop while remaining always on top.
- The app must show task states: idle, running, passed, failed, and stopped.
- The app must support multiple concurrent CLI tasks.
- The user must be able to start a command from the app.
- The user must be able to wrap a command from any terminal using a CLI helper.
- VS Code tasks must be able to call the same CLI helper.
- A task completion sound must play on macOS.
- The app must expose a localhost bridge so external CLI processes can report start and finish events.
- The app must avoid reading shell history or monitoring untracked terminal activity.
- The app must include a compact guide that can be opened without leaving the app.

## Non-Goals

- A full VS Code extension.
- Cloud sync.
- Screen scraping terminal windows.
- Background monitoring of all system processes.

## Acceptance Criteria

- Running `npm start` opens a transparent floating yellow lovebird buddy.
- Running `node bin/buddy-run.js --label "Example" -- node -e "setTimeout(()=>{}, 1000)"` shows a running task and then a finished task.
- Multiple `buddy-run` commands can run at the same time and appear independently.
- Finished tasks play a macOS system sound.
- VS Code can integrate through the provided `.vscode/tasks.json` example.
- Clicking `?` opens an in-app guide with terminal and VS Code usage examples.
