const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_SETTINGS_ROOT = path.join(os.homedir(), '.parrot-buddy');
const DEFAULT_SETTINGS_PATH = path.join(DEFAULT_SETTINGS_ROOT, 'settings.json');

const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  agents: {
    codex: {
      enabled: true,
      command: 'codex',
      sessionsRoot: '~/.codex/sessions'
    },
    claude: {
      enabled: true,
      command: 'claude',
      projectsRoot: '~/.claude/projects',
      transcriptsRoot: '~/.claude/transcripts',
      ideLockRoot: '~/.claude/ide',
      peonStatePath: '~/.claude/hooks/peon-ping/.state.json'
    }
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expandHome(value, homeDir = os.homedir()) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text === '~') return homeDir;
  if (text.startsWith('~/')) return path.join(homeDir, text.slice(2));
  return text;
}

function cleanString(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeSettings(input = {}) {
  const defaults = clone(DEFAULT_SETTINGS);
  const source = input && typeof input === 'object' ? input : {};
  const sourceAgents = source.agents && typeof source.agents === 'object' ? source.agents : {};
  const codex = sourceAgents.codex && typeof sourceAgents.codex === 'object' ? sourceAgents.codex : {};
  const claude = sourceAgents.claude && typeof sourceAgents.claude === 'object' ? sourceAgents.claude : {};

  return {
    version: 1,
    agents: {
      codex: {
        ...defaults.agents.codex,
        enabled: codex.enabled !== false,
        command: cleanString(codex.command, defaults.agents.codex.command),
        sessionsRoot: cleanString(codex.sessionsRoot, defaults.agents.codex.sessionsRoot)
      },
      claude: {
        ...defaults.agents.claude,
        enabled: claude.enabled !== false,
        command: cleanString(claude.command, defaults.agents.claude.command),
        projectsRoot: cleanString(claude.projectsRoot, defaults.agents.claude.projectsRoot),
        transcriptsRoot: cleanString(claude.transcriptsRoot, defaults.agents.claude.transcriptsRoot),
        ideLockRoot: cleanString(claude.ideLockRoot, defaults.agents.claude.ideLockRoot),
        peonStatePath: cleanString(claude.peonStatePath, defaults.agents.claude.peonStatePath)
      }
    }
  };
}

function mergeSettings(current, patch = {}) {
  const base = normalizeSettings(current);
  const next = patch && typeof patch === 'object' ? patch : {};
  const agents = next.agents && typeof next.agents === 'object' ? next.agents : {};

  return normalizeSettings({
    ...base,
    ...next,
    agents: {
      ...base.agents,
      codex: {
        ...base.agents.codex,
        ...(agents.codex && typeof agents.codex === 'object' ? agents.codex : {})
      },
      claude: {
        ...base.agents.claude,
        ...(agents.claude && typeof agents.claude === 'object' ? agents.claude : {})
      }
    }
  });
}

function commandPath(command) {
  const value = String(command || '').trim();
  if (!value) return null;

  if (value.includes(path.sep)) {
    const expanded = expandHome(value);
    return fs.existsSync(expanded) ? expanded : null;
  }

  try {
    const quoted = `'${value.replace(/'/g, "'\\''")}'`;
    return execFileSync('/bin/zsh', ['-lc', `command -v ${quoted}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || null;
  } catch {
    return null;
  }
}

function pathStatus(label, value) {
  const expanded = expandHome(value);
  return {
    label,
    path: value,
    expandedPath: expanded,
    exists: Boolean(expanded && fs.existsSync(expanded))
  };
}

class SettingsStore {
  constructor({ filePath = DEFAULT_SETTINGS_PATH } = {}) {
    this.filePath = path.resolve(filePath);
  }

  ensureBase() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) this.write(DEFAULT_SETTINGS);
  }

  read() {
    this.ensureBase();
    try {
      return normalizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      const settings = normalizeSettings(DEFAULT_SETTINGS);
      this.write(settings);
      return settings;
    }
  }

  write(settings) {
    const normalized = normalizeSettings(settings);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  update(patch) {
    return this.write(mergeSettings(this.read(), patch));
  }

  reset() {
    return this.write(DEFAULT_SETTINGS);
  }

  monitorOptions(settings = this.read()) {
    const normalized = normalizeSettings(settings);
    return {
      enabledAgents: {
        codex: normalized.agents.codex.enabled,
        claude: normalized.agents.claude.enabled
      },
      codexSessionsRoot: expandHome(normalized.agents.codex.sessionsRoot),
      claudeProjectsRoot: expandHome(normalized.agents.claude.projectsRoot),
      claudeTranscriptsRoot: expandHome(normalized.agents.claude.transcriptsRoot),
      claudeIdeLockRoot: expandHome(normalized.agents.claude.ideLockRoot),
      peonStatePath: expandHome(normalized.agents.claude.peonStatePath)
    };
  }

  snapshot() {
    const settings = this.read();
    return {
      ok: true,
      filePath: this.filePath,
      settings,
      connections: [
        {
          id: 'codex',
          label: 'Codex',
          enabled: settings.agents.codex.enabled,
          command: settings.agents.codex.command,
          commandPath: commandPath(settings.agents.codex.command),
          paths: [
            pathStatus('Sessions', settings.agents.codex.sessionsRoot)
          ]
        },
        {
          id: 'claude',
          label: 'Claude Code',
          enabled: settings.agents.claude.enabled,
          command: settings.agents.claude.command,
          commandPath: commandPath(settings.agents.claude.command),
          paths: [
            pathStatus('Projects', settings.agents.claude.projectsRoot),
            pathStatus('Transcripts', settings.agents.claude.transcriptsRoot),
            pathStatus('IDE locks', settings.agents.claude.ideLockRoot),
            pathStatus('Peon state', settings.agents.claude.peonStatePath)
          ]
        }
      ]
    };
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_SETTINGS_PATH,
  SettingsStore,
  expandHome,
  mergeSettings,
  normalizeSettings
};
