const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIRD_CHIRP = path.join(__dirname, '..', 'assets', 'budgerigar-chirp.caf');

const SOUNDS = {
  success: BIRD_CHIRP,
  failed: BIRD_CHIRP,
  stopped: BIRD_CHIRP,
  hitl: BIRD_CHIRP
};

const FALLBACK_SOUNDS = {
  success: '/System/Library/Sounds/Glass.aiff',
  failed: '/System/Library/Sounds/Basso.aiff',
  stopped: '/System/Library/Sounds/Funk.aiff',
  hitl: '/System/Library/Sounds/Ping.aiff'
};

const COMPLETION_SOUND_OPTIONS = { repeats: 2, delayMs: 210 };
const ATTENTION_SOUND_OPTIONS = { repeats: 1, delayMs: 170 };
const BIRD_CHIRP_DURATION_MS = 820;
const SOUND_QUEUE_GAP_MS = 360;
let nextSoundStartAt = 0;

function soundPathForStatus(status = 'success') {
  const preferred = SOUNDS[status] || SOUNDS.success;
  if (fs.existsSync(preferred)) return preferred;

  const fallback = FALLBACK_SOUNDS[status] || FALLBACK_SOUNDS.success;
  return fs.existsSync(fallback) ? fallback : null;
}

function soundArgsForStatus(status = 'success') {
  const soundPath = soundPathForStatus(status);
  if (!soundPath) return null;

  if (soundPath === BIRD_CHIRP) {
    return ['--volume', '0.58', '--time', '0.82', soundPath];
  }

  return [soundPath];
}

function soundEventDurationMs({ repeats = 1, delayMs = 190 } = {}) {
  return Math.max(0, repeats - 1) * delayMs + BIRD_CHIRP_DURATION_MS;
}

function reserveSoundSlot(options = {}, nowMs = Date.now()) {
  const startAt = Math.max(nowMs, nextSoundStartAt);
  nextSoundStartAt = startAt + soundEventDurationMs(options) + SOUND_QUEUE_GAP_MS;
  return Math.max(0, startAt - nowMs);
}

function resetSoundQueueForTests() {
  nextSoundStartAt = 0;
}

function playSound(status = 'success', { repeats = 1, delayMs = 190 } = {}) {
  const startDelayMs = reserveSoundSlot({ repeats, delayMs });

  if (os.platform() !== 'darwin') {
    for (let index = 0; index < repeats; index += 1) {
      setTimeout(() => {
        process.stdout.write('\u0007');
      }, startDelayMs + index * delayMs);
    }
    return;
  }

  const args = soundArgsForStatus(status);
  if (!args) {
    for (let index = 0; index < repeats; index += 1) {
      setTimeout(() => {
        process.stdout.write('\u0007');
      }, startDelayMs + index * delayMs);
    }
    return;
  }

  for (let index = 0; index < repeats; index += 1) {
    setTimeout(() => {
      execFile('/usr/bin/afplay', args, { windowsHide: true }, () => {});
    }, startDelayMs + index * delayMs);
  }
}

function playCompletionSound(status = 'success') {
  playSound(status, COMPLETION_SOUND_OPTIONS);
}

function playAttentionSound(status = 'hitl') {
  playSound(status, ATTENTION_SOUND_OPTIONS);
}

module.exports = {
  playAttentionSound,
  playCompletionSound,
  ATTENTION_SOUND_OPTIONS,
  BIRD_CHIRP_DURATION_MS,
  COMPLETION_SOUND_OPTIONS,
  SOUND_QUEUE_GAP_MS,
  reserveSoundSlot,
  resetSoundQueueForTests,
  soundEventDurationMs,
  soundArgsForStatus,
  soundPathForStatus
};
