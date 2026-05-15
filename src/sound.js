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

function playSound(status = 'success', { repeats = 1, delayMs = 190 } = {}) {
  if (os.platform() !== 'darwin') {
    process.stdout.write('\u0007');
    return;
  }

  const args = soundArgsForStatus(status);
  if (!args) {
    process.stdout.write('\u0007');
    return;
  }

  for (let index = 0; index < repeats; index += 1) {
    setTimeout(() => {
      execFile('/usr/bin/afplay', args, { windowsHide: true }, () => {});
    }, index * delayMs);
  }
}

function playCompletionSound(status = 'success') {
  playSound(status, { repeats: 2, delayMs: 210 });
}

function playAttentionSound(status = 'hitl') {
  playSound(status, { repeats: 2, delayMs: 170 });
}

module.exports = {
  playAttentionSound,
  playCompletionSound,
  soundArgsForStatus,
  soundPathForStatus
};
