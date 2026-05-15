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
const speechHideButton = document.getElementById('speechHideButton');
const speechResizeHandle = document.getElementById('speechResizeHandle');
const speechResizeLeftHandle = document.getElementById('speechResizeLeftHandle');
const birdStage = document.querySelector('.bird-stage');
const windowFrameEditor = document.getElementById('windowFrameEditor');
const windowResizeHandles = document.querySelectorAll('.window-resize-handle');
const layoutStorageKey = 'parrotBuddyLayoutV6';
const enableSpeechFloating = false;
const speechMargin = 8;
const speechMinSize = { width: 96, height: 40 };
const windowFitMargin = 10;
let windowFitTimer = null;
let fittingWindow = false;
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

function openGuide() {
  if (!guidePanel.hidden) return;
  guidePanel.hidden = false;
  requestAnimationFrame(clampFloatingLayout);
  window.buddy.windowAction({ type: 'guide-mode', open: true });
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
  guideButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openGuide();
  });
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

function moveFloatingElementTo(element, left, top, { margin = 8 } = {}) {
  const rect = element.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - margin;
  const maxTop = window.innerHeight - rect.height - margin;
  element.style.left = `${Math.round(clamp(left, margin, Math.max(margin, maxLeft)))}px`;
  element.style.top = `${Math.round(clamp(top, margin, Math.max(margin, maxTop)))}px`;
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
  moveFloatingElementTo(speech, left, top, { margin: 0 });
  writeLayout({
    speech: {
      ...readLayout().speech,
      left: parseFloat(speech.style.left),
      top: parseFloat(speech.style.top)
    }
  });
}

function moveBirdTo(left, top, { clampToWindow = true } = {}) {
  const stageRect = birdStage.getBoundingClientRect();
  const birdRect = parrot.getBoundingClientRect();
  const offsetX = birdRect.left - stageRect.left;
  const offsetY = birdRect.top - stageRect.top;
  const nextBirdLeft = Math.round(clampToWindow
    ? clamp(left, 0, Math.max(0, window.innerWidth - birdRect.width))
    : left);
  const nextBirdTop = Math.round(clampToWindow
    ? clamp(top, 0, Math.max(0, window.innerHeight - birdRect.height))
    : top);

  birdStage.style.left = `${nextBirdLeft - offsetX}px`;
  birdStage.style.top = `${nextBirdTop - offsetY}px`;
  birdStage.style.right = 'auto';
  birdStage.style.bottom = 'auto';
  birdStage.style.transform = 'none';

  writeLayout({
    bird: {
      left: parseFloat(birdStage.style.left),
      top: parseFloat(birdStage.style.top)
    }
  });
}

function captureContentRects() {
  const rects = [];

  if (speech && !speech.hidden) {
    rects.push({ key: 'speech', rect: speech.getBoundingClientRect() });
  }

  if (parrot) {
    const rect = parrot.getBoundingClientRect();
    rects.push({
      key: 'bird',
      rect,
      fitRect: {
        left: rect.left - 8,
        top: rect.top - 8,
        right: rect.right + 8,
        bottom: rect.bottom + 8
      }
    });
  }

  if (guidePanel && !guidePanel.hidden) {
    rects.push({ key: 'guide', rect: guidePanel.getBoundingClientRect() });
  }

  return rects.filter(({ rect }) => rect.width > 0 && rect.height > 0);
}

function contentBoundsFrom(rects) {
  if (rects.length === 0) return null;
  return rects.reduce((bounds, item) => {
    const rect = item.fitRect || item.rect;
    return {
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom)
    };
  }, {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity
  });
}

function rectForKey(rects, key) {
  return rects.find((item) => item.key === key)?.rect;
}

function shiftContentAfterWindowFit(rects, dx, dy) {
  if (!dx && !dy) return;

  const speechRect = rectForKey(rects, 'speech');
  if (speechRect && speech && !speech.hidden) {
    moveSpeechTo(speechRect.left - dx, speechRect.top - dy);
  }

  const guideRect = rectForKey(rects, 'guide');
  if (guideRect && guidePanel && !guidePanel.hidden) {
    moveGuideTo(guideRect.left - dx, guideRect.top - dy);
  }

  const birdRect = rectForKey(rects, 'bird');
  if (birdRect && birdStage) {
    moveBirdTo(birdRect.left - dx, birdRect.top - dy, { clampToWindow: false });
  }
}

async function fitWindowToContent({ persistCompact = true } = {}) {
  if (fittingWindow) return;

  const rects = captureContentRects();
  const bounds = contentBoundsFrom(rects);
  if (!bounds) return;

  fittingWindow = true;
  try {
    const result = await window.buddy.windowAction({
      type: 'fit-to-content',
      ...bounds,
      margin: windowFitMargin,
      minWidth: guidePanel && !guidePanel.hidden ? 360 : 128,
      minHeight: guidePanel && !guidePanel.hidden ? 300 : 112,
      persistCompact
    });

    if (result?.ok) {
      shiftContentAfterWindowFit(rects, result.dx || 0, result.dy || 0);
    }
  } finally {
    fittingWindow = false;
  }
}

function scheduleWindowFit(options) {
  clearTimeout(windowFitTimer);
  windowFitTimer = setTimeout(() => {
    fitWindowToContent(options);
  }, 50);
}

function setSpeechVisible(visible, persist = true) {
  if (!speech) return;
  speech.hidden = !visible;
  if (!visible) {
    speech.classList.remove('dragging');
    windowDrag = null;
    speechResize = null;
  }
  if (!persist) return;
  writeLayout({
    speech: {
      ...readLayout().speech,
      hidden: !visible
    }
  });
  scheduleWindowFit();
}

function speechMinWidth() {
  return Math.min(speechMinSize.width, Math.max(64, window.innerWidth - speechMargin * 2));
}

function speechMinHeight() {
  return Math.min(speechMinSize.height, Math.max(32, window.innerHeight - speechMargin * 2));
}

function resizeSpeechTo(width, height, left = null, { allowOverflow = false } = {}) {
  const rect = speech.getBoundingClientRect();
  const minWidth = speechMinWidth();
  const minHeight = speechMinHeight();
  const nextLeft = Number.isFinite(left)
    ? Math.round(allowOverflow
      ? clamp(left, -720, window.innerWidth - minWidth)
      : clamp(left, speechMargin, Math.max(speechMargin, window.innerWidth - minWidth - speechMargin)))
    : rect.left;
  const maxWidth = allowOverflow ? 720 : Math.max(minWidth, window.innerWidth - nextLeft - speechMargin);
  const maxHeight = allowOverflow ? 420 : Math.max(minHeight, window.innerHeight - rect.top - speechMargin);
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

function fitSpeechToViewport() {
  if (!speech || speech.hidden) return;
  const rect = speech.getBoundingClientRect();
  resizeSpeechTo(rect.width, rect.height, rect.left);
}

function restoreFloatingLayout() {
  const layout = readLayout();

  if (layout.speech && speech) {
    if (Number.isFinite(layout.speech.left)) speech.style.left = `${layout.speech.left}px`;
    if (Number.isFinite(layout.speech.width)) speech.style.width = `${layout.speech.width}px`;
    if (Number.isFinite(layout.speech.height)) speech.style.height = `${layout.speech.height}px`;
    if (typeof layout.speech.hidden === 'boolean') setSpeechVisible(!layout.speech.hidden, false);
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
      birdStage.style.left = `${layout.bird.left}px`;
      birdStage.style.top = `${layout.bird.top}px`;
      birdStage.style.right = 'auto';
      birdStage.style.bottom = 'auto';
      birdStage.style.transform = 'none';
      const rect = parrot.getBoundingClientRect();
      moveBirdTo(rect.left, rect.top);
    }
  }
}

function clampFloatingLayout() {
  if (enableSpeechFloating && speech) {
    const rect = speech.getBoundingClientRect();
    moveSpeechTo(rect.left, rect.top);
  }

  fitSpeechToViewport();

  if (guidePanel && !guidePanel.hidden) {
    const rect = guidePanel.getBoundingClientRect();
    moveGuideTo(rect.left, rect.top);
  }

  if (birdStage) {
    const rect = parrot.getBoundingClientRect();
    moveBirdTo(rect.left, rect.top);
  }
}

restoreFloatingLayout();
window.addEventListener('resize', () => {
  if (fittingWindow) return;
  requestAnimationFrame(clampFloatingLayout);
});

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
      const nextLeft = speechResize.left + dx;
      resizeSpeechTo(
        right - nextLeft,
        speechResize.height + dy,
        nextLeft,
        { allowOverflow: true }
      );
      scheduleWindowFit();
      return;
    }

    resizeSpeechTo(speechResize.width + dx, speechResize.height + dy, null, { allowOverflow: true });
    scheduleWindowFit();
  });

  const stopSpeechResize = (event) => {
    if (!speechResize || speechResize.pointerId !== event.pointerId) return;
    handle.releasePointerCapture(event.pointerId);
    speechResize = null;
    scheduleWindowFit();
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
    if (event.button !== 0 || event.target.closest('.speech-resize-handle, .speech-hide-button')) return;
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

if (speechHideButton) {
  speechHideButton.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  speechHideButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSpeechVisible(false);
  });
}

const guideHeader = guidePanel?.querySelector('.guide-header');
if (guideHeader) {
  guideHeader.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    guideDrag = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY
    };
    guideHeader.setPointerCapture(event.pointerId);
    guideHeader.classList.add('dragging');
    event.preventDefault();
  });

  guideHeader.addEventListener('pointermove', (event) => {
    if (!guideDrag || guideDrag.pointerId !== event.pointerId) return;
    const dx = event.screenX - guideDrag.lastScreenX;
    const dy = event.screenY - guideDrag.lastScreenY;
    guideDrag.lastScreenX = event.screenX;
    guideDrag.lastScreenY = event.screenY;
    window.buddy.windowAction({ type: 'move-by', dx, dy });
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

const birdDragSurface = parrot || birdStage;

birdDragSurface.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  birdClickCount = 0;
  clearTimeout(birdClickTimer);
  setWindowEditMode(!windowEditMode);
});

birdDragSurface.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const rect = parrot.getBoundingClientRect();
  birdDrag = {
    pointerId: event.pointerId,
    mode: event.metaKey ? 'window' : 'bird',
    startX: event.clientX,
    startY: event.clientY,
    lastScreenX: event.screenX,
    lastScreenY: event.screenY,
    left: rect.left,
    top: rect.top,
    totalDistance: 0,
    moved: false
  };
  birdDragSurface.setPointerCapture(event.pointerId);
});

birdDragSurface.addEventListener('pointermove', (event) => {
  if (!birdDrag || birdDrag.pointerId !== event.pointerId) return;

  const moveX = event.screenX - birdDrag.lastScreenX;
  const moveY = event.screenY - birdDrag.lastScreenY;
  birdDrag.lastScreenX = event.screenX;
  birdDrag.lastScreenY = event.screenY;
  birdDrag.totalDistance += Math.hypot(moveX, moveY);

  if (birdDrag.totalDistance <= 4) return;
  birdDrag.moved = true;
  if (birdDrag.mode === 'window') {
    window.buddy.windowAction({ type: 'move-by', dx: moveX, dy: moveY });
    return;
  }

  const rect = parrot.getBoundingClientRect();
  moveBirdTo(rect.left + moveX, rect.top + moveY, { clampToWindow: false });
  scheduleWindowFit();
});

function stopBirdDrag(event) {
  if (!birdDrag || birdDrag.pointerId !== event.pointerId) return;
  const movedBirdOnly = birdDrag.moved && birdDrag.mode === 'bird';
  birdDragSurface.releasePointerCapture(event.pointerId);
  suppressNextParrotClick = birdDrag.moved;
  birdDrag = null;
  if (movedBirdOnly) scheduleWindowFit();
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

  if (speech?.hidden) {
    birdClickCount = 0;
    clearTimeout(birdClickTimer);
    setSpeechVisible(true);
    playPokeAnimation();
    window.buddy.windowAction({
      type: 'poke',
      pointer: {
        x: event.screenX,
        y: event.screenY
      }
    });
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

setWindowEditMode(true);

window.buddy.onTasksChanged(render);
window.buddy.onAgentAlert(playAlertAnimation);
window.buddy.getSnapshot().then(render);
