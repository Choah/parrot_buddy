const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

const TERMINAL_STATUSES = new Set(['success', 'failed', 'stopped']);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = 'task') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeTask(input = {}) {
  const id = input.id || createId(input.source || 'task');
  return {
    id,
    label: input.label || input.command || 'Untitled task',
    source: input.source || 'cli',
    command: input.command || '',
    status: input.status || 'running',
    startedAt: input.startedAt || nowIso(),
    finishedAt: input.finishedAt || null,
    exitCode: Number.isInteger(input.exitCode) ? input.exitCode : null,
    stdoutTail: Array.isArray(input.stdoutTail) ? input.stdoutTail.slice(-20) : [],
    stderrTail: Array.isArray(input.stderrTail) ? input.stderrTail.slice(-20) : []
  };
}

class TaskStore extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.lastFinishedStatus = null;
  }

  startTask(input = {}) {
    const task = normalizeTask({ ...input, status: 'running' });
    this.tasks.set(task.id, task);
    this.emitChange();
    return task;
  }

  upsertTask(input = {}) {
    if (!input.id) {
      throw new Error('Task id is required');
    }

    const existing = this.tasks.get(input.id);
    const task = normalizeTask({
      ...(existing || {}),
      ...input,
      id: input.id,
      startedAt: input.startedAt || existing?.startedAt || nowIso()
    });

    this.tasks.set(task.id, task);
    if (['success', 'failed', 'stopped'].includes(task.status)) {
      this.lastFinishedStatus = task.status;
    }
    this.emitChange();
    return task;
  }

  updateTask(id, patch = {}) {
    const existing = this.tasks.get(id);
    if (!existing) return null;

    const task = normalizeTask({
      ...existing,
      ...patch,
      id
    });

    this.tasks.set(id, task);
    if (patch.status && ['success', 'failed', 'stopped'].includes(patch.status)) {
      this.lastFinishedStatus = patch.status;
    }
    this.emitChange();
    return task;
  }

  removeTask(id) {
    const removed = this.tasks.delete(id);
    if (removed) this.emitChange();
    return removed;
  }

  finishTask(id, result = {}) {
    const existing = this.tasks.get(id);
    const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : null;
    const status = result.status || (exitCode === 0 ? 'success' : 'failed');

    if (!TERMINAL_STATUSES.has(status)) {
      throw new Error(`Invalid terminal status: ${status}`);
    }

    const task = normalizeTask({
      ...(existing || { id, label: result.label, source: result.source }),
      ...result,
      id,
      exitCode,
      status,
      finishedAt: result.finishedAt || nowIso()
    });

    this.tasks.set(id, task);
    this.lastFinishedStatus = status;
    this.emitChange();
    return task;
  }

  appendOutput(id, streamName, chunk) {
    const task = this.tasks.get(id);
    if (!task || !chunk) return null;

    const key = streamName === 'stderr' ? 'stderrTail' : 'stdoutTail';
    const lines = String(chunk)
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    task[key] = task[key].concat(lines).slice(-20);
    this.emitChange();
    return task;
  }

  getTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => {
      const statusRank = { hitl: 0, running: 1, waiting: 2, failed: 3, success: 4, stopped: 5 };
      const aRank = statusRank[a.status] ?? 5;
      const bRank = statusRank[b.status] ?? 5;
      if (aRank !== bRank) return aRank - bRank;

      const aTime = a.finishedAt || a.startedAt;
      const bTime = b.finishedAt || b.startedAt;
      return bTime.localeCompare(aTime);
    });
  }

  getSummary() {
    const tasks = this.getTasks();
    const agentTasks = tasks.filter((task) => task.source === 'agent');
    return {
      runningCount: tasks.filter((task) => task.status === 'running').length,
      agentRunningCount: agentTasks.filter((task) => task.status === 'running').length,
      agentHitlCount: agentTasks.filter((task) => task.status === 'hitl').length,
      agentReadyCount: agentTasks.filter((task) => task.status === 'waiting' || task.status === 'success').length,
      agentStoppedCount: agentTasks.filter((task) => task.status === 'stopped').length,
      lastFinishedStatus: this.lastFinishedStatus,
      updatedAt: nowIso()
    };
  }

  snapshot() {
    return {
      tasks: this.getTasks(),
      summary: this.getSummary()
    };
  }

  emitChange() {
    this.emit('change', this.snapshot());
  }
}

module.exports = {
  TaskStore,
  createId
};
