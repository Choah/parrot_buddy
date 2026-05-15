const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { soundArgsForStatus, soundPathForStatus } = require('../src/sound');

const chirpPath = path.join(__dirname, '..', 'assets', 'budgerigar-chirp.caf');

test('uses the bundled budgerigar chirp for completion sounds', () => {
  assert.equal(fs.existsSync(chirpPath), true);
  assert.equal(soundPathForStatus('success'), chirpPath);
  assert.equal(soundPathForStatus('failed'), chirpPath);
  assert.equal(soundPathForStatus('stopped'), chirpPath);
  assert.equal(soundPathForStatus('hitl'), chirpPath);
});

test('keeps the repeated chirp short and quiet enough for agent alerts', () => {
  const args = soundArgsForStatus('success');
  assert.deepEqual(args.slice(0, 4), ['--volume', '0.58', '--time', '0.82']);
  assert.equal(args[4], chirpPath);
});
