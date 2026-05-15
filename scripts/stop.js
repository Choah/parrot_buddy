#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const pidPath = path.join(appDir, '.parrot-buddy.pid');

function main() {
  if (!fs.existsSync(pidPath)) {
    console.log('Parrot Buddy pid file was not found.');
    return;
  }

  const pid = Number(fs.readFileSync(pidPath, 'utf8'));
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Parrot Buddy stopped. pid=${pid}`);
  } catch (error) {
    console.log(`Parrot Buddy was not running. pid=${pid}`);
  }

  fs.rmSync(pidPath, { force: true });
}

main();

