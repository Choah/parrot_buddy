# Data Model

## Task

- `id`: unique task id
- `label`: user-facing task name
- `source`: `app`, `cli`, or `vscode`
- `command`: command string
- `status`: `running`, `success`, `failed`, or `stopped`
- `startedAt`: ISO timestamp
- `finishedAt`: ISO timestamp or null
- `exitCode`: number or null
- `stdoutTail`: recent stdout lines
- `stderrTail`: recent stderr lines

## Status Summary

- `runningCount`
- `lastFinishedStatus`
- `updatedAt`

