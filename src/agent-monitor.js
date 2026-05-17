const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_POLL_MS = 800;
const RECENT_FILE_LIMIT = 24;
const ACTIVE_BOOT_WINDOW_MS = 6 * 60 * 60 * 1000;
const CODEX_ACTIVE_FILE_WINDOW_MS = 5 * 60 * 1000;
const CODEX_ORPHAN_ACTIVE_WINDOW_MS = 90 * 1000;
const CODEX_COMPLETED_TURN_LIMIT = 20;
const CLAUDE_ACTIVITY_WINDOW_MS = 25 * 1000;
const CLAUDE_HOOK_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const homeDir = os.homedir();

function nowIso() {
  return new Date().toISOString();
}

function toIsoFromSeconds(seconds, fallback = new Date()) {
  if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  return fallback.toISOString();
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function shortenHome(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(homeDir, '~');
}

function projectName(cwd, fallback) {
  if (!cwd || typeof cwd !== 'string') return fallback;
  return path.basename(cwd) || fallback;
}

function stableIdFragment(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function normalizePathForCompare(value) {
  if (!value || typeof value !== 'string') return null;
  return path.resolve(value);
}

function pathsRelated(first, second) {
  const left = normalizePathForCompare(first);
  const right = normalizePathForCompare(second);
  if (!left || !right) return false;
  return left === right
    || left.startsWith(`${right}${path.sep}`)
    || right.startsWith(`${left}${path.sep}`);
}

function hasMatchingCodexTerminal(cwd, processes = []) {
  return processes.some((process) => (
    process.kind === 'terminal'
    && process.cwd
    && pathsRelated(cwd, process.cwd)
  ));
}

function taskIdForTurn(turnId) {
  return `codex-turn-${turnId}`;
}

function taskIdForClaudeSession(sessionKey) {
  return `claude-session-${stableIdFragment(sessionKey)}`;
}

function shortTurnId(turnId) {
  const value = String(turnId || '');
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function turnLabel(prefix, cwd, turnId) {
  const shortTurn = shortTurnId(turnId);
  const name = projectName(cwd, 'working');
  return shortTurn ? `${prefix}: ${name} #${shortTurn}` : `${prefix}: ${name}`;
}

function turnCommand(cwd, turnId, suffix) {
  const shortTurn = shortTurnId(turnId);
  const base = shortenHome(cwd) || '~/.codex';
  return [base, shortTurn ? `turn ${shortTurn}` : '', suffix].filter(Boolean).join(' · ');
}

function compactText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractText(value, depth = 0) {
  if (!value || depth > 5) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => extractText(item, depth + 1)).filter(Boolean).join(' ');
  if (typeof value !== 'object') return '';

  return ['text', 'content', 'message', 'result', 'error', 'summary']
    .map((key) => extractText(value[key], depth + 1))
    .filter(Boolean)
    .join(' ');
}

const HUMAN_CONFIRMATION_PATTERN = /(진행해도|진행할까요|계속할까요|실행해도|실행할까요|덮어써도|stage해도|스테이지해도|커밋해도|커밋할까요|푸시해도|푸시할까요|저장할까요|수정할까요|적용할까요|삭제할까요|변경할까요|승인(이|을)?\s*필요|승인해도|승인할까요|승인해\s*주세요|허가(가|를)?\s*필요|권한(이|을)?\s*필요|확인(이|을)?\s*필요|please\s+confirm|confirm\s+(whether|that|before)|should i|should we|would you like me to|needs?\s+(approval|confirmation|permission)|requires?\s+(approval|confirmation|permission)|\b(can|may|should)\s+(i|we)\s+(proceed|continue)\b|\bwould\s+you\s+like\s+(me|us)\s+to\s+(proceed|continue)\b)/i;

function messageLooksHitl(value) {
  const text = compactText(value);
  if (!text) return false;

  return HUMAN_CONFIRMATION_PATTERN.test(text);
}

function completedMessageLooksHitl(value) {
  const text = compactText(value);
  if (!text) return false;

  return HUMAN_CONFIRMATION_PATTERN.test(text);
}

function parseToolArguments(raw) {
  if (!raw || typeof raw !== 'string') return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function approvalCommand(args = {}) {
  if (args.justification) return compactText(args.justification);
  if (args.cmd) return compactText(args.cmd);
  if (Array.isArray(args.command)) return args.command.join(' ');
  return 'Human confirmation needed';
}

function parseCodexEventLine(line) {
  if (!line || !line.trim()) return null;

  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  const payload = entry.payload || {};
  if (entry.type === 'session_meta') {
    return {
      type: 'session_meta',
      cwd: payload.cwd || null,
      agentNickname: payload.agent_nickname || null
    };
  }

  if (entry.type === 'event_msg' && payload.type === 'task_started' && payload.turn_id) {
    return {
      type: 'task_started',
      turnId: payload.turn_id,
      startedAt: toIsoFromSeconds(payload.started_at)
    };
  }

  if (entry.type === 'event_msg' && payload.type === 'task_complete' && payload.turn_id) {
    const hitl = completedMessageLooksHitl(payload.last_agent_message);
    return {
      type: 'task_complete',
      turnId: payload.turn_id,
      finishedAt: toIsoFromSeconds(payload.completed_at),
      durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : null,
      status: hitl ? 'hitl' : 'success',
      message: hitl ? compactText(payload.last_agent_message).slice(0, 180) : null
    };
  }

  if (entry.type === 'event_msg' && payload.type === 'turn_aborted' && payload.turn_id) {
    return {
      type: 'turn_aborted',
      turnId: payload.turn_id,
      finishedAt: toIsoFromSeconds(payload.completed_at),
      durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : null,
      status: 'stopped',
      message: payload.reason ? `Interrupted: ${payload.reason}` : 'Interrupted'
    };
  }

  if (entry.type === 'turn_context' && payload.turn_id) {
    return {
      type: 'turn_context',
      turnId: payload.turn_id,
      cwd: payload.cwd || null,
      model: payload.model || null
    };
  }

  if (entry.type === 'response_item' && payload.type === 'function_call') {
    const args = parseToolArguments(payload.arguments);
    const needsApproval = args.sandbox_permissions === 'require_escalated' || messageLooksHitl(args.justification);
    if (needsApproval) {
      return {
        type: 'approval_requested',
        callId: payload.call_id,
        command: approvalCommand(args),
        cwd: args.workdir || null,
        at: entry.timestamp || nowIso()
      };
    }
  }

  if (entry.type === 'response_item' && payload.type === 'function_call_output' && payload.call_id) {
    return {
      type: 'approval_resolved',
      callId: payload.call_id,
      at: entry.timestamp || nowIso()
    };
  }

  if (entry.type === 'event_msg' && payload.turn_id) {
    return {
      type: 'activity',
      turnId: payload.turn_id,
      at: entry.timestamp || nowIso()
    };
  }

  if (entry.type === 'response_item') {
    return {
      type: 'activity',
      at: entry.timestamp || nowIso()
    };
  }

  return null;
}

function parseClaudeLine(line) {
  if (!line || !line.trim()) return null;

  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  const timestamp = Date.parse(entry.timestamp);
  const at = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : nowIso();
  const cwd = entry.cwd || entry.tool_input?.workdir || null;

  if (entry.type === 'user') {
    return { type: 'user', at, cwd, sessionId: entry.sessionId || null };
  }

  if (entry.type === 'assistant') {
    const text = compactText(extractText(entry.message || entry.content || entry.response || entry)).slice(0, 180);
    if (messageLooksHitl(text)) {
      return {
        type: 'hitl',
        at,
        cwd,
        sessionId: entry.sessionId || null,
        command: text || 'Claude Code needs confirmation'
      };
    }

    return {
      type: entry.error || entry.isApiErrorMessage ? 'error' : 'assistant',
      at,
      cwd,
      sessionId: entry.sessionId || null
    };
  }

  if (entry.type === 'tool_use') {
    return { type: 'tool_use', at, cwd, sessionId: entry.sessionId || null };
  }

  if (entry.type === 'tool_result') {
    const exitCode = entry.tool_output?.exit;
    return {
      type: exitCode && exitCode !== 0 ? 'error' : 'tool_result',
      at,
      cwd,
      sessionId: entry.sessionId || null
    };
  }

  return null;
}

function collectFiles(root, extension, limit = RECENT_FILE_LIMIT) {
  if (!fs.existsSync(root)) return [];

  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(extension)) continue;

      try {
        const stat = fs.statSync(fullPath);
        files.push({ path: fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // Ignore files that rotate while scanning.
      }
    }
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

function listProcesses() {
  try {
    return execFileSync('ps', ['-axo', 'pid=,comm=,args='], { encoding: 'utf8' })
      .split(/\n/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseProcessLine(line) {
  const match = String(line || '').trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
  if (!match) return null;

  return {
    pid: Number(match[1]),
    comm: match[2],
    args: match[3]
  };
}

function isCodexProcess(process) {
  if (!process) return false;
  const value = `${process.comm} ${process.args}`.toLowerCase();
  if (value.includes('speckit-parrot-buddy')) return false;
  return value.includes('/bin/codex')
    || value.includes('@openai/codex')
    || value.includes('codex app-server')
    || /(^|\s)codex(\s|$)/.test(value);
}

function isClaudeProcess(process) {
  if (!process) return false;
  const value = `${process.comm} ${process.args}`.toLowerCase();
  const commName = path.basename(process.comm || '').toLowerCase();
  const firstArgName = path.basename(String(process.args || '').trim().split(/\s+/)[0] || '').toLowerCase();
  if (value.includes('speckit-parrot-buddy')) return false;
  return commName === 'claude'
    || firstArgName === 'claude'
    || value.includes('/bin/claude')
    || value.includes('@anthropic-ai/claude-code')
    || value.includes('claude-code');
}

function processCwd(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;

  try {
    const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const line = output.split(/\n/).find((entry) => entry.startsWith('n'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
}

function processParentPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;

  try {
    const output = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    const ppid = Number(output);
    return Number.isInteger(ppid) ? ppid : null;
  } catch {
    return null;
  }
}

function codexProcessKind(process) {
  const value = `${process.comm} ${process.args}`.toLowerCase();
  return value.includes('codex app-server') ? 'vscode' : 'terminal';
}

function listCodexRootProcesses(lines = listProcesses()) {
  const codexProcesses = lines
    .map(parseProcessLine)
    .filter(isCodexProcess)
    .map((process) => ({ ...process, ppid: processParentPid(process.pid) }));
  const codexPids = new Set(codexProcesses.map((process) => process.pid));

  return codexProcesses
    .filter((process) => !codexPids.has(process.ppid) || codexProcessKind(process) === 'vscode')
    .map((process) => ({
      ...process,
      kind: codexProcessKind(process),
      cwd: processCwd(process.pid)
    }));
}

function listClaudeRootProcesses(lines = listProcesses()) {
  const claudeProcesses = lines
    .map(parseProcessLine)
    .filter(isClaudeProcess)
    .map((process) => ({ ...process, ppid: processParentPid(process.pid) }));
  const claudePids = new Set(claudeProcesses.map((process) => process.pid));

  return claudeProcesses
    .filter((process) => !claudePids.has(process.ppid))
    .map((process) => ({
      ...process,
      cwd: processCwd(process.pid)
    }));
}

function hasCodexProcess(lines = listProcesses()) {
  return lines.map(parseProcessLine).some(isCodexProcess);
}

function hasClaudeProcess(lines = listProcesses()) {
  return lines.map(parseProcessLine).some(isClaudeProcess);
}

function hasLiveClaudeIdeLock(lockRoot = path.join(homeDir, '.claude', 'ide'), lines = listProcesses()) {
  if (!fs.existsSync(lockRoot)) return false;

  const processes = new Map(
    lines
      .map(parseProcessLine)
      .filter(Boolean)
      .map((entry) => [entry.pid, entry])
  );

  try {
    return fs.readdirSync(lockRoot)
      .filter((name) => name.endsWith('.lock'))
      .some((name) => {
        try {
          const raw = fs.readFileSync(path.join(lockRoot, name), 'utf8');
          const data = JSON.parse(raw);
          return isClaudeProcess(processes.get(Number(data.pid)));
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

function readPeonState(statePath = path.join(homeDir, '.claude', 'hooks', 'peon-ping', '.state.json')) {
  if (!fs.existsSync(statePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

class AgentMonitor {
  constructor({
    store,
    pollMs = DEFAULT_POLL_MS,
    codexSessionsRoot = path.join(homeDir, '.codex', 'sessions'),
    claudeProjectsRoot = path.join(homeDir, '.claude', 'projects'),
    claudeTranscriptsRoot = path.join(homeDir, '.claude', 'transcripts'),
    claudeIdeLockRoot = path.join(homeDir, '.claude', 'ide'),
    peonStatePath = path.join(homeDir, '.claude', 'hooks', 'peon-ping', '.state.json'),
    onAgentAttention,
    onAgentFinished
  }) {
    this.store = store;
    this.pollMs = pollMs;
    this.codexSessionsRoot = codexSessionsRoot;
    this.claudeProjectsRoot = claudeProjectsRoot;
    this.claudeTranscriptsRoot = claudeTranscriptsRoot;
    this.claudeIdeLockRoot = claudeIdeLockRoot;
    this.peonStatePath = peonStatePath;
    this.onAgentAttention = onAgentAttention;
    this.onAgentFinished = onAgentFinished;

    this.timer = null;
    this.offsets = new Map();
    this.pending = new Map();
    this.codexActiveTurns = new Map();
    this.codexCompletedTurns = new Map();
    this.codexContexts = new Map();
    this.codexFileMeta = new Map();
    this.fileLastTurnIds = new Map();
    this.pendingApprovals = new Map();
    this.codexProcessTaskIds = new Set();
    this.claudeSessions = new Map();
    this.claudeSessionTaskIds = new Set();
    this.claudeProcessTaskIds = new Set();
    this.lastStatuses = new Map();
  }

  start() {
    if (this.timer) return;
    this.bootstrap();
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  restart() {
    this.stop();
    this.start();
  }

  bootstrap() {
    for (const file of collectFiles(this.codexSessionsRoot, '.jsonl')
      .sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      this.readWholeFile(file, parseCodexEventLine, (event) => this.applyCodexEvent(event));
    }

    for (const root of [this.claudeProjectsRoot, this.claudeTranscriptsRoot]) {
      for (const file of collectFiles(root, '.jsonl')
        .sort((a, b) => a.mtimeMs - b.mtimeMs)) {
        this.readWholeFile(file, parseClaudeLine, (event) => this.applyClaudeEvent(event));
      }
    }

    const now = Date.now();
    for (const [turnId, turn] of this.codexActiveTurns) {
      const startedMs = Date.parse(turn.startedAt);
      if (Number.isFinite(startedMs) && now - startedMs > ACTIVE_BOOT_WINDOW_MS) {
        this.codexActiveTurns.delete(turnId);
      }
    }
  }

  readWholeFile(file, parser, applyEvent) {
    let content = '';
    try {
      content = fs.readFileSync(file.path, 'utf8');
    } catch {
      return;
    }

    for (const line of content.split(/\n/)) {
      const event = parser(line);
      if (event) {
        event.filePath = file.path;
        event.fileMtimeMs = file.mtimeMs;
        applyEvent(event);
      }
    }

    this.offsets.set(file.path, Buffer.byteLength(content));
  }

  poll() {
    for (const file of collectFiles(this.codexSessionsRoot, '.jsonl')
      .sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      this.readNewLines(file, parseCodexEventLine, (event) => this.applyCodexEvent(event));
    }

    for (const root of [this.claudeProjectsRoot, this.claudeTranscriptsRoot]) {
      for (const file of collectFiles(root, '.jsonl')
        .sort((a, b) => a.mtimeMs - b.mtimeMs)) {
        this.readNewLines(file, parseClaudeLine, (event) => this.applyClaudeEvent(event));
      }
    }

    this.updateAgentTasks();
  }

  readNewLines(file, parser, applyEvent) {
    const offset = this.offsets.get(file.path) || 0;
    let start = offset;
    if (file.size < start) start = 0;
    if (file.size <= start) return;

    let chunk = '';
    try {
      const fd = fs.openSync(file.path, 'r');
      const buffer = Buffer.alloc(file.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      chunk = buffer.toString('utf8');
    } catch {
      return;
    }

    this.offsets.set(file.path, file.size);

    const combined = `${this.pending.get(file.path) || ''}${chunk}`;
    const parts = combined.split(/\n/);
    const completeLines = combined.endsWith('\n') ? parts : parts.slice(0, -1);
    this.pending.set(file.path, combined.endsWith('\n') ? '' : parts[parts.length - 1]);

    for (const line of completeLines) {
      const event = parser(line);
      if (event) {
        event.filePath = file.path;
        event.fileMtimeMs = file.mtimeMs;
        applyEvent(event);
      }
    }
  }

  applyCodexEvent(event) {
    if (event.type === 'session_meta') {
      this.codexFileMeta.set(event.filePath, {
        cwd: event.cwd,
        agentNickname: event.agentNickname || null
      });
      return;
    }

    if (event.type === 'turn_context') {
      const meta = this.codexFileMeta.get(event.filePath) || {};
      this.fileLastTurnIds.set(event.filePath, event.turnId);
      this.codexContexts.set(event.turnId, {
        cwd: event.cwd,
        model: event.model,
        agentNickname: meta.agentNickname || null,
        filePath: event.filePath,
        fileMtimeMs: event.fileMtimeMs
      });
      return;
    }

    if (event.type === 'task_started') {
      const meta = this.codexFileMeta.get(event.filePath) || {};
      this.fileLastTurnIds.set(event.filePath, event.turnId);
      this.codexActiveTurns.set(event.turnId, {
        startedAt: event.startedAt,
        filePath: event.filePath,
        fileMtimeMs: event.fileMtimeMs,
        lastActivityAt: event.startedAt,
        agentNickname: meta.agentNickname || null
      });
      return;
    }

    if (event.type === 'task_complete' || event.type === 'turn_aborted') {
      const active = this.codexActiveTurns.get(event.turnId) || {};
      const context = this.codexContexts.get(event.turnId) || {};
      const meta = this.codexFileMeta.get(event.filePath) || {};
      const agentNickname = active.agentNickname || context.agentNickname || meta.agentNickname || null;
      this.fileLastTurnIds.set(event.filePath, event.turnId);
      this.codexActiveTurns.delete(event.turnId);
      this.codexCompletedTurns.set(event.turnId, {
        finishedAt: event.finishedAt,
        durationMs: event.durationMs,
        status: event.status,
        message: event.message,
        filePath: event.filePath,
        fileMtimeMs: event.fileMtimeMs,
        agentNickname,
        silent: Boolean(agentNickname)
      });
      this.trimCompletedCodexTurns();
      return;
    }

    if (event.type === 'approval_requested') {
      const turnId = this.fileLastTurnIds.get(event.filePath);
      if (!turnId || !event.callId) return;
      this.noteCodexActivity(turnId, event);

      this.pendingApprovals.set(event.callId, {
        turnId,
        command: event.command,
        cwd: event.cwd,
        at: event.at,
        filePath: event.filePath
      });
      return;
    }

    if (event.type === 'approval_resolved') {
      this.pendingApprovals.delete(event.callId);
      const turnId = this.fileLastTurnIds.get(event.filePath);
      if (turnId) this.noteCodexActivity(turnId, event);
      return;
    }

    if (event.type === 'activity') {
      const turnId = event.turnId || this.fileLastTurnIds.get(event.filePath);
      if (!turnId) return;
      this.fileLastTurnIds.set(event.filePath, turnId);
      this.noteCodexActivity(turnId, event);
    }
  }

  noteCodexActivity(turnId, event) {
    const active = this.codexActiveTurns.get(turnId);
    if (active) {
      active.fileMtimeMs = event.fileMtimeMs;
      active.lastActivityAt = event.at || nowIso();
    }

    const context = this.codexContexts.get(turnId);
    if (context) {
      context.filePath = event.filePath || context.filePath;
      context.fileMtimeMs = event.fileMtimeMs;
    }
  }

  applyClaudeEvent(event) {
    const sessionKey = event.sessionId || event.cwd || event.filePath;
    if (!sessionKey) return;

    const existing = this.claudeSessions.get(sessionKey) || {};
    this.claudeSessions.set(sessionKey, {
      ...existing,
      sessionKey,
      sessionId: event.sessionId || existing.sessionId || null,
      cwd: event.cwd || existing.cwd || null,
      lastType: event.type,
      lastAt: event.at || nowIso(),
      needsAttention: event.type === 'hitl'
        ? true
        : ['user', 'tool_use', 'tool_result'].includes(event.type)
          ? false
          : Boolean(existing.needsAttention),
      attentionText: event.type === 'hitl'
        ? event.command || 'Claude Code needs confirmation'
        : ['user', 'tool_use', 'tool_result'].includes(event.type)
          ? null
          : existing.attentionText || null,
      filePath: event.filePath || existing.filePath,
      fileMtimeMs: event.fileMtimeMs
    });
  }

  updateAgentTasks() {
    const processes = listProcesses();
    this.updateCodexTask(processes);
    this.updateClaudeTask(processes);
  }

  updateCodexTask(processes) {
    const now = Date.now();
    const codexRootProcesses = listCodexRootProcesses(processes);

    for (const [turnId, turn] of this.codexActiveTurns) {
      const context = this.codexContexts.get(turnId) || {};
      const lastSeenMs = Number.isFinite(turn.fileMtimeMs)
        ? turn.fileMtimeMs
        : Date.parse(turn.lastActivityAt || turn.startedAt);
      const hasPendingApproval = Boolean(this.pendingApprovalForTurn(turnId));
      const hasMatchingTerminal = hasMatchingCodexTerminal(context.cwd, codexRootProcesses);
      const staleWindow = hasPendingApproval || hasMatchingTerminal
        ? CODEX_ACTIVE_FILE_WINDOW_MS
        : CODEX_ORPHAN_ACTIVE_WINDOW_MS;

      if (!hasPendingApproval && Number.isFinite(lastSeenMs) && now - lastSeenMs > staleWindow) {
        this.codexActiveTurns.delete(turnId);
        this.codexCompletedTurns.set(turnId, {
          finishedAt: new Date(lastSeenMs).toISOString(),
          status: 'stopped',
          filePath: turn.filePath,
          fileMtimeMs: lastSeenMs,
          silent: true
        });
      }
    }
    this.trimCompletedCodexTurns();
    this.pruneExcessActiveCodexTurns(codexRootProcesses);

    const active = Array.from(this.codexActiveTurns.entries())
      .map(([turnId, turn]) => ({
        turnId,
        ...turn,
        context: this.codexContexts.get(turnId) || {}
      }))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

    const codexOnline = hasCodexProcess(processes);
    const visibleTurnTaskIds = new Set();

    for (const turn of active) {
      const context = turn.context || {};
      const id = taskIdForTurn(turn.turnId);
      visibleTurnTaskIds.add(id);
      const previous = this.lastStatuses.get(id);
      const approval = this.pendingApprovalForTurn(turn.turnId);
      const status = approval ? 'hitl' : 'running';
      const task = this.store.upsertTask({
        id,
        label: turnLabel('Codex', context.cwd, turn.turnId),
        source: 'agent',
        command: approval?.command || turnCommand(context.cwd, turn.turnId, 'working'),
        status,
        startedAt: turn.startedAt,
        finishedAt: null,
        exitCode: null
      });

      this.noteTransition(id, previous, status, task);
    }

    const completed = Array.from(this.codexCompletedTurns.entries())
      .map(([turnId, turn]) => ({
        turnId,
        ...turn,
        context: this.codexContexts.get(turnId) || {}
      }))
      .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
      .slice(0, CODEX_COMPLETED_TURN_LIMIT);

    for (const turn of completed) {
      if (this.codexActiveTurns.has(turn.turnId)) continue;
      const context = turn.context || {};
      const id = taskIdForTurn(turn.turnId);
      const status = turn.status || 'success';
      const previous = this.lastStatuses.get(id);
      const existing = this.store.tasks.get(id);

      if (previous === 'running' || previous === 'hitl') {
        this.noteTransition(id, previous, status, {
          ...(existing || {}),
          id,
          label: existing?.label || turnLabel('Codex', context.cwd, turn.turnId),
          source: 'agent',
          command: turn.message || turnCommand(context.cwd, turn.turnId, status === 'success' ? 'done' : status),
          status,
          finishedAt: turn.finishedAt || nowIso(),
          silent: Boolean(turn.silent)
        });
      }
    }

    this.cleanupCodexTurnTasks(visibleTurnTaskIds);
    this.updateCodexProcessTasks(codexRootProcesses);

    const readyId = 'agent-codex-ready';
    if (active.length === 0 && codexRootProcesses.length === 0) {
      const status = codexOnline ? 'waiting' : 'stopped';
      const previous = this.lastStatuses.get(readyId);
      const task = this.store.upsertTask({
        id: readyId,
        label: 'Codex',
        source: 'agent',
        command: codexOnline ? 'Codex is open and waiting' : 'Codex process not detected',
        status,
        startedAt: this.store.tasks.get(readyId)?.startedAt || nowIso(),
        finishedAt: status === 'waiting' ? null : nowIso(),
        exitCode: status === 'waiting' ? 0 : null
      });
      this.noteTransition(readyId, previous, status, task);
    } else {
      this.lastStatuses.set(readyId, 'hidden');
      this.store.removeTask(readyId);
    }
  }

  pendingApprovalForTurn(turnId) {
    return Array.from(this.pendingApprovals.values())
      .filter((approval) => approval.turnId === turnId)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;
  }

  cleanupCodexTurnTasks(visibleTurnTaskIds) {
    for (const id of this.store.tasks.keys()) {
      if (!id.startsWith('codex-turn-') || visibleTurnTaskIds.has(id)) continue;
      this.lastStatuses.set(id, 'hidden');
      this.store.removeTask(id);
    }
  }

  updateCodexProcessTasks(processes) {
    const nextIds = new Set();

    for (const process of processes) {
      if (this.processIsCoveredByActiveCodexTurn(process)) continue;

      const id = `codex-process-${process.pid}`;
      nextIds.add(id);

      const cwd = process.cwd && process.cwd !== '/' ? process.cwd : null;
      const label = process.kind === 'vscode'
        ? 'Codex VS Code'
        : `Codex Terminal: ${projectName(cwd, `pid ${process.pid}`)}`;
      const command = [
        cwd ? shortenHome(cwd) : process.kind === 'vscode' ? 'VS Code Codex app-server' : 'Codex terminal',
        `pid ${process.pid}`,
        'open'
      ].join(' · ');
      const previous = this.lastStatuses.get(id);
      const task = this.store.upsertTask({
        id,
        label,
        source: 'agent',
        command,
        status: 'waiting',
        startedAt: this.store.tasks.get(id)?.startedAt || nowIso(),
        finishedAt: null,
        exitCode: 0
      });

      this.noteTransition(id, previous, 'waiting', task);
    }

    for (const id of this.codexProcessTaskIds) {
      if (nextIds.has(id)) continue;
      this.lastStatuses.set(id, 'hidden');
      this.store.removeTask(id);
    }

    this.codexProcessTaskIds = nextIds;
  }

  processIsCoveredByActiveCodexTurn(process) {
    if (process.kind !== 'terminal' || !process.cwd) return false;
    return Array.from(this.codexActiveTurns.keys()).some((turnId) => {
      const context = this.codexContexts.get(turnId) || {};
      return pathsRelated(context.cwd, process.cwd);
    });
  }

  trimCompletedCodexTurns() {
    const entries = Array.from(this.codexCompletedTurns.entries())
      .sort((a, b) => String(b[1].finishedAt).localeCompare(String(a[1].finishedAt)));

    for (const [turnId] of entries.slice(CODEX_COMPLETED_TURN_LIMIT)) {
      this.codexCompletedTurns.delete(turnId);
      this.store.removeTask(taskIdForTurn(turnId));
    }
  }

  updateClaudeTask(processes) {
    const peonState = readPeonState(this.peonStatePath);
    const lastActive = peonState?.last_active || null;
    const lastActiveMs = timestampMs(lastActive?.timestamp);
    const hookEvent = String(lastActive?.event || '');
    const hookLooksRunning = Boolean(
      lastActiveMs
      && Date.now() - lastActiveMs < CLAUDE_HOOK_ACTIVE_WINDOW_MS
      && !['Stop', 'SessionEnd'].includes(hookEvent)
    );

    const now = Date.now();
    const sessionCandidates = [];

    for (const [sessionKey, session] of this.claudeSessions) {
      const seenMs = timestampMs(session.lastAt) || session.fileMtimeMs || 0;
      const activeWindowMs = session.needsAttention ? CLAUDE_HOOK_ACTIVE_WINDOW_MS : CLAUDE_ACTIVITY_WINDOW_MS;
      if (seenMs && now - seenMs < activeWindowMs) {
        sessionCandidates.push({
          ...session,
          sessionKey,
          seenMs,
          lastAt: session.lastAt || new Date(seenMs).toISOString()
        });
      } else if (seenMs && now - seenMs > ACTIVE_BOOT_WINDOW_MS) {
        this.claudeSessions.delete(sessionKey);
      }
    }

    if (Array.isArray(peonState?.agent_sessions)) {
      peonState.agent_sessions.forEach((session, index) => {
        const value = typeof session === 'object' && session !== null ? session : {};
        const cwd = value.cwd || value.workspace || value.workspaceFolder || lastActive?.cwd || null;
        const key = value.sessionId || value.session_id || value.id || cwd || `peon-${index}`;
        const seenMs = timestampMs(value.timestamp || value.updatedAt || value.updated_at || lastActive?.timestamp) || now;
        sessionCandidates.push({
          sessionKey: `peon-${key}`,
          sessionId: key,
          cwd,
          lastType: value.event || hookEvent || 'hook',
          lastAt: new Date(seenMs).toISOString(),
          seenMs
        });
      });
    }

    if (hookLooksRunning && sessionCandidates.length === 0) {
      const cwd = lastActive?.cwd || null;
      sessionCandidates.push({
        sessionKey: `hook-${cwd || 'claude'}`,
        sessionId: null,
        cwd,
        lastType: hookEvent || 'active',
        lastAt: new Date(lastActiveMs).toISOString(),
        seenMs: lastActiveMs
      });
    }

    const sessionByKey = new Map();
    for (const session of sessionCandidates) {
      const existing = sessionByKey.get(session.sessionKey);
      if (!existing || session.seenMs > existing.seenMs) sessionByKey.set(session.sessionKey, session);
    }

    const activeSessions = Array.from(sessionByKey.values())
      .sort((a, b) => b.seenMs - a.seenMs);
    const visibleSessionTaskIds = new Set();

    for (const session of activeSessions) {
      const id = taskIdForClaudeSession(session.sessionKey);
      visibleSessionTaskIds.add(id);
      const previous = this.lastStatuses.get(id);
      const status = session.needsAttention ? 'hitl' : 'running';
      const task = this.store.upsertTask({
        id,
        label: `Claude: ${projectName(session.cwd, 'working')}`,
        source: 'agent',
        command: session.needsAttention
          ? session.attentionText || 'Claude Code needs confirmation'
          : `${shortenHome(session.cwd) || '~/.claude'} · ${session.lastType || 'active'}`,
        status,
        startedAt: this.store.tasks.get(id)?.startedAt || session.lastAt || nowIso(),
        finishedAt: null,
        exitCode: null
      });

      this.noteTransition(id, previous, status, task);
    }

    this.cleanupClaudeSessionTasks(visibleSessionTaskIds);
    this.updateClaudeProcessTasks(processes, activeSessions);

    const readyId = 'agent-claude';
    const claudeOnline = this.claudeProcessTaskIds.size > 0 || hasLiveClaudeIdeLock(this.claudeIdeLockRoot, processes);
    if (activeSessions.length === 0 && this.claudeProcessTaskIds.size === 0) {
      const status = claudeOnline || hasClaudeProcess(processes) ? 'waiting' : 'stopped';
      const previous = this.lastStatuses.get(readyId);
      const task = this.store.upsertTask({
        id: readyId,
        label: 'Claude Code',
        source: 'agent',
        command: status === 'waiting' ? 'Claude Code is open and waiting' : 'Claude Code process not detected',
        status,
        startedAt: this.store.tasks.get(readyId)?.startedAt || nowIso(),
        finishedAt: status === 'waiting' ? null : nowIso(),
        exitCode: status === 'stopped' ? null : 0
      });
      this.noteTransition(readyId, previous, status, task);
    } else {
      this.lastStatuses.set(readyId, 'hidden');
      this.store.removeTask(readyId);
    }
  }

  cleanupClaudeSessionTasks(visibleSessionTaskIds) {
    for (const id of this.claudeSessionTaskIds) {
      if (visibleSessionTaskIds.has(id)) continue;
      const previous = this.lastStatuses.get(id);
      const existing = this.store.tasks.get(id);
      this.noteTransition(id, previous, 'success', {
        ...(existing || {}),
        id,
        status: 'success',
        finishedAt: nowIso(),
        silent: previous === 'hitl'
      });
      this.lastStatuses.set(id, 'hidden');
      this.store.removeTask(id);
    }

    this.claudeSessionTaskIds = visibleSessionTaskIds;
  }

  updateClaudeProcessTasks(processes, activeSessions = []) {
    const nextIds = new Set();

    for (const process of listClaudeRootProcesses(processes)) {
      const cwd = process.cwd && process.cwd !== '/' ? process.cwd : null;
      if (activeSessions.some((session) => pathsRelated(session.cwd, cwd))) continue;

      const id = `claude-process-${process.pid}`;
      nextIds.add(id);
      const previous = this.lastStatuses.get(id);
      const task = this.store.upsertTask({
        id,
        label: `Claude Code: ${projectName(cwd, `pid ${process.pid}`)}`,
        source: 'agent',
        command: [
          cwd ? shortenHome(cwd) : 'Claude Code process',
          `pid ${process.pid}`,
          'open'
        ].join(' · '),
        status: 'waiting',
        startedAt: this.store.tasks.get(id)?.startedAt || nowIso(),
        finishedAt: null,
        exitCode: 0
      });

      this.noteTransition(id, previous, 'waiting', task);
    }

    for (const id of this.claudeProcessTaskIds) {
      if (nextIds.has(id)) continue;
      this.lastStatuses.set(id, 'hidden');
      this.store.removeTask(id);
    }

    this.claudeProcessTaskIds = nextIds;
  }

  pruneExcessActiveCodexTurns(codexRootProcesses = []) {
    const consumedTerminalPids = new Set();
    const active = Array.from(this.codexActiveTurns.entries())
      .map(([turnId, turn]) => ({
        turnId,
        ...turn,
        context: this.codexContexts.get(turnId) || {}
      }))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

    for (const turn of active) {
      const cwd = turn.context?.cwd;
      const approval = this.pendingApprovalForTurn(turn.turnId);
      const matchingTerminal = codexRootProcesses.find((process) => (
        process.kind === 'terminal'
        && process.cwd
        && pathsRelated(cwd, process.cwd)
        && !consumedTerminalPids.has(process.pid)
      ));

      if (matchingTerminal) {
        consumedTerminalPids.add(matchingTerminal.pid);
        continue;
      }

      if (approval) continue;

      const hasSameFolderTerminal = codexRootProcesses.some((process) => (
        process.kind === 'terminal'
        && process.cwd
        && pathsRelated(cwd, process.cwd)
      ));

      if (!hasSameFolderTerminal) continue;

      const finishedMs = turn.fileMtimeMs || Date.parse(turn.lastActivityAt || turn.startedAt) || Date.now();
      this.codexActiveTurns.delete(turn.turnId);
      this.codexCompletedTurns.set(turn.turnId, {
        finishedAt: new Date(finishedMs).toISOString(),
        status: 'stopped',
        filePath: turn.filePath,
        fileMtimeMs: finishedMs,
        silent: true
      });
    }

    this.trimCompletedCodexTurns();
  }

  noteTransition(id, previous, next, task) {
    if (previous === next) return;
    this.lastStatuses.set(id, next);
    if (next === 'hitl' && previous !== 'hitl') {
      this.onAgentAttention?.(task);
      return;
    }
    if ((previous === 'running' || previous === 'hitl') && next !== 'running' && next !== 'hitl') {
      if (task?.silent) return;
      this.onAgentFinished?.(task);
    }
  }
}

module.exports = {
  AgentMonitor,
  collectFiles,
  hasClaudeProcess,
  hasCodexProcess,
  listClaudeRootProcesses,
  listCodexRootProcesses,
  messageLooksHitl,
  parseClaudeLine,
  parseCodexEventLine,
  readPeonState
};
