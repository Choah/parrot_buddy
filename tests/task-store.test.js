const test = require('node:test');
const assert = require('node:assert/strict');
const { TaskStore } = require('../src/task-store');

test('starts and finishes a successful task', () => {
  const store = new TaskStore();
  const task = store.startTask({
    id: 'task-1',
    label: 'Unit tests',
    source: 'cli',
    command: 'npm test'
  });

  assert.equal(task.status, 'running');
  assert.equal(store.getSummary().runningCount, 1);

  const finished = store.finishTask('task-1', { exitCode: 0 });

  assert.equal(finished.status, 'success');
  assert.equal(finished.exitCode, 0);
  assert.equal(store.getSummary().runningCount, 0);
  assert.equal(store.getSummary().lastFinishedStatus, 'success');
});

test('keeps multiple running tasks independent', () => {
  const store = new TaskStore();
  store.startTask({ id: 'task-a', label: 'A' });
  store.startTask({ id: 'task-b', label: 'B' });

  assert.equal(store.getSummary().runningCount, 2);

  store.finishTask('task-a', { exitCode: 1 });

  assert.equal(store.getSummary().runningCount, 1);
  assert.equal(store.getTasks().find((task) => task.id === 'task-a').status, 'failed');
  assert.equal(store.getTasks().find((task) => task.id === 'task-b').status, 'running');
});

test('stores recent command output tails', () => {
  const store = new TaskStore();
  store.startTask({ id: 'task-output', label: 'Output' });

  for (let index = 0; index < 25; index += 1) {
    store.appendOutput('task-output', 'stdout', `line-${index}\n`);
  }

  const task = store.getTasks()[0];
  assert.equal(task.stdoutTail.length, 20);
  assert.equal(task.stdoutTail[0], 'line-5');
  assert.equal(task.stdoutTail[19], 'line-24');
});

test('upserts stable per-turn agent status cards', () => {
  const store = new TaskStore();

  store.upsertTask({
    id: 'codex-turn-1',
    label: 'Codex: test_kit #1',
    source: 'agent',
    command: '~/test_kit · turn 1 · working',
    status: 'running'
  });

  store.upsertTask({
    id: 'codex-turn-2',
    label: 'Codex: api #2',
    source: 'agent',
    command: '~/api · turn 2 · working',
    status: 'running'
  });

  const tasks = store.getTasks();
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].status, 'running');
  assert.equal(tasks[1].status, 'running');
  assert.equal(store.getSummary().agentRunningCount, 2);
  assert.equal(store.getSummary().runningCount, 2);
});

test('prioritizes agent HITL tasks above running tasks', () => {
  const store = new TaskStore();

  store.upsertTask({
    id: 'codex-running',
    label: 'Codex: test_kit #1',
    source: 'agent',
    command: '~/test_kit · turn 1 · working',
    status: 'running'
  });

  store.upsertTask({
    id: 'codex-hitl',
    label: 'Codex: analytics_agent #2',
    source: 'agent',
    command: '충돌 파일을 덮어써도 될까요?',
    status: 'hitl'
  });

  const tasks = store.getTasks();
  assert.equal(tasks[0].id, 'codex-hitl');
  assert.equal(store.getSummary().agentHitlCount, 1);
  assert.equal(store.getSummary().agentRunningCount, 1);
});

test('counts assistant ready tasks in status summary', () => {
  const store = new TaskStore();

  store.upsertTask({
    id: 'assistant-ready',
    label: 'Parrot assistant',
    source: 'assistant',
    command: 'ready',
    status: 'waiting'
  });

  const summary = store.getSummary();
  assert.equal(summary.assistantReadyCount, 1);
  assert.equal(summary.statusReadyCount, 1);
});

test('rejects invalid terminal statuses', () => {
  const store = new TaskStore();
  store.startTask({ id: 'task-invalid', label: 'Invalid' });

  assert.throws(() => {
    store.finishTask('task-invalid', { status: 'running' });
  }, /Invalid terminal status/);
});
