const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ATTENTION_SOUND_OPTIONS,
  BIRD_CHIRP_DURATION_MS,
  COMPLETION_SOUND_OPTIONS,
  SOUND_QUEUE_GAP_MS,
  reserveSoundSlot,
  resetSoundQueueForTests,
  soundEventDurationMs,
  soundArgsForStatus,
  soundPathForStatus
} = require('../src/sound');

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

test('uses two chirps for completion and one chirp for attention', () => {
  assert.deepEqual(COMPLETION_SOUND_OPTIONS, { repeats: 2, delayMs: 210 });
  assert.deepEqual(ATTENTION_SOUND_OPTIONS, { repeats: 1, delayMs: 170 });
});

test('queues overlapping alert sounds so simultaneous completions remain audible', () => {
  resetSoundQueueForTests();
  const now = Date.now();
  const completionDuration = soundEventDurationMs(COMPLETION_SOUND_OPTIONS);

  assert.equal(completionDuration, BIRD_CHIRP_DURATION_MS + COMPLETION_SOUND_OPTIONS.delayMs);
  assert.equal(reserveSoundSlot(COMPLETION_SOUND_OPTIONS, now), 0);
  assert.equal(
    reserveSoundSlot(COMPLETION_SOUND_OPTIONS, now),
    completionDuration + SOUND_QUEUE_GAP_MS
  );

  resetSoundQueueForTests();
});
