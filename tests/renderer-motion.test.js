const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');

test('dragging the bird enables a wing-flap motion state', () => {
  assert.match(appSource, /function startBirdDragAnimation\(\)/);
  assert.match(appSource, /parrot\.classList\.add\('moving'\)/);
  assert.match(
    appSource,
    /birdDrag\.moved = true;\s+startBirdDragAnimation\(\);\s+window\.buddy\.windowAction\(\{ type: 'move-by'/
  );
  assert.match(appSource, /function stopBirdDragAnimation\(\)/);
  assert.match(appSource, /parrot\.classList\.remove\('moving'\)/);
  assert.match(stylesSource, /\.lovebird\.moving \.wing\s*\{[^}]*animation:\s*wing-flap/s);
});

test('active Codex monitoring keeps the bird wing gently moving', () => {
  assert.match(appSource, /function parrotWingActive\(snapshot\)/);
  assert.match(appSource, /isCodexTask\(task\) && task\.status === 'waiting'/);
  assert.match(appSource, /parrot\.classList\.remove\([^)]*'wing-active'/s);
  assert.match(appSource, /if \(parrotWingActive\(snapshot\)\) parrot\.classList\.add\('wing-active'\)/);
  assert.match(stylesSource, /\.lovebird\.wing-active \.wing\s*\{[^}]*animation:\s*wing-wiggle/s);
});
