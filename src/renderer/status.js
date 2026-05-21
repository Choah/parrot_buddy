(function attachParrotBuddyStatus(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ParrotBuddyStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createParrotBuddyStatus() {
  const PARROT_STATE_CLASSES = ['hitl', 'running', 'success', 'failed', 'stopped', 'wing-active'];

  function statusTasks(snapshot = {}) {
    return (Array.isArray(snapshot.tasks) ? snapshot.tasks : [])
      .filter((task) => task.source === 'agent' || task.source === 'assistant');
  }

  function isCodexTask(task) {
    const label = String(task?.label || '');
    return task?.source === 'agent' && (
      label === 'Codex'
      || label === 'Codex VS Code'
      || /^Codex(?::|\s|$)/.test(label)
    );
  }

  function parrotStatus(snapshot = {}) {
    const tasks = statusTasks(snapshot);
    if (tasks.some((task) => task.status === 'hitl')) return 'hitl';
    if (tasks.some((task) => task.status === 'running')) return 'running';
    if (tasks.some((task) => task.status === 'failed')) return 'failed';
    if (tasks.some((task) => task.status === 'waiting' || task.status === 'success')) return 'success';
    if (tasks.some((task) => task.status === 'stopped')) return 'stopped';
    return 'idle';
  }

  function parrotWingActive(snapshot = {}) {
    return statusTasks(snapshot).some((task) => isCodexTask(task) && task.status === 'waiting');
  }

  function parrotClassNames(snapshot = {}) {
    const classes = [];
    const status = parrotStatus(snapshot);
    if (status !== 'idle') classes.push(status);
    if (status !== 'running' && parrotWingActive(snapshot)) classes.push('wing-active');
    return classes;
  }

  return {
    PARROT_STATE_CLASSES,
    isCodexTask,
    parrotClassNames,
    parrotStatus,
    parrotWingActive,
    statusTasks
  };
});
