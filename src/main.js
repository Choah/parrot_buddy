const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { TaskStore } = require('./task-store');
const { createApiServer, DEFAULT_PORT } = require('./api-server');
const { playAttentionSound, playCompletionSound } = require('./sound');
const { AgentMonitor } = require('./agent-monitor');
const { AssistantOrchestrator } = require('./assistant/assistant-orchestrator');
const { STATUS_SOURCES } = require('./task-store');
const { SettingsStore } = require('./settings-store');
const { clampWindowBounds, clampWindowPosition, virtualWorkAreaBounds } = require('./window-bounds');

const store = new TaskStore();
const settingsStore = new SettingsStore();
const runningProcesses = new Map();
let mainWindow = null;
let apiServer = null;
let tray = null;
let trayIdleImage = null;
let trayActiveImages = [];
let trayAnimationTimer = null;
let trayAnimationIndex = 0;
let trayAnimationActive = false;
let agentMonitor = null;
let assistantOrchestrator = null;
let reminderTimer = null;
let thoughtTimer = null;
let memoryMaintenanceTimer = null;
let memoryMaintenanceInitialTimer = null;
let memoryMaintenanceRunning = false;
let wanderTimer = null;
let pokeTimer = null;
let wanderVelocity = { x: 0.45, y: 0.28 };
const assetPath = (...parts) => path.join(__dirname, '..', 'assets', ...parts);
const COMPACT_WINDOW_BOUNDS = { x: 343, y: 333, width: 386, height: 118 };
const COMPACT_WINDOW_SIZE = {
  width: COMPACT_WINDOW_BOUNDS.width,
  height: COMPACT_WINDOW_BOUNDS.height
};
const EXPANDED_PANEL_WINDOW_SIZE = { width: 430, height: 520 };
const ASSISTANT_PANEL_WINDOW_SIZE = { width: 430, height: 500 };
const MIN_WINDOW_SIZE = { width: 92, height: 88 };
const MAX_TRAY_STATUS_ITEMS = 6;
const MEMORY_MAINTENANCE_START_DELAY_MS = 2 * 60 * 1000;
const MEMORY_MAINTENANCE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let compactWindowSize = { ...COMPACT_WINDOW_SIZE };
let expandedPanelWindowOpen = false;

if (process.platform === 'darwin') {
  app.dock.hide();
}

function broadcastSnapshot(snapshot = store.snapshot()) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('tasks:changed', snapshot);
}

function broadcastAgentAlert(kind, task) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('agent:alert', {
    kind,
    id: task?.id,
    label: task?.label,
    command: task?.command,
    source: task?.source,
    status: task?.status
  });
}

function broadcastSettingsSnapshot(snapshot = settingsStore.snapshot()) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('settings:changed', snapshot);
}

function notifyAgentFinished(task) {
  if (task?.silent) return;
  playCompletionSound(task?.status === 'stopped' ? 'stopped' : task?.status || 'success');
  broadcastAgentAlert('finished', task);
}

function clearAgentTasks() {
  for (const task of Array.from(store.tasks.values())) {
    if (task.source === 'agent') store.removeTask(task.id);
  }
}

function createAgentMonitor() {
  return new AgentMonitor({
    store,
    ...settingsStore.monitorOptions(),
    onAgentAttention(task) {
      notifyAgentAttention(task);
    },
    onAgentFinished(task) {
      notifyAgentFinished(task);
    }
  });
}

function restartAgentMonitor() {
  agentMonitor?.stop();
  clearAgentTasks();
  agentMonitor = createAgentMonitor();
  agentMonitor.start();
  broadcastSnapshot();
  updateTrayMenu();
}

function notifyAgentAttention(task) {
  playAttentionSound(task?.status || 'hitl');
  broadcastAgentAlert('attention', task);
}

function shouldNotifyAssistantFinished(result = {}) {
  if (!result.ok || result.needsConfirmation) return false;
  const changedFiles = Array.isArray(result.changedFiles) ? result.changedFiles : [];
  const hasPersistentChange = changedFiles.some((file) => !String(file).startsWith('sessions/'));
  const hasReminderChange = (result.reminders || []).length > 0 || (result.updatedReminders || []).length > 0;
  return hasPersistentChange || hasReminderChange;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    x: COMPACT_WINDOW_BOUNDS.x,
    y: COMPACT_WINDOW_BOUNDS.y,
    width: compactWindowSize.width,
    height: compactWindowSize.height,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'Parrot Buddy',
    icon: assetPath('app-icon.png'),
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopWander();
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();
  stopWander();
}

function openAgentSettings() {
  showWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const sendOpen = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('settings:open', settingsStore.snapshot());
  };

  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', sendOpen);
    return;
  }

  sendOpen();
}

function truncateLabel(value, maxLength = 48) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function agentStatusWord(status) {
  if (status === 'hitl') return 'confirm';
  if (status === 'running') return 'working';
  if (status === 'waiting' || status === 'success') return 'ready';
  if (status === 'failed') return 'check';
  return 'stopped';
}

function agentName(task) {
  const label = String(task?.label || '');
  const command = String(task?.command || '');

  if (task?.source === 'assistant') {
    if (/^Parrot reminder:/i.test(label)) {
      return label.replace(/^Parrot reminder:\s*/i, '조이 · ');
    }
    return '조이';
  }

  const codexTurn = label.match(/^Codex:\s*([^#]+?)(?:\s*#(.+))?$/);
  if (codexTurn) {
    return `Codex · ${codexTurn[1].trim()}`;
  }

  const codexTerminal = label.match(/^Codex Terminal:\s*(.+)$/);
  if (codexTerminal) {
    return `Codex terminal · ${codexTerminal[1].trim()}`;
  }

  const claude = label.match(/^Claude:\s*(.+)$/);
  if (claude) return `Claude Code · ${claude[1].trim()}`;

  if (label === 'Codex VS Code') return 'Codex VS Code';
  if (label === 'Claude Code') return 'Claude Code';

  const homePath = command.match(/(?:^|~\/|\/)([^/·\s]+)\s*·/);
  return homePath ? homePath[1] : label || 'Agent';
}

function visibleTrayTasks(snapshot = store.snapshot()) {
  return snapshot.tasks
    .filter((task) => STATUS_SOURCES.has(task.source))
    .filter((task) => task.status !== 'success' && task.status !== 'stopped');
}

function traySummaryLabel(snapshot = store.snapshot()) {
  const summary = snapshot.summary || {};
  const enabled = enabledAgentNames();
  if (enabled.length === 0) return 'Status: agent monitoring off';
  const hitlCount = (summary.agentHitlCount || 0) + (summary.assistantHitlCount || 0);
  const runningCount = (summary.agentRunningCount || 0) + (summary.assistantRunningCount || 0);
  if (hitlCount > 0) return `Status: confirm needed (${hitlCount})`;
  if (runningCount > 0) return `Status: working (${runningCount})`;
  if (summary.statusReadyCount > 0) return `Status: ready (${summary.statusReadyCount})`;
  return 'Status: no active agents';
}

function enabledAgentNames() {
  const settings = settingsStore.read();
  const names = [];
  if (settings.agents.codex.enabled) names.push('Codex');
  if (settings.agents.claude.enabled) names.push('Claude Code');
  return names;
}

function buildTrayMenu(snapshot = store.snapshot()) {
  const statusItems = visibleTrayTasks(snapshot)
    .slice(0, MAX_TRAY_STATUS_ITEMS)
    .map((task) => ({
      label: truncateLabel(`${agentStatusWord(task.status)} · ${agentName(task)}`),
      enabled: false
    }));

  if (statusItems.length === 0) {
    const enabled = enabledAgentNames();
    statusItems.push({
      label: enabled.length > 0 ? `${enabled.join(' / ')} waiting` : 'No agent monitoring enabled',
      enabled: false
    });
  }

  const hiddenCount = visibleTrayTasks(snapshot).length - statusItems.length;
  if (hiddenCount > 0) {
    statusItems.push({ label: `${hiddenCount} more…`, enabled: false });
  }

  return Menu.buildFromTemplate([
    { label: 'Parrot Buddy', enabled: false },
    { label: 'Show Floating Bird', click: showWindow },
    { label: 'Hide Bird', click: hideWindow },
    { label: 'Agent Settings', click: openAgentSettings },
    {
      label: 'Restart Agent Monitor',
      click: () => {
        restartAgentMonitor();
      }
    },
    { type: 'separator' },
    { label: traySummaryLabel(snapshot), enabled: false },
    ...statusItems,
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function updateTrayMenu(snapshot = store.snapshot()) {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu(snapshot));
}

function showTrayMenu() {
  if (!tray) return;
  tray.popUpContextMenu(buildTrayMenu());
}

function loadTrayImage(filename, fallbackFilename = 'app-icon.png') {
  const image = nativeImage.createFromPath(assetPath(filename));
  return image.isEmpty() ? nativeImage.createFromPath(assetPath(fallbackFilename)) : image;
}

function hasActiveAgent(snapshot = store.snapshot()) {
  return snapshot.tasks.some((task) => (
    STATUS_SOURCES.has(task.source) && (task.status === 'running' || task.status === 'hitl')
  ));
}

function stopTrayAnimation() {
  if (trayAnimationTimer) {
    clearInterval(trayAnimationTimer);
    trayAnimationTimer = null;
  }
  trayAnimationIndex = 0;
  trayAnimationActive = false;
  if (tray && trayIdleImage) tray.setImage(trayIdleImage);
}

function startTrayAnimation() {
  if (!tray || trayActiveImages.length === 0) return;
  if (trayAnimationActive) return;

  trayAnimationActive = true;
  trayAnimationIndex = 0;
  tray.setImage(trayActiveImages[trayAnimationIndex]);
  trayAnimationTimer = setInterval(() => {
    if (!tray) return;
    trayAnimationIndex = (trayAnimationIndex + 1) % trayActiveImages.length;
    tray.setImage(trayActiveImages[trayAnimationIndex]);
  }, 220);
  trayAnimationTimer.unref?.();
}

function updateTrayActivity(snapshot = store.snapshot()) {
  if (!tray) return;
  if (hasActiveAgent(snapshot)) {
    startTrayAnimation();
    return;
  }
  stopTrayAnimation();
}

function createTray() {
  trayIdleImage = loadTrayImage('tray-icon.png');
  trayActiveImages = [
    loadTrayImage('tray-icon-active-left.png', 'tray-icon.png'),
    trayIdleImage,
    loadTrayImage('tray-icon-active-right.png', 'tray-icon.png'),
    trayIdleImage
  ];

  tray = new Tray(trayIdleImage);
  tray.setToolTip('Parrot Buddy');
  tray.on('click', showTrayMenu);
  updateTrayMenu();
  updateTrayActivity();
}

function startWander() {
  // Automatic movement is intentionally disabled so the pet stays where the user put it.
  stopWander();
}

function stopWander() {
  if (!wanderTimer) return;
  clearInterval(wanderTimer);
  wanderTimer = null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function currentDisplayWorkArea(bounds) {
  return screen.getDisplayMatching(bounds).workArea;
}

function allDisplayWorkAreaBounds() {
  return virtualWorkAreaBounds(screen.getAllDisplays());
}

function movementWorkArea(bounds) {
  return allDisplayWorkAreaBounds() || currentDisplayWorkArea(bounds);
}

function moveWindowBy(delta = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const dx = Number(delta.dx);
  const dy = Number(delta.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

  if (pokeTimer) {
    clearInterval(pokeTimer);
    pokeTimer = null;
  }
  stopWander();

  const bounds = mainWindow.getBounds();
  const nextPosition = clampWindowPosition({
    ...bounds,
    x: bounds.x + dx,
    y: bounds.y + dy
  }, movementWorkArea(bounds));
  if (!nextPosition) return;
  mainWindow.setPosition(nextPosition.x, nextPosition.y, false);
}

function pokeWindow(pointer) {
  // Clicks should animate the bird in place only; they should not move the window.
  stopWander();
}

function setWindowSize({ width, height, animate = false }) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const nextWidth = Math.round(Math.max(MIN_WINDOW_SIZE.width, Number(width) || COMPACT_WINDOW_SIZE.width));
  const nextHeight = Math.round(Math.max(MIN_WINDOW_SIZE.height, Number(height) || COMPACT_WINDOW_SIZE.height));

  const bounds = mainWindow.getBounds();
  const nextBounds = clampWindowBounds({
    ...bounds,
    width: nextWidth,
    height: nextHeight
  }, currentDisplayWorkArea(bounds));
  if (!nextBounds) return { ok: false };
  mainWindow.setBounds(nextBounds, Boolean(animate));
  return { ok: true, bounds: mainWindow.getBounds() };
}

function resizeWindowBy(delta = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };

  const edge = String(delta.edge || '');
  const dx = Number(delta.dx) || 0;
  const dy = Number(delta.dy) || 0;
  if (!edge || (!dx && !dy)) return { ok: false };

  const bounds = mainWindow.getBounds();
  const workArea = currentDisplayWorkArea(bounds);
  const originalRight = bounds.x + bounds.width;
  const originalBottom = bounds.y + bounds.height;
  let { x, y, width, height } = bounds;

  if (edge.includes('w')) {
    x += dx;
    width -= dx;
  }
  if (edge.includes('e')) width += dx;
  if (edge.includes('n')) {
    y += dy;
    height -= dy;
  }
  if (edge.includes('s')) height += dy;

  if (width < MIN_WINDOW_SIZE.width) {
    width = MIN_WINDOW_SIZE.width;
    if (edge.includes('w')) x = originalRight - width;
  }
  if (height < MIN_WINDOW_SIZE.height) {
    height = MIN_WINDOW_SIZE.height;
    if (edge.includes('n')) y = originalBottom - height;
  }

  if (x < workArea.x) {
    if (edge.includes('w')) width += x - workArea.x;
    x = workArea.x;
  }
  if (y < workArea.y) {
    if (edge.includes('n')) height += y - workArea.y;
    y = workArea.y;
  }

  const maxRight = workArea.x + workArea.width;
  const maxBottom = workArea.y + workArea.height;
  if (x + width > maxRight) {
    if (edge.includes('e')) width = maxRight - x;
    else x = maxRight - width;
  }
  if (y + height > maxBottom) {
    if (edge.includes('s')) height = maxBottom - y;
    else y = maxBottom - height;
  }

  const nextBounds = {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(MIN_WINDOW_SIZE.width, width)),
    height: Math.round(Math.max(MIN_WINDOW_SIZE.height, height))
  };

  mainWindow.setBounds(nextBounds, Boolean(delta.animate));
  if (delta.persistCompact !== false && !expandedPanelWindowOpen) {
    compactWindowSize = {
      width: nextBounds.width,
      height: nextBounds.height
    };
  }

  return {
    ok: true,
    dx: nextBounds.x - bounds.x,
    dy: nextBounds.y - bounds.y,
    bounds: nextBounds
  };
}

function fitWindowToContent(frame = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };

  const left = Number(frame.left);
  const top = Number(frame.top);
  const right = Number(frame.right);
  const bottom = Number(frame.bottom);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    return { ok: false };
  }

  const margin = clamp(Number(frame.margin) || 10, 0, 80);
  const minWidth = Math.max(MIN_WINDOW_SIZE.width, Number(frame.minWidth) || 0);
  const minHeight = Math.max(MIN_WINDOW_SIZE.height, Number(frame.minHeight) || 0);
  const bounds = mainWindow.getBounds();
  const workArea = currentDisplayWorkArea(bounds);

  let width = Math.round(Math.max(minWidth, right - left + margin * 2));
  let height = Math.round(Math.max(minHeight, bottom - top + margin * 2));
  width = Math.min(width, workArea.width);
  height = Math.min(height, workArea.height);

  const nextBounds = clampWindowBounds({
    ...bounds,
    x: bounds.x + left - margin,
    y: bounds.y + top - margin,
    width,
    height
  }, workArea);
  if (!nextBounds) return { ok: false };

  mainWindow.setBounds(nextBounds, false);
  if (frame.persistCompact !== false && !expandedPanelWindowOpen) {
    compactWindowSize = {
      width: nextBounds.width,
      height: nextBounds.height
    };
  }

  return {
    ok: true,
    dx: nextBounds.x - bounds.x,
    dy: nextBounds.y - bounds.y,
    bounds: nextBounds
  };
}

function runCommand({ label, command, cwd }) {
  if (!command || !command.trim()) {
    throw new Error('Command is required');
  }

  const task = store.startTask({
    label: label || command,
    source: 'app',
    command,
    cwd: cwd || process.cwd()
  });

  const child = spawn(command, {
    cwd: cwd || process.cwd(),
    shell: true,
    env: process.env
  });

  runningProcesses.set(task.id, child);

  child.stdout.on('data', (chunk) => {
    store.appendOutput(task.id, 'stdout', chunk);
  });

  child.stderr.on('data', (chunk) => {
    store.appendOutput(task.id, 'stderr', chunk);
  });

  child.on('error', (error) => {
    runningProcesses.delete(task.id);
    const finished = store.finishTask(task.id, {
      status: 'failed',
      exitCode: 1,
      stderrTail: [error.message]
    });
    playCompletionSound(finished.status);
  });

  child.on('exit', (code, signal) => {
    runningProcesses.delete(task.id);
    const status = signal ? 'stopped' : code === 0 ? 'success' : 'failed';
    const finished = store.finishTask(task.id, {
      status,
      exitCode: Number.isInteger(code) ? code : null
    });
    playCompletionSound(finished.status);
  });

  return task;
}

async function startApiServer() {
  apiServer = createApiServer({
    store,
    port: DEFAULT_PORT,
    onTaskFinished(task) {
      if (task.source === 'agent') notifyAgentFinished(task);
    }
  });

  try {
    await apiServer.start();
  } catch (error) {
    console.error(`Could not start Parrot Buddy bridge on port ${DEFAULT_PORT}:`, error.message);
  }
}

function reminderTask(reminder) {
  return {
    id: `assistant-reminder-${reminder.id}`,
    label: `Parrot reminder: ${reminder.title}`,
    source: 'assistant',
    command: `주인님, 오늘 ${reminder.title} 있는 거 아시죠? 까먹으면 곤란하다구요. · ${reminder.dueAt}`,
    status: 'hitl',
    startedAt: reminder.createdAt,
    finishedAt: null
  };
}

function checkDueReminders() {
  if (!assistantOrchestrator) return;
  const dueReminders = assistantOrchestrator.collectDueReminders(new Date());
  for (const reminder of dueReminders) {
    const task = store.upsertTask(reminderTask(reminder));
    notifyAgentAttention(task);
  }
}

function startReminderScheduler() {
  if (reminderTimer) return;
  checkDueReminders();
  reminderTimer = setInterval(checkDueReminders, 60 * 1000);
  reminderTimer.unref?.();
}

function stopReminderScheduler() {
  if (!reminderTimer) return;
  clearInterval(reminderTimer);
  reminderTimer = null;
}

function refreshDailyThoughts() {
  if (!assistantOrchestrator) return;
  try {
    assistantOrchestrator.refreshThoughts(new Date());
  } catch (error) {
    console.error('Could not refresh Joy thoughts:', error.message);
  }
}

function startThoughtScheduler() {
  if (thoughtTimer) return;
  refreshDailyThoughts();
  thoughtTimer = setInterval(refreshDailyThoughts, 30 * 60 * 1000);
  thoughtTimer.unref?.();
}

function stopThoughtScheduler() {
  if (!thoughtTimer) return;
  clearInterval(thoughtTimer);
  thoughtTimer = null;
}

async function runMemoryMaintenance() {
  if (!assistantOrchestrator || memoryMaintenanceRunning) return;
  memoryMaintenanceRunning = true;
  try {
    const result = await assistantOrchestrator.runMemoryMaintenance({ now: new Date() });
    if (result?.changed) {
      refreshDailyThoughts();
      broadcastSnapshot();
    }
  } catch (error) {
    console.error('Could not run Joy memory maintenance:', error.message);
  } finally {
    memoryMaintenanceRunning = false;
  }
}

function startMemoryMaintenanceScheduler() {
  if (memoryMaintenanceTimer || memoryMaintenanceInitialTimer) return;
  memoryMaintenanceInitialTimer = setTimeout(() => {
    memoryMaintenanceInitialTimer = null;
    runMemoryMaintenance();
  }, MEMORY_MAINTENANCE_START_DELAY_MS);
  memoryMaintenanceInitialTimer.unref?.();
  memoryMaintenanceTimer = setInterval(runMemoryMaintenance, MEMORY_MAINTENANCE_CHECK_INTERVAL_MS);
  memoryMaintenanceTimer.unref?.();
}

function stopMemoryMaintenanceScheduler() {
  if (memoryMaintenanceInitialTimer) {
    clearTimeout(memoryMaintenanceInitialTimer);
    memoryMaintenanceInitialTimer = null;
  }
  if (memoryMaintenanceTimer) {
    clearInterval(memoryMaintenanceTimer);
    memoryMaintenanceTimer = null;
  }
}

app.whenReady().then(async () => {
  settingsStore.ensureBase();
  store.on('change', broadcastSnapshot);
  store.on('change', updateTrayMenu);
  store.on('change', updateTrayActivity);
  await startApiServer();
  agentMonitor = createAgentMonitor();
  agentMonitor.start();
  assistantOrchestrator = new AssistantOrchestrator();
  assistantOrchestrator.on('changed', () => {
    refreshDailyThoughts();
    broadcastSnapshot();
  });
  startReminderScheduler();
  startThoughtScheduler();
  startMemoryMaintenanceScheduler();
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  stopTrayAnimation();
  stopWander();
  stopReminderScheduler();
  stopThoughtScheduler();
  stopMemoryMaintenanceScheduler();
  agentMonitor?.stop();

  for (const child of runningProcesses.values()) {
    child.kill('SIGTERM');
  }

  if (apiServer) {
    await apiServer.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('tasks:snapshot', () => store.snapshot());

ipcMain.handle('settings:snapshot', () => settingsStore.snapshot());

ipcMain.handle('settings:save', (_event, payload = {}) => {
  settingsStore.update(payload);
  restartAgentMonitor();
  const snapshot = settingsStore.snapshot();
  broadcastSettingsSnapshot(snapshot);
  return snapshot;
});

ipcMain.handle('settings:reset', () => {
  settingsStore.reset();
  restartAgentMonitor();
  const snapshot = settingsStore.snapshot();
  broadcastSettingsSnapshot(snapshot);
  return snapshot;
});

ipcMain.handle('assistant:snapshot', () => assistantOrchestrator?.snapshot() || { ok: false });

ipcMain.handle('assistant:thought', () => {
  if (!assistantOrchestrator) return { ok: false, error: 'Assistant is not ready' };
  return assistantOrchestrator.randomThought();
});

ipcMain.handle('assistant:message', async (_event, payload = {}) => {
  if (!assistantOrchestrator) return { ok: false, error: 'Assistant is not ready' };
  const id = `assistant-chat-${Date.now()}`;
  const userMessage = String(payload.message || '').trim();
  const task = store.upsertTask({
    id,
    label: 'Parrot assistant',
    source: 'assistant',
    command: userMessage.slice(0, 180),
    status: 'running'
  });

  const result = await assistantOrchestrator.handleMessage(userMessage);
  if (result.ok && result.needsConfirmation) {
    const hitlTask = store.upsertTask({
      ...task,
      status: 'hitl',
      command: result.clarifyingQuestion || result.reply
    });
    notifyAgentAttention(hitlTask);
    return result;
  }

  const finished = store.finishTask(id, {
    status: result.ok ? 'success' : 'failed',
    source: 'assistant',
    label: 'Parrot assistant',
    command: result.reply || result.error || userMessage,
    exitCode: result.ok ? 0 : 1
  });
  if (result.ok ? shouldNotifyAssistantFinished(result) : true) {
    notifyAgentFinished(finished);
  }
  return result;
});

ipcMain.handle('assistant:reminder-done', (_event, id) => {
  if (!assistantOrchestrator) return { ok: false, error: 'Assistant is not ready' };
  const reminder = assistantOrchestrator.markReminderDone(id);
  if (!reminder) return { ok: false, error: 'Reminder not found' };
  store.removeTask(`assistant-reminder-${id}`);
  return { ok: true, reminder, snapshot: assistantOrchestrator.snapshot() };
});

ipcMain.handle('tasks:run-command', (_event, payload) => runCommand(payload));

ipcMain.handle('tasks:stop-command', (_event, id) => {
  const child = runningProcesses.get(id);
  if (!child) return { ok: false, error: 'Task is not running' };
  child.kill('SIGTERM');
  return { ok: true };
});

ipcMain.handle('window:action', (_event, action) => {
  if (!mainWindow) return;
  const actionType = typeof action === 'string' ? action : action?.type;

  if (actionType === 'minimize') mainWindow.minimize();
  if (actionType === 'pause-wander') stopWander();
  if (actionType === 'resume-wander') startWander();
  if (actionType === 'move-by') moveWindowBy(action);
  if (actionType === 'resize-by') return resizeWindowBy(action);
  if (actionType === 'fit-to-content') return fitWindowToContent(action);
  if (actionType === 'guide-mode' || actionType === 'panel-mode') {
    expandedPanelWindowOpen = Boolean(action.open);
    const expandedSize = action?.panel === 'assistant'
      ? ASSISTANT_PANEL_WINDOW_SIZE
      : EXPANDED_PANEL_WINDOW_SIZE;
    return setWindowSize({
      ...(expandedPanelWindowOpen ? expandedSize : compactWindowSize),
      animate: Boolean(action.animate)
    });
  }
  if (actionType === 'poke') pokeWindow(action.pointer);
  if (actionType === 'hide') hideWindow();
  if (actionType === 'show') showWindow();
  if (actionType === 'close') hideWindow();
  if (actionType === 'quit') {
    app.isQuitting = true;
    app.quit();
  }
});
