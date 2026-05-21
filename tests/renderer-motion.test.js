const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parrotClassNames, parrotStatus, parrotWingActive } = require('../src/renderer/status');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

test('dragging the bird enables a wing-flap motion state', () => {
  assert.match(appSource, /function startBirdDragAnimation\(\)/);
  assert.match(appSource, /parrot\.classList\.add\('moving'\)/);
  assert.match(
    appSource,
    /if \(!birdDrag\.moved\) \{\s+birdDrag\.moved = true;\s+startBirdDragAnimation\(\);\s+\}\s+window\.buddy\.windowAction\(\{ type: 'move-by'/
  );
  assert.match(appSource, /function stopBirdDragAnimation\(\)/);
  assert.match(appSource, /parrot\.classList\.remove\('moving'\)/);
  assert.match(stylesSource, /\.lovebird\.moving \.wing\s*\{[^}]*animation:\s*wing-flap/s);
});

test('running Codex work uses the running bird animation without the gentle wing override', () => {
  const snapshot = {
    tasks: [{ source: 'agent', label: 'Codex: app #turn', status: 'running' }]
  };

  assert.deepEqual(parrotClassNames(snapshot), ['running']);
  assert.equal(parrotWingActive(snapshot), false);
});

test('running work keeps priority over a waiting Codex wing state', () => {
  const snapshot = {
    tasks: [
      { source: 'agent', label: 'Claude: app', status: 'running' },
      { source: 'agent', label: 'Codex Terminal: app', status: 'waiting' }
    ]
  };

  assert.deepEqual(parrotClassNames(snapshot), ['running']);
  assert.equal(parrotWingActive(snapshot), true);
});

test('waiting Codex process keeps the bird wing gently moving', () => {
  const snapshot = {
    tasks: [{ source: 'agent', label: 'Codex Terminal: app', status: 'waiting' }]
  };

  assert.deepEqual(parrotClassNames(snapshot), ['success', 'wing-active']);
  assert.equal(parrotWingActive(snapshot), true);
  assert.match(stylesSource, /\.lovebird\.wing-active \.wing\s*\{[^}]*animation:\s*wing-wiggle/s);
});

test('waiting non-Codex agents do not trigger Codex wing motion', () => {
  const snapshot = {
    tasks: [{ source: 'agent', label: 'Claude: app', status: 'waiting' }]
  };

  assert.deepEqual(parrotClassNames(snapshot), ['success']);
  assert.equal(parrotWingActive(snapshot), false);
});

test('failed agent status reaches the failed parrot state', () => {
  const snapshot = {
    tasks: [{ source: 'agent', label: 'Codex: app #turn', status: 'failed' }]
  };

  assert.equal(parrotStatus(snapshot), 'failed');
  assert.deepEqual(parrotClassNames(snapshot), ['failed']);
});
