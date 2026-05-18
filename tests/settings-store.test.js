const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  SettingsStore,
  expandHome,
  mergeSettings,
  normalizeSettings
} = require('../src/settings-store');

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parrot-settings-')), 'settings.json');
}

test('creates default agent connection settings', () => {
  const store = new SettingsStore({ filePath: tempFile() });
  const settings = store.read();

  assert.equal(settings.agents.codex.enabled, true);
  assert.equal(settings.agents.codex.sessionsRoot, '~/.codex/sessions');
  assert.equal(settings.agents.claude.enabled, true);
  assert.equal(settings.agents.claude.projectsRoot, '~/.claude/projects');
});

test('normalizes partial settings without losing defaults', () => {
  const settings = normalizeSettings({
    agents: {
      codex: {
        enabled: false
      }
    }
  });

  assert.equal(settings.agents.codex.enabled, false);
  assert.equal(settings.agents.codex.command, 'codex');
  assert.equal(settings.agents.claude.enabled, true);
});

test('merges nested agent settings', () => {
  const merged = mergeSettings(undefined, {
    agents: {
      claude: {
        enabled: false,
        projectsRoot: '/tmp/claude-projects'
      }
    }
  });

  assert.equal(merged.agents.codex.enabled, true);
  assert.equal(merged.agents.claude.enabled, false);
  assert.equal(merged.agents.claude.projectsRoot, '/tmp/claude-projects');
  assert.equal(merged.agents.claude.command, 'claude');
});

test('expands home paths for monitor options', () => {
  const store = new SettingsStore({ filePath: tempFile() });
  store.write({
    agents: {
      codex: {
        enabled: false,
        sessionsRoot: '~/custom-codex'
      },
      claude: {
        enabled: true,
        projectsRoot: '~/custom-claude/projects',
        transcriptsRoot: '~/custom-claude/transcripts',
        ideLockRoot: '~/custom-claude/ide',
        peonStatePath: '~/custom-claude/peon.json'
      }
    }
  });

  const options = store.monitorOptions();
  assert.equal(options.enabledAgents.codex, false);
  assert.equal(options.codexSessionsRoot, path.join(os.homedir(), 'custom-codex'));
  assert.equal(options.claudeProjectsRoot, path.join(os.homedir(), 'custom-claude', 'projects'));
});

test('expandHome handles bare home and relative paths', () => {
  assert.equal(expandHome('~'), os.homedir());
  assert.equal(expandHome('~/abc'), path.join(os.homedir(), 'abc'));
  assert.equal(expandHome('relative/path'), 'relative/path');
});
