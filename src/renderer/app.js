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
const assistantPanel = document.getElementById('assistantPanel');
const assistantCloseButton = document.getElementById('assistantCloseButton');
const assistantMessages = document.getElementById('assistantMessages');
const assistantReminders = document.getElementById('assistantReminders');
const assistantForm = document.getElementById('assistantForm');
const assistantInput = document.getElementById('assistantInput');
const assistantSendButton = document.getElementById('assistantSendButton');
const speech = document.querySelector('.speech');
const speechHideButton = document.getElementById('speechHideButton');
const speechResizeHandle = document.getElementById('speechResizeHandle');
const speechResizeLeftHandle = document.getElementById('speechResizeLeftHandle');
const birdStage = document.querySelector('.bird-stage');
const birdThinking = document.getElementById('birdThinking');
const birdResizeHandle = document.getElementById('birdResizeHandle');
const windowFrameEditor = document.getElementById('windowFrameEditor');
const windowResizeHandles = document.querySelectorAll('.window-resize-handle');
const layoutStorageKey = 'parrotBuddyLayoutV7';
const enableSpeechFloating = false;
const speechMargin = 8;
const speechMinSize = { width: 96, height: 40 };
const birdDefaultSize = { width: 92, height: 96 };
const birdMinWidth = 54;
const birdMaxWidth = 220;
const birdAspectHeight = birdDefaultSize.height / birdDefaultSize.width;
const windowFitMargin = 6;
const assistantLongPressMs = 620;
const assistantDragThreshold = 6;
const assistantThinkingDelayMs = 280;
const birdThoughtDurationMs = 4000;
let windowFitTimer = null;
let fittingWindow = false;
let windowEditMode = false;
let windowFrameResize = null;
let speechHiddenBeforeAssistant = null;
let assistantThinkingTimer = null;
let birdThoughtTimer = null;
let birdBubbleMode = null;

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
  const agents = snapshot.tasks.filter((task) => task.source === 'agent' || task.source === 'assistant');
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

  if (task.source === 'assistant') {
    if (/^Parrot reminder:/i.test(label)) {
      return label.replace(/^Parrot reminder:\s*/i, '조이 · ');
    }
    return '조이';
  }

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
    .filter((task) => task.source === 'agent' || task.source === 'assistant')
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
  const agents = snapshot.tasks.filter((task) => task.source === 'agent' || task.source === 'assistant');
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
  const agentTasks = snapshot.tasks.filter((task) => task.source === 'agent' || task.source === 'assistant');
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

function appendAssistantMessage(role, text, meta = '') {
  if (!assistantMessages) return null;
  const message = document.createElement('div');
  message.className = `assistant-message ${role}`;
  message.textContent = text;
  if (meta) {
    const metaNode = document.createElement('small');
    metaNode.className = 'assistant-meta';
    metaNode.textContent = meta;
    message.append(metaNode);
  }
  assistantMessages.append(message);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
  return message;
}

function renderBirdBubble(text, mode) {
  if (!birdStage || !birdThinking) return;
  birdThinking.replaceChildren(document.createTextNode(text));
  if (mode === 'thinking') {
    birdThinking.append(document.createElement('span'));
  }
  birdBubbleMode = mode;
  birdStage.classList.toggle('thinking', mode === 'thinking');
  birdStage.classList.toggle('thoughtful', mode === 'thought');
  birdThinking.setAttribute('aria-hidden', 'false');
  scheduleWindowFit({ persistCompact: false });
}

function hideBirdBubble(mode = null) {
  if (!birdStage || !birdThinking) return;
  if (mode && birdBubbleMode !== mode) return;
  birdBubbleMode = null;
  birdStage.classList.remove('thinking', 'thoughtful');
  birdThinking.setAttribute('aria-hidden', 'true');
  scheduleWindowFit({ persistCompact: false });
}

function setAssistantThinking(visible) {
  if (!birdStage || !birdThinking) return;
  if (visible) {
    clearTimeout(birdThoughtTimer);
    birdThoughtTimer = null;
    renderBirdBubble('생각 중', 'thinking');
    return;
  }
  hideBirdBubble('thinking');
}

function clearAssistantThinking() {
  clearTimeout(assistantThinkingTimer);
  assistantThinkingTimer = null;
  setAssistantThinking(false);
}

function showBirdThought(text) {
  const thought = String(text || '').trim();
  if (!thought || birdBubbleMode === 'thinking') return;
  clearTimeout(birdThoughtTimer);
  renderBirdBubble(thought, 'thought');
  birdThoughtTimer = setTimeout(() => {
    birdThoughtTimer = null;
    hideBirdBubble('thought');
  }, birdThoughtDurationMs);
}

async function showRandomBirdThought() {
  if (!window.buddy.assistantThought) return;
  try {
    const result = await window.buddy.assistantThought();
    if (result?.ok) showBirdThought(result.thought);
  } catch {
    // A click thought is decorative; keep the bird quiet if local context is unavailable.
  }
}

function formatReminderTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function renderAssistantReminders(snapshot) {
  if (!assistantReminders) return;
  const reminders = [
    ...(snapshot?.due || []),
    ...(snapshot?.upcoming || [])
  ].slice(0, 6);

  assistantReminders.replaceChildren();
  assistantReminders.hidden = reminders.length === 0;
  for (const reminder of reminders) {
    const row = document.createElement('div');
    row.className = 'assistant-reminder';
    const label = document.createElement('span');
    label.textContent = `${formatReminderTime(reminder.snoozedUntil || reminder.dueAt)} · ${reminder.title}`;
    label.title = label.textContent;
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'done';
    done.addEventListener('click', async () => {
      await window.buddy.assistantReminderDone(reminder.id);
      loadAssistantSnapshot();
    });
    row.append(label, done);
    assistantReminders.append(row);
  }
}

async function loadAssistantSnapshot() {
  if (!window.buddy.assistantSnapshot) return;
  const snapshot = await window.buddy.assistantSnapshot();
  renderAssistantReminders(snapshot);
}

function openAssistantChat() {
  if (!assistantPanel) return;
  if (guidePanel && !guidePanel.hidden) closeGuide();
  if (speech && speechHiddenBeforeAssistant === null) {
    speechHiddenBeforeAssistant = speech.hidden;
    if (!speech.hidden) setSpeechVisible(false, false);
  }
  assistantPanel.hidden = false;
  loadAssistantSnapshot();
  requestAnimationFrame(() => {
    assistantInput?.focus();
    fitWindowToContent({ persistCompact: false });
  });
}

function closeAssistantChat() {
  if (!assistantPanel) return;
  assistantPanel.hidden = true;
  if (speech && speechHiddenBeforeAssistant === false) {
    setSpeechVisible(true, false);
  }
  speechHiddenBeforeAssistant = null;
  scheduleWindowFit({ persistCompact: false });
}

async function sendAssistantMessage() {
  const message = assistantInput?.value.trim();
  if (!message) return;
  assistantInput.value = '';
  appendAssistantMessage('user', message);
  let pending = null;
  clearAssistantThinking();
  assistantThinkingTimer = setTimeout(() => {
    setAssistantThinking(true);
    pending = appendAssistantMessage('assistant', '조이가 생각 중입니다...');
    scheduleWindowFit({ persistCompact: false });
  }, assistantThinkingDelayMs);
  if (assistantSendButton) assistantSendButton.disabled = true;
  scheduleWindowFit({ persistCompact: false });

  try {
    const result = await window.buddy.assistantMessage({ message });
    clearAssistantThinking();
    pending?.remove();
    if (result.ok) {
      const files = Array.isArray(result.changedFiles) && result.changedFiles.length > 0
        ? `저장: ${result.changedFiles.slice(0, 4).join(', ')}`
        : '';
      appendAssistantMessage('assistant', result.reply || '정리했습니다.', files);
      renderAssistantReminders(result.snapshot);
      return;
    }

    appendAssistantMessage('error', result.error || '처리하지 못했습니다.');
  } catch (error) {
    clearAssistantThinking();
    pending?.remove();
    appendAssistantMessage('error', error.message || '처리하지 못했습니다.');
  } finally {
    clearAssistantThinking();
    if (assistantSendButton) assistantSendButton.disabled = false;
    scheduleWindowFit({ persistCompact: false });
  }
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

if (assistantCloseButton) {
  assistantCloseButton.addEventListener('click', closeAssistantChat);
}

if (assistantForm) {
  assistantForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendAssistantMessage();
  });
}

if (assistantInput) {
  assistantInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendAssistantMessage();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (windowEditMode) {
    setWindowEditMode(false);
    return;
  }
  if (assistantPanel && !assistantPanel.hidden) {
    closeAssistantChat();
    return;
  }
  if (!guidePanel.hidden) closeGuide();
});

let birdClickCount = 0;
let birdClickTimer = null;
let pokeAnimationTimer = null;
let alertAnimationTimer = null;
let alertAnimationRunning = false;
let queuedAlertAnimations = 0;
let suppressNextParrotClick = false;
let birdDrag = null;
let birdResize = null;
let assistantLongPressTimer = null;
let assistantLongPressFired = false;
let guideDrag = null;
let assistantDrag = null;
let speechDrag = null;
let speechResize = null;

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
  if (alertAnimationRunning) {
    queuedAlertAnimations += 1;
    return;
  }

  alertAnimationRunning = true;
  parrot.classList.remove('alerting');
  void parrot.offsetWidth;
  parrot.classList.add('alerting');
  clearTimeout(alertAnimationTimer);
  alertAnimationTimer = setTimeout(() => {
    parrot.classList.remove('alerting');
    alertAnimationRunning = false;
    if (queuedAlertAnimations > 0) {
      queuedAlertAnimations -= 1;
      alertAnimationTimer = setTimeout(playAlertAnimation, 160);
    }
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

function moveSpeechTo(left, top, { allowOverflow = false } = {}) {
  if (allowOverflow) {
    speech.style.left = `${Math.round(left)}px`;
    speech.style.top = `${Math.round(top)}px`;
    speech.style.right = 'auto';
    speech.style.bottom = 'auto';
    speech.style.transform = 'none';
  } else {
    moveFloatingElementTo(speech, left, top, { margin: 0 });
  }

  writeLayout({
    speech: {
      ...readLayout().speech,
      left: parseFloat(speech.style.left),
      top: parseFloat(speech.style.top)
    }
  });
}

function moveAssistantTo(left, top, { allowOverflow = false } = {}) {
  if (!assistantPanel) return;

  if (allowOverflow) {
    assistantPanel.style.left = `${Math.round(left)}px`;
    assistantPanel.style.top = `${Math.round(top)}px`;
    assistantPanel.style.right = 'auto';
    assistantPanel.style.bottom = 'auto';
    assistantPanel.style.transform = 'none';
  } else {
    moveFloatingElementTo(assistantPanel, left, top, { margin: 8 });
  }

  writeLayout({
    assistant: {
      left: parseFloat(assistantPanel.style.left),
      top: parseFloat(assistantPanel.style.top)
    }
  });
}

function setBirdSize(width, { persist = true } = {}) {
  if (!birdStage) return { width: birdDefaultSize.width, height: birdDefaultSize.height };

  const nextWidth = Math.round(clamp(Number(width) || birdDefaultSize.width, birdMinWidth, birdMaxWidth));
  const nextHeight = Math.round(nextWidth * birdAspectHeight);
  birdStage.style.setProperty('--bird-width', `${nextWidth}px`);
  birdStage.style.setProperty('--bird-height', `${nextHeight}px`);

  if (persist) {
    writeLayout({
      bird: {
        ...readLayout().bird,
        width: nextWidth,
        height: nextHeight
      }
    });
  }

  return { width: nextWidth, height: nextHeight };
}

function currentBirdWidth() {
  const rect = parrot.getBoundingClientRect();
  return Number.isFinite(rect.width) && rect.width > 0 ? rect.width : birdDefaultSize.width;
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
      ...readLayout().bird,
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
        left: rect.left - 4,
        top: rect.top - 4,
        right: rect.right + 4,
        bottom: rect.bottom + 4
      }
    });
  }

  if (birdThinking && birdBubbleMode) {
    rects.push({ key: 'birdBubble', rect: birdThinking.getBoundingClientRect() });
  }

  if (guidePanel && !guidePanel.hidden) {
    rects.push({ key: 'guide', rect: guidePanel.getBoundingClientRect() });
  }

  if (assistantPanel && !assistantPanel.hidden) {
    rects.push({ key: 'assistant', rect: assistantPanel.getBoundingClientRect() });
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

  const assistantRect = rectForKey(rects, 'assistant');
  if (assistantRect && assistantPanel && !assistantPanel.hidden) {
    moveAssistantTo(assistantRect.left - dx, assistantRect.top - dy, { allowOverflow: false });
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
      minWidth: (guidePanel && !guidePanel.hidden) || (assistantPanel && !assistantPanel.hidden) ? 360 : 92,
      minHeight: (guidePanel && !guidePanel.hidden) || (assistantPanel && !assistantPanel.hidden) ? 300 : 88,
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
    speechDrag = null;
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
    if (Number.isFinite(layout.bird.width)) {
      setBirdSize(layout.bird.width, { persist: false });
    }
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

  if (layout.assistant && assistantPanel) {
    if (Number.isFinite(layout.assistant.left)) assistantPanel.style.left = `${layout.assistant.left}px`;
    if (Number.isFinite(layout.assistant.top)) assistantPanel.style.top = `${layout.assistant.top}px`;
    if (Number.isFinite(layout.assistant.left) || Number.isFinite(layout.assistant.top)) {
      assistantPanel.style.right = 'auto';
      assistantPanel.style.bottom = 'auto';
      assistantPanel.style.transform = 'none';
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

  if (assistantPanel && !assistantPanel.hidden) {
    const rect = assistantPanel.getBoundingClientRect();
    moveAssistantTo(rect.left, rect.top);
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

if (birdResizeHandle) {
  birdResizeHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    birdResize = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startWidth: currentBirdWidth()
    };
    birdResizeHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  birdResizeHandle.addEventListener('pointermove', (event) => {
    if (!birdResize || birdResize.pointerId !== event.pointerId) return;
    const dx = event.screenX - birdResize.startScreenX;
    const dy = event.screenY - birdResize.startScreenY;
    const nextWidth = birdResize.startWidth + (dx + dy / birdAspectHeight) / 2;
    setBirdSize(nextWidth);
    const rect = parrot.getBoundingClientRect();
    moveBirdTo(rect.left, rect.top, { clampToWindow: false });
    scheduleWindowFit();
  });

  const stopBirdResize = (event) => {
    if (!birdResize || birdResize.pointerId !== event.pointerId) return;
    birdResizeHandle.releasePointerCapture(event.pointerId);
    birdResize = null;
    scheduleWindowFit();
  };

  birdResizeHandle.addEventListener('pointerup', stopBirdResize);
  birdResizeHandle.addEventListener('pointercancel', stopBirdResize);
  birdResizeHandle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

if (speech) {
  speech.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.speech-resize-handle, .speech-hide-button')) return;
    speechDrag = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY
    };
    speech.setPointerCapture(event.pointerId);
    speech.classList.add('dragging');
    event.preventDefault();
  });

  speech.addEventListener('pointermove', (event) => {
    if (!speechDrag || speechDrag.pointerId !== event.pointerId) return;
    const dx = event.screenX - speechDrag.lastScreenX;
    const dy = event.screenY - speechDrag.lastScreenY;
    speechDrag.lastScreenX = event.screenX;
    speechDrag.lastScreenY = event.screenY;
    const rect = speech.getBoundingClientRect();
    moveSpeechTo(rect.left + dx, rect.top + dy, { allowOverflow: true });
    scheduleWindowFit();
  });

  const stopWindowDrag = (event) => {
    if (!speechDrag || speechDrag.pointerId !== event.pointerId) return;
    speech.releasePointerCapture(event.pointerId);
    speech.classList.remove('dragging');
    speechDrag = null;
    scheduleWindowFit();
  };

  speech.addEventListener('pointerup', stopWindowDrag);
  speech.addEventListener('pointercancel', stopWindowDrag);
}

if (assistantPanel) {
  assistantPanel.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('button, textarea, input, a, .assistant-messages, .assistant-reminders')) return;
    assistantDrag = {
      pointerId: event.pointerId,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY
    };
    assistantPanel.setPointerCapture(event.pointerId);
    assistantPanel.classList.add('dragging');
    event.preventDefault();
  });

  assistantPanel.addEventListener('pointermove', (event) => {
    if (!assistantDrag || assistantDrag.pointerId !== event.pointerId) return;
    const dx = event.screenX - assistantDrag.lastScreenX;
    const dy = event.screenY - assistantDrag.lastScreenY;
    assistantDrag.lastScreenX = event.screenX;
    assistantDrag.lastScreenY = event.screenY;
    const rect = assistantPanel.getBoundingClientRect();
    moveAssistantTo(rect.left + dx, rect.top + dy, { allowOverflow: true });
    scheduleWindowFit({ persistCompact: false });
  });

  const stopAssistantDrag = (event) => {
    if (!assistantDrag || assistantDrag.pointerId !== event.pointerId) return;
    assistantPanel.releasePointerCapture(event.pointerId);
    assistantPanel.classList.remove('dragging');
    assistantDrag = null;
    scheduleWindowFit({ persistCompact: false });
  };

  assistantPanel.addEventListener('pointerup', stopAssistantDrag);
  assistantPanel.addEventListener('pointercancel', stopAssistantDrag);
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

function clearAssistantLongPress() {
  if (!assistantLongPressTimer) return;
  clearTimeout(assistantLongPressTimer);
  assistantLongPressTimer = null;
}

birdDragSurface.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  birdClickCount = 0;
  clearTimeout(birdClickTimer);
  clearAssistantLongPress();
  setWindowEditMode(!windowEditMode);
});

birdDragSurface.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  assistantLongPressFired = false;
  birdDrag = {
    pointerId: event.pointerId,
    lastScreenX: event.screenX,
    lastScreenY: event.screenY,
    totalDistance: 0,
    moved: false
  };
  birdDragSurface.setPointerCapture(event.pointerId);

  if (!event.altKey) {
    assistantLongPressTimer = setTimeout(() => {
      if (!birdDrag || birdDrag.pointerId !== event.pointerId || birdDrag.moved) return;
      assistantLongPressFired = true;
      suppressNextParrotClick = true;
      openAssistantChat();
    }, assistantLongPressMs);
  }
});

birdDragSurface.addEventListener('pointermove', (event) => {
  if (!birdDrag || birdDrag.pointerId !== event.pointerId) return;

  const moveX = event.screenX - birdDrag.lastScreenX;
  const moveY = event.screenY - birdDrag.lastScreenY;
  birdDrag.lastScreenX = event.screenX;
  birdDrag.lastScreenY = event.screenY;
  birdDrag.totalDistance += Math.hypot(moveX, moveY);

  if (birdDrag.totalDistance > assistantDragThreshold) clearAssistantLongPress();
  if (assistantLongPressFired) return;
  if (birdDrag.totalDistance <= 4) return;
  birdDrag.moved = true;
  window.buddy.windowAction({ type: 'move-by', dx: moveX, dy: moveY });
});

function stopBirdDrag(event) {
  if (!birdDrag || birdDrag.pointerId !== event.pointerId) return;
  birdDragSurface.releasePointerCapture(event.pointerId);
  clearAssistantLongPress();
  suppressNextParrotClick = birdDrag.moved || assistantLongPressFired;
  birdDrag = null;
  if (suppressNextParrotClick) {
    setTimeout(() => {
      suppressNextParrotClick = false;
      assistantLongPressFired = false;
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
    showRandomBirdThought();
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
  showRandomBirdThought();
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
loadAssistantSnapshot();
