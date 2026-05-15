const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { TaskStore } = require('./task-store');
const { createApiServer, DEFAULT_PORT } = require('./api-server');
const { playAttentionSound, playCompletionSound } = require('./sound');
const { AgentMonitor } = require('./agent-monitor');

const store = new TaskStore();
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
let wanderTimer = null;
let pokeTimer = null;
let wanderVelocity = { x: 0.45, y: 0.28 };
const assetPath = (...parts) => path.join(__dirname, '..', 'assets', ...parts);
const COMPACT_WINDOW_SIZE = { width: 430, height: 292 };
const GUIDE_WINDOW_SIZE = { width: 430, height: 520 };
const MIN_WINDOW_SIZE = { width: 128, height: 112 };
let compactWindowSize = { ...COMPACT_WINDOW_SIZE };
let guideWindowOpen = false;

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
    status: task?.status
  });
}

function notifyAgentFinished(task) {
  playCompletionSound(task?.status === 'stopped' ? 'stopped' : task?.status || 'success');
  broadcastAgentAlert('finished', task);
}

function notifyAgentAttention(task) {
  playAttentionSound(task?.status || 'hitl');
  broadcastAgentAlert('attention', task);
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

function updateTrayMenu() {
  if (!tray) return;

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Parrot Buddy', enabled: false },
    { type: 'separator' },
    { label: 'Show Bird', click: showWindow },
    { label: 'Hide Bird', click: hideWindow },
    {
      label: 'Restart Agent Monitor',
      click: () => {
        agentMonitor?.restart();
        broadcastSnapshot();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function loadTrayImage(filename, fallbackFilename = 'app-icon.png') {
  const image = nativeImage.createFromPath(assetPath(filename));
  return image.isEmpty() ? nativeImage.createFromPath(assetPath(fallbackFilename)) : image;
}

function hasActiveAgent(snapshot = store.snapshot()) {
  return snapshot.tasks.some((task) => (
    task.source === 'agent' && (task.status === 'running' || task.status === 'hitl')
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
  tray.on('click', () => {
    if (mainWindow?.isVisible()) hideWindow();
    else showWindow();
  });
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
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const nextX = clamp(bounds.x + dx, workArea.x, workArea.x + workArea.width - bounds.width);
  const nextY = clamp(bounds.y + dy, workArea.y, workArea.y + workArea.height - bounds.height);
  mainWindow.setPosition(Math.round(nextX), Math.round(nextY), false);
}

function pokeWindow(pointer) {
  // Clicks should animate the bird in place only; they should not move the window.
  stopWander();
}

function setWindowSize({ width, height }) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const nextWidth = Math.round(Math.max(MIN_WINDOW_SIZE.width, Number(width) || COMPACT_WINDOW_SIZE.width));
  const nextHeight = Math.round(Math.max(MIN_WINDOW_SIZE.height, Number(height) || COMPACT_WINDOW_SIZE.height));

  const bounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const nextX = clamp(bounds.x, workArea.x, workArea.x + workArea.width - nextWidth);
  const nextY = clamp(bounds.y, workArea.y, workArea.y + workArea.height - nextHeight);
  mainWindow.setBounds({
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: nextWidth,
    height: nextHeight
  }, false);
}

function resizeWindowBy(delta = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const edge = String(delta.edge || '');
  const dx = Number(delta.dx) || 0;
  const dy = Number(delta.dy) || 0;
  if (!edge || (!dx && !dy)) return;

  const bounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
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

  mainWindow.setBounds(nextBounds, false);
  if (delta.persistCompact !== false && !guideWindowOpen) {
    compactWindowSize = {
      width: nextBounds.width,
      height: nextBounds.height
    };
  }
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

app.whenReady().then(async () => {
  store.on('change', broadcastSnapshot);
  store.on('change', updateTrayActivity);
  await startApiServer();
  agentMonitor = new AgentMonitor({
    store,
    onAgentAttention(task) {
      notifyAgentAttention(task);
    },
    onAgentFinished(task) {
      notifyAgentFinished(task);
    }
  });
  agentMonitor.start();
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
  if (actionType === 'resize-by') resizeWindowBy(action);
  if (actionType === 'guide-mode') {
    guideWindowOpen = Boolean(action.open);
    setWindowSize(guideWindowOpen ? GUIDE_WINDOW_SIZE : compactWindowSize);
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
