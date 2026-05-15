const parrot = document.getElementById('parrot');
const summaryPill = document.getElementById('summaryPill');
const statusHint = document.getElementById('statusHint');
const labelInput = document.getElementById('labelInput');
const commandInput = document.getElementById('commandInput');
const runForm = document.getElementById('runForm');
const runButton = document.getElementById('runButton');
const taskList = document.getElementById('taskList');
const taskCount = document.getElementById('taskCount');
const guideButton = document.getElementById('guideButton');
const guidePanel = document.getElementById('guidePanel');
const guideCloseButton = document.getElementById('guideCloseButton');
const closeButton = document.getElementById('closeButton');
const speech = document.querySelector('.speech');
const speechResizeHandle = document.getElementById('speechResizeHandle');
const speechResizeLeftHandle = document.getElementById('speechResizeLeftHandle');
const birdStage = document.querySelector('.bird-stage');
const windowFrameEditor = document.getElementById('windowFrameEditor');
const windowResizeHandles = document.querySelectorAll('.window-resize-handle');
const layoutStorageKey = 'parrotBuddyLayoutV5';
const enableSpeechFloating = false;
let windowEditMode = false;
let windowFrameResize = null;

function readLayout() {
  try {
    return JSON.parse(localStorage.getItem(layoutStorageKey)) || {};
  } catch {
    return {};
  }
}

function writeLayout(patch) {
  localStorage.setItem(layoutStorageKey, JSON.stringify({
    ...readLayout(),
    ...patch
  }));
}

function formatDuration(task) {
  const start = Date.parse(task.startedAt);
  const end = task.finishedAt ? Date.parse(task.finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function statusText(snapshot) {
  const agents = snapshot.tasks.filter((task) => task.source === 'agent');
  const hitl = agents.filter((task) => task.status === 'hitl');
  if (hitl.length > 0) return 'Needs confirmation';

  const running = agents.filter((task) => task.status === 'running');
  if (running.length > 0) return 'Agents working';

  const ready = agents.filter((task) => task.status === 'waiting' || task.status === 'success');
  if (ready.length > 0) return 'Agents ready';

  const stopped = agents.filter((task) => task.status === 'stopped');
  if (stopped.length > 0) return 'Agents stopped';

  return 'Watching agents';
}

function agentName(task) {
  const label = String(task.label || '');
  const command = String(task.command || '');

  const codexTurn = label.match(/^Codex:\s*([^#]+?)(?:\s*#(.+))?$/);
  if (codexTurn) {
    const suffix = codexTurn[2] ? ` #${codexTurn[2].trim()}` : '';
    return `Codex · ${codexTurn[1].trim()}${suffix}`;
  }

  const codexTerminal = label.match(/^Codex Terminal:\s*(.+)$/);
  if (codexTerminal) {
    const pid = command.match(/pid\s+(\d+)/);
    return `Codex terminal · ${codexTerminal[1].trim()}${pid ? ` #${pid[1]}` : ''}`;
  }

  const claude = label.match(/^Claude:\s*(.+)$/);
  if (claude) return `Claude Code · ${claude[1].trim()}`;

  if (label === 'Codex VS Code') return 'Codex VS Code';
  if (label === 'Claude Code') return 'Claude Code';

  const homePath = command.match(/(?:^|~\/|\/)([^/·\s]+)\s*·/);
  return homePath ? homePath[1] : label || 'Agent';
}

function agentStatusWord(status) {
  if (status === 'hitl') return 'confirm';
  if (status === 'running') return 'working';
  if (status === 'waiting' || status === 'success') return 'ready';
  if (status === 'failed') return 'check';
  return 'stopped';
}

function visibleAgentTasks(snapshot) {
  return snapshot.tasks
    .filter((task) => task.source === 'agent')
    .filter((task) => task.status !== 'success' && task.status !== 'stopped');
}

function renderStatusItems(snapshot) {
  statusHint.replaceChildren();
  const agents = visibleAgentTasks(snapshot);

  if (agents.length === 0) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'agent-line';
    label.textContent = 'Codex / Claude Code waiting';
    item.title = label.textContent;
    item.append(label);
    statusHint.append(item);
    return;
  }

  for (const task of agents) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'agent-line';
    label.textContent = `${agentStatusWord(task.status)} · ${agentName(task)}`;
    item.title = task.status === 'hitl' ? task.command : label.textContent;
    item.append(label);
    statusHint.append(item);
  }
}

function parrotStatus(snapshot) {
  const agents = snapshot.tasks.filter((task) => task.source === 'agent');
  if (agents.some((task) => task.status === 'hitl')) return 'hitl';
  if (agents.some((task) => task.status === 'running')) return 'running';
  if (agents.some((task) => task.status === 'waiting' || task.status === 'success')) return 'success';
  if (agents.some((task) => task.status === 'stopped')) return 'stopped';
  return 'idle';
}

function displayStatus(task) {
  if (task.status === 'hitl') return 'confirm';
  if (task.status === 'running') return 'working';
  if (task.status === 'waiting') return 'ready';
  if (task.status === 'success') return 'done';
  if (task.status === 'failed') return 'needs check';
  return task.status;
}

function renderTask(task) {
  const card = document.createElement('article');
  card.className = 'task-card';

  const top = document.createElement('div');
  top.className = 'task-topline';

  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.label;

  const status = document.createElement('div');
  status.className = `task-status ${task.status}`;
  status.textContent = displayStatus(task);

  top.append(title, status);

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  const exitCode = Number.isInteger(task.exitCode) ? ` · exit ${task.exitCode}` : '';
  meta.textContent = `${formatDuration(task)}${exitCode}`;

  const command = document.createElement('div');
  command.className = 'task-command';
  command.title = task.command;
  command.textContent = task.command || 'external task';

  card.append(top, meta, command);
  return card;
}

function render(snapshot) {
  const agentTasks = snapshot.tasks.filter((task) => task.source === 'agent');
  taskCount.textContent = String(agentTasks.length);
  summaryPill.textContent = statusText(snapshot);
  renderStatusItems(snapshot);

  parrot.classList.remove('hitl', 'running', 'success', 'failed', 'stopped');
  const currentStatus = parrotStatus(snapshot);
  if (currentStatus !== 'idle') parrot.classList.add(currentStatus);

  taskList.replaceChildren();
  if (agentTasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Waiting for Codex or Claude Code.';
    taskList.append(empty);
    return;
  }

  for (const task of agentTasks) {
    taskList.append(renderTask(task));
  }
}

async function runCommand() {
  const command = commandInput.value.trim();
  const label = labelInput.value.trim();
  if (!command) {
    commandInput.focus();
    return;
  }

  runButton.disabled = true;
  try {
    await window.buddy.runCommand({ label, command });
    commandInput.value = '';
  } finally {
    runButton.disabled = false;
  }
}

if (runForm && commandInput && runButton) {
  runForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runCommand();
  });

  commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runCommand();
  });
}

function toggleGuide() {
  guidePanel.hidden = !guidePanel.hidden;
  if (!guidePanel.hidden) requestAnimationFrame(clampFloatingLayout);
  window.buddy.windowAction({ type: 'guide-mode', open: !guidePanel.hidden });
}

function closeGuide() {
  guidePanel.hidden = true;
  window.buddy.windowAction({ type: 'guide-mode', open: false });
}

function setWindowEditMode(enabled) {
  windowEditMode = Boolean(enabled);
  document.body.classList.toggle('window-editing', windowEditMode);
  windowFrameEditor?.setAttribute('aria-hidden', String(!windowEditMode));

  if (windowEditMode && guidePanel && !guidePanel.hidden) {
    closeGuide();
  }
}

if (guideButton) {
  guideButton.addEventListener('click', toggleGuide);
}

if (guideCloseButton) {
  guideCloseButton.addEventListener('click', closeGuide);
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (windowEditMode) {
    setWindowEditMode(false);
    return;
  }
  if (!guidePanel.hidden) closeGuide();
});

let birdClickCount = 0;
let birdClickTimer = null;
let pokeAnimationTimer = null;
let alertAnimationTimer = null;
let suppressNextParrotClick = false;
let birdDrag = null;
let guideDrag = null;
let speechDrag = null;
let speechResize = null;
let windowDrag = null;

function playPokeAnimation() {
  clearTimeout(pokeAnimationTimer);
  parrot.classList.remove('poked');
  void parrot.offsetWidth;
  parrot.classList.add('poked');
  pokeAnimationTimer = setTimeout(() => {
    parrot.classList.remove('poked');
  }, 360);
}

function playAlertAnimation() {
  clearTimeout(alertAnimationTimer);
  parrot.classList.remove('alerting');
  void parrot.offsetWidth;
  parrot.classList.add('alerting');
  alertAnimationTimer = setTimeout(() => {
    parrot.classList.remove('alerting');
  }, 920);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function moveFloatingElementTo(element, left, top) {
  const rect = element.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - 8;
  const maxTop = window.innerHeight - rect.height - 8;
  element.style.left = `${Math.round(clamp(left, 8, Math.max(8, maxLeft)))}px`;
  element.style.top = `${Math.round(clamp(top, 8, Math.max(8, maxTop)))}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.transform = 'none';
}

function moveGuideTo(left, top) {
  moveFloatingElementTo(guidePanel, left, top);
  writeLayout({
    guide: {
      left: parseFloat(guidePanel.style.left),
      top: parseFloat(guidePanel.style.top)
    }
  });
}

function moveSpeechTo(left, top) {
  moveFloatingElementTo(speech, left, top);
  writeLayout({
    speech: {
      ...readLayout().speech,
      left: parseFloat(speech.style.left),
      top: parseFloat(speech.style.top)
    }
  });
}

function moveBirdTo(left, top) {
  moveFloatingElementTo(birdStage, left, top);
  writeLayout({
    bird: {
      left: parseFloat(birdStage.style.left),
      top: parseFloat(birdStage.style.top)
    }
  });
}

function resizeSpeechTo(width, height, left = null) {
  const rect = speech.getBoundingClientRect();
  const minWidth = 190;
  const minHeight = 56;
  const nextLeft = Number.isFinite(left)
    ? Math.round(clamp(left, 8, window.innerWidth - minWidth - 8))
    : rect.left;
  const maxWidth = Math.max(minWidth, window.innerWidth - nextLeft - 8);
  const maxHeight = Math.max(minHeight, window.innerHeight - rect.top - 8);
  const nextWidth = Math.round(clamp(width, minWidth, maxWidth));
  const nextHeight = Math.round(clamp(height, minHeight, maxHeight));
  if (Number.isFinite(left)) speech.style.left = `${nextLeft}px`;
  speech.style.width = `${nextWidth}px`;
  speech.style.height = `${nextHeight}px`;
  speech.style.right = 'auto';
  writeLayout({
    speech: {
      ...readLayout().speech,
      left: parseFloat(speech.style.left),
      width: nextWidth,
      height: nextHeight
    }
  });
}

function restoreFloatingLayout() {
  const layout = readLayout();

  if (layout.speech && speech) {
    if (Number.isFinite(layout.speech.left)) speech.style.left = `${layout.speech.left}px`;
    if (Number.isFinite(layout.speech.width)) speech.style.width = `${layout.speech.width}px`;
    if (Number.isFinite(layout.speech.height)) speech.style.height = `${layout.speech.height}px`;
    if (enableSpeechFloating && Number.isFinite(layout.speech.left) && Number.isFinite(layout.speech.top)) {
      moveFloatingElementTo(speech, layout.speech.left, layout.speech.top);
    }
    if (Number.isFinite(layout.speech.width)) speech.style.right = 'auto';
  }

  if (layout.guide && guidePanel) {
    if (Number.isFinite(layout.guide.left)) guidePanel.style.left = `${layout.guide.left}px`;
    if (Number.isFinite(layout.guide.top)) guidePanel.style.top = `${layout.guide.top}px`;
    if (Number.isFinite(layout.guide.left) || Number.isFinite(layout.guide.top)) {
      guidePanel.style.right = 'auto';
      guidePanel.style.bottom = 'auto';
    }
  }

  if (layout.bird && birdStage) {
    if (Number.isFinite(layout.bird.left) && Number.isFinite(layout.bird.top)) {
      moveFloatingElementTo(birdStage, layout.bird.left, layout.bird.top);
    }
  }
}

function clampFloatingLayout() {
  if (enableSpeechFloating && speech) {
    const rect = speech.getBoundingClientRect();
    moveSpeechTo(rect.left, rect.top);
  }

  if (guidePanel && !guidePanel.hidden) {
    const rect = guidePanel.getBoundingClientRect();
    moveGuideTo(rect.left, rect.top);
  }

  if (birdStage) {
    const rect = birdStage.getBoundingClientRect();
    moveBirdTo(rect.left, rect.top);
  }
}

restoreFloatingLayout();
window.addEventListener('resize', () => requestAnimationFrame(clampFloatingLayout));

if (enableSpeechFloating && speech) {
  speech.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.speech-resize-handle')) return;
    const rect = speech.getBoundingClientRect();
    speechDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    speech.setPointerCapture(event.pointerId);
    speech.classList.add('dragging');
    event.preventDefault();
  });

  speech.addEventListener('pointermove', (event) => {
    if (!speechDrag || speechDrag.pointerId !== event.pointerId) return;
    moveSpeechTo(
      speechDrag.left + event.clientX - speechDrag.startX,
      speechDrag.top + event.clientY - speechDrag.startY
    );
  });

  const stopSpeechDrag = (event) => {
    if (!speechDrag || speechDrag.pointerId !== event.pointerId) return;
    speech.releasePointerCapture(event.pointerId);
    speech.classList.remove('dragging');
    speechDrag = null;
  };

  speech.addEventListener('pointerup', stopSpeechDrag);
  speech.addEventListener('pointercancel', stopSpeechDrag);
}

function setupSpeechResizeHandle(handle, edge) {
  if (!handle) return;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = speech.getBoundingClientRect();
    speechResize = {
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!speechResize || speechResize.pointerId !== event.pointerId) return;
    const dx = event.clientX - speechResize.startX;
    const dy = event.clientY - speechResize.startY;
    if (speechResize.edge === 'left') {
      const right = speechResize.left + speechResize.width;
      const minLeft = Math.max(8, right - (window.innerWidth - 16));
      const maxLeft = right - 190;
      const nextLeft = clamp(speechResize.left + dx, minLeft, maxLeft);
      resizeSpeechTo(
        right - nextLeft,
        speechResize.height + dy,
        nextLeft
      );
      return;
    }

    resizeSpeechTo(speechResize.width + dx, speechResize.height + dy);
  });

  const stopSpeechResize = (event) => {
    if (!speechResize || speechResize.pointerId !== event.pointerId) return;
    handle.releasePointerCapture(event.pointerId);
    speechResize = null;
  };

  handle.addEventListener('pointerup', stopSpeechResize);
  handle.addEventListener('pointercancel', stopSpeechResize);
}

setupSpeechResizeHandle(speechResizeHandle, 'right');
setupSpeechResizeHandle(speechResizeLeftHandle, 'left');

function setupWindowResizeHandle(handle) {
  if (!handle) return;

  handle.addEventListener('pointerdown', (event) => {
    if (!windowEditMode || event.button !== 0) return;
    windowFrameResize = {
      pointerId: event.pointerId,
      edge: handle.dataset.edge,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!windowFrameResize || windowFrameResize.pointerId !== event.pointerId) return;
    const dx = event.screenX - windowFrameResize.lastScreenX;
    const dy = event.screenY - windowFrameResize.lastScreenY;
    windowFrameResize.lastScreenX = event.screenX;
    windowFrameResize.lastScreenY = event.screenY;
    window.buddy.windowAction({
      type: 'resize-by',
      edge: windowFrameResize.edge,
      dx,
      dy,
      persistCompact: guidePanel.hidden
    });
  });

  const stopWindowResize = (event) => {
    if (!windowFrameResize || windowFrameResize.pointerId !== event.pointerId) return;
    handle.releasePointerCapture(event.pointerId);
    windowFrameResize = null;
  };

  handle.addEventListener('pointerup', stopWindowResize);
  handle.addEventListener('pointercancel', stopWindowResize);
}

windowResizeHandles.forEach(setupWindowResizeHandle);

if (speech) {
  speech.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.speech-resize-handle')) return;
    windowDrag = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY
    };
    speech.setPointerCapture(event.pointerId);
    speech.classList.add('dragging');
    event.preventDefault();
  });

  speech.addEventListener('pointermove', (event) => {
    if (!windowDrag || windowDrag.pointerId !== event.pointerId) return;
    const dx = event.screenX - windowDrag.lastScreenX;
    const dy = event.screenY - windowDrag.lastScreenY;
    windowDrag.lastScreenX = event.screenX;
    windowDrag.lastScreenY = event.screenY;
    window.buddy.windowAction({ type: 'move-by', dx, dy });
  });

  const stopWindowDrag = (event) => {
    if (!windowDrag || windowDrag.pointerId !== event.pointerId) return;
    speech.releasePointerCapture(event.pointerId);
    speech.classList.remove('dragging');
    windowDrag = null;
  };

  speech.addEventListener('pointerup', stopWindowDrag);
  speech.addEventListener('pointercancel', stopWindowDrag);
}

const guideHeader = guidePanel?.querySelector('.guide-header');
if (guideHeader) {
  guideHeader.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = guidePanel.getBoundingClientRect();
    guideDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    guideHeader.setPointerCapture(event.pointerId);
    guideHeader.classList.add('dragging');
    event.preventDefault();
  });

  guideHeader.addEventListener('pointermove', (event) => {
    if (!guideDrag || guideDrag.pointerId !== event.pointerId) return;
    moveGuideTo(
      guideDrag.left + event.clientX - guideDrag.startX,
      guideDrag.top + event.clientY - guideDrag.startY
    );
  });

  const stopGuideDrag = (event) => {
    if (!guideDrag || guideDrag.pointerId !== event.pointerId) return;
    guideHeader.releasePointerCapture(event.pointerId);
    guideHeader.classList.remove('dragging');
    guideDrag = null;
  };

  guideHeader.addEventListener('pointerup', stopGuideDrag);
  guideHeader.addEventListener('pointercancel', stopGuideDrag);
}

const birdDragSurface = birdStage || parrot;

birdDragSurface.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  birdClickCount = 0;
  clearTimeout(birdClickTimer);
  setWindowEditMode(!windowEditMode);
});

birdDragSurface.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const rect = birdStage.getBoundingClientRect();
  birdDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    left: rect.left,
    top: rect.top,
    totalDistance: 0,
    moved: false
  };
  birdDragSurface.setPointerCapture(event.pointerId);
});

birdDragSurface.addEventListener('pointermove', (event) => {
  if (!birdDrag || birdDrag.pointerId !== event.pointerId) return;

  const dx = event.clientX - birdDrag.startX;
  const dy = event.clientY - birdDrag.startY;
  birdDrag.totalDistance += Math.hypot(dx, dy);

  if (birdDrag.totalDistance <= 4) return;
  birdDrag.moved = true;
  moveBirdTo(birdDrag.left + dx, birdDrag.top + dy);
});

function stopBirdDrag(event) {
  if (!birdDrag || birdDrag.pointerId !== event.pointerId) return;
  birdDragSurface.releasePointerCapture(event.pointerId);
  suppressNextParrotClick = birdDrag.moved;
  birdDrag = null;
  if (suppressNextParrotClick) {
    setTimeout(() => {
      suppressNextParrotClick = false;
    }, 80);
  }
}

birdDragSurface.addEventListener('pointerup', stopBirdDrag);
birdDragSurface.addEventListener('pointercancel', stopBirdDrag);
birdDragSurface.addEventListener('dragstart', (event) => event.preventDefault());

birdDragSurface.addEventListener('click', (event) => {
  if (suppressNextParrotClick) {
    suppressNextParrotClick = false;
    return;
  }

  if (event.altKey) {
    birdClickCount = 0;
    clearTimeout(birdClickTimer);
    setWindowEditMode(!windowEditMode);
    return;
  }

  birdClickCount += 1;
  clearTimeout(birdClickTimer);

  if (birdClickCount >= 3) {
    birdClickCount = 0;
    toggleGuide();
    return;
  }

  playPokeAnimation();
  window.buddy.windowAction({
    type: 'poke',
    pointer: {
      x: event.screenX,
      y: event.screenY
    }
  });

  birdClickTimer = setTimeout(() => {
    birdClickCount = 0;
  }, 850);
});

if (closeButton) {
  closeButton.addEventListener('click', () => window.buddy.windowAction('close'));
}

window.buddy.onTasksChanged(render);
window.buddy.onAgentAlert(playAlertAnimation);
window.buddy.getSnapshot().then(render);
