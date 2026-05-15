const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TaskStore } = require('../src/task-store');
const { AgentMonitor, messageLooksHitl, parseClaudeLine, parseCodexEventLine } = require('../src/agent-monitor');

test('parses Codex turn lifecycle events without reading message text', () => {
  const started = parseCodexEventLine(JSON.stringify({
    timestamp: '2026-05-15T08:27:22.377Z',
    type: 'event_msg',
    payload: {
      type: 'task_started',
      turn_id: 'turn-1',
      started_at: 1778833642
    }
  }));

  const completed = parseCodexEventLine(JSON.stringify({
    timestamp: '2026-05-15T08:29:22.377Z',
    type: 'event_msg',
    payload: {
      type: 'task_complete',
      turn_id: 'turn-1',
      completed_at: 1778833762,
      last_agent_message: 'ignored'
    }
  }));

  assert.equal(started.type, 'task_started');
  assert.equal(started.turnId, 'turn-1');
  assert.equal(completed.type, 'task_complete');
  assert.equal(completed.turnId, 'turn-1');
});

test('parses Claude Code transcript activity generically', () => {
  const event = parseClaudeLine(JSON.stringify({
    type: 'tool_use',
    timestamp: '2026-05-15T08:30:00.000Z',
    tool_input: {
      workdir: '/tmp/project',
      command: 'ignored'
    }
  }));

  assert.equal(event.type, 'tool_use');
  assert.equal(event.cwd, '/tmp/project');
});

test('parses Codex approval requests as HITL events', () => {
  const event = parseCodexEventLine(JSON.stringify({
    timestamp: '2026-05-15T08:54:58.252Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'exec_command',
      call_id: 'call-approval',
      arguments: JSON.stringify({
        cmd: 'git checkout --ours -- file.py',
        sandbox_permissions: 'require_escalated',
        justification: '충돌 파일을 덮어써도 될까요?'
      })
    }
  }));

  assert.equal(event.type, 'approval_requested');
  assert.equal(event.callId, 'call-approval');
  assert.equal(event.command, '충돌 파일을 덮어써도 될까요?');
  assert.equal(messageLooksHitl(event.command), true);
});

test('parses generic Codex activity events so active turns do not go stale while work continues', () => {
  const event = parseCodexEventLine(JSON.stringify({
    timestamp: '2026-05-15T08:54:58.252Z',
    type: 'event_msg',
    payload: {
      type: 'exec_command_end',
      turn_id: 'turn-activity'
    }
  }));

  assert.equal(event.type, 'activity');
  assert.equal(event.turnId, 'turn-activity');
});

test('shows multiple active Codex turns and omits completed history from the task list', () => {
  const store = new TaskStore();
  const monitor = new AgentMonitor({ store, pollMs: 999999 });
  const mtime = Date.now();

  monitor.codexContexts.set('turn-a', { cwd: '/tmp/analytics_agent' });
  monitor.codexContexts.set('turn-b', { cwd: '/tmp/test_kit' });
  monitor.codexActiveTurns.set('turn-a', {
    startedAt: new Date(mtime - 1000).toISOString(),
    filePath: '/tmp/a.jsonl',
    fileMtimeMs: mtime
  });
  monitor.codexActiveTurns.set('turn-b', {
    startedAt: new Date(mtime - 500).toISOString(),
    filePath: '/tmp/b.jsonl',
    fileMtimeMs: mtime
  });
  monitor.codexCompletedTurns.set('turn-old', {
    finishedAt: new Date(mtime - 2000).toISOString(),
    status: 'success',
    filePath: '/tmp/old.jsonl',
    fileMtimeMs: mtime - 2000
  });

  monitor.updateCodexTask([]);

  const codexTurns = store.snapshot().tasks.filter((task) => task.id.startsWith('codex-turn-'));
  assert.equal(codexTurns.length, 2);
  assert.deepEqual(codexTurns.map((task) => task.label).sort(), [
    'Codex: analytics_agent #turn-a',
    'Codex: test_kit #turn-b'
  ]);
});

test('stops orphaned Codex turns quickly when no matching terminal is alive', () => {
  const store = new TaskStore();
  const monitor = new AgentMonitor({ store, pollMs: 999999 });
  const staleMtime = Date.now() - 120 * 1000;

  monitor.codexContexts.set('turn-stale', { cwd: '/tmp/missing_project' });
  monitor.codexActiveTurns.set('turn-stale', {
    startedAt: new Date(staleMtime).toISOString(),
    filePath: '/tmp/stale.jsonl',
    fileMtimeMs: staleMtime
  });

  monitor.updateCodexTask([]);

  assert.equal(monitor.codexActiveTurns.has('turn-stale'), false);
  assert.equal(monitor.codexCompletedTurns.get('turn-stale').status, 'stopped');
  assert.equal(store.snapshot().tasks.some((task) => task.id === 'codex-turn-turn-stale'), false);
});

test('does not duplicate active Codex turns as working terminal process cards', () => {
  const store = new TaskStore();
  const monitor = new AgentMonitor({ store, pollMs: 999999 });
  const mtime = Date.now();

  monitor.codexContexts.set('turn-active', { cwd: '/tmp/test_kit' });
  monitor.codexActiveTurns.set('turn-active', {
    startedAt: new Date(mtime - 1000).toISOString(),
    filePath: '/tmp/active.jsonl',
    fileMtimeMs: mtime
  });

  store.upsertTask({
    id: 'codex-process-1',
    label: 'Codex Terminal: test_kit',
    source: 'agent',
    command: '/tmp/test_kit · pid 1 · working',
    status: 'running'
  });
  monitor.codexProcessTaskIds = new Set(['codex-process-1']);

  monitor.updateCodexProcessTasks([
    { pid: 1, kind: 'terminal', cwd: '/tmp/test_kit' },
    { pid: 2, kind: 'terminal', cwd: '/tmp/test_kit' },
    { pid: 3, kind: 'terminal', cwd: '/tmp/other' }
  ]);

  const tasks = store.snapshot().tasks;
  assert.equal(tasks.some((task) => task.id === 'codex-process-1'), false);
  assert.equal(tasks.some((task) => task.id === 'codex-process-2'), false);

  const other = tasks.find((task) => task.id === 'codex-process-3');
  assert.equal(other.status, 'waiting');
  assert.match(other.command, /open$/);
  assert.equal(tasks.some((task) => task.id.startsWith('codex-process-') && task.status === 'running'), false);
});

test('limits same-folder active Codex turns to live terminal count', () => {
  const store = new TaskStore();
  const monitor = new AgentMonitor({ store, pollMs: 999999 });
  const mtime = Date.now();

  for (const turnId of ['turn-a', 'turn-b', 'turn-c']) {
    monitor.codexContexts.set(turnId, { cwd: '/tmp/test_kit' });
    monitor.codexActiveTurns.set(turnId, {
      startedAt: new Date(mtime + turnId.charCodeAt(turnId.length - 1)).toISOString(),
      filePath: `/tmp/${turnId}.jsonl`,
      fileMtimeMs: mtime
    });
  }

  monitor.pruneExcessActiveCodexTurns([
    { pid: 1, kind: 'terminal', cwd: '/tmp/test_kit' },
    { pid: 2, kind: 'terminal', cwd: '/tmp/test_kit' }
  ]);
  monitor.updateCodexTask([]);

  const codexTurns = store.snapshot().tasks.filter((task) => task.id.startsWith('codex-turn-'));
  assert.equal(codexTurns.length, 2);
  assert.deepEqual(codexTurns.map((task) => task.label).sort(), [
    'Codex: test_kit #turn-b',
    'Codex: test_kit #turn-c'
  ]);
});

test('does not show Claude Code ready for stale IDE locks owned by non-Claude processes', () => {
  const lockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parrot-claude-locks-'));
  fs.writeFileSync(path.join(lockRoot, '30594.lock'), JSON.stringify({
    pid: 30594,
    workspaceFolders: ['/tmp/test_kit'],
    ideName: 'Visual Studio Code'
  }));

  const store = new TaskStore();
  const monitor = new AgentMonitor({
    store,
    pollMs: 999999,
    claudeIdeLockRoot: lockRoot,
    peonStatePath: path.join(lockRoot, 'missing-state.json')
  });

  monitor.updateClaudeTask([
    '30594 /Applications/Visual Studio Code.app/Contents/MacOS/Code /Applications/Visual Studio Code.app/Contents/MacOS/Code'
  ]);

  const task = store.snapshot().tasks.find((item) => item.id === 'agent-claude');
  assert.equal(task.status, 'stopped');
  assert.equal(task.command, 'Claude Code process not detected');
});
