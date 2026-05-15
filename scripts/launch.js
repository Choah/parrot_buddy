#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const pidPath = path.join(appDir, '.parrot-buddy.pid');
const logPath = '/tmp/parrot-buddy.log';
const port = Number(process.env.PARROT_BUDDY_PORT || 17872);

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
        timeout: 500
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForHealth() {
  for (let index = 0; index < 20; index += 1) {
    if (await healthCheck()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function main() {
  const existingPid = fs.existsSync(pidPath) ? Number(fs.readFileSync(pidPath, 'utf8')) : null;
  if (isRunning(existingPid) && await healthCheck()) {
    console.log(`Parrot Buddy is already running. pid=${existingPid}`);
    return;
  }

  const electronPath = require('electron');
  const out = fs.openSync(logPath, 'a');
  const child = spawn(electronPath, [appDir], {
    cwd: appDir,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env
  });

  child.unref();
  fs.writeFileSync(pidPath, String(child.pid));

  if (await waitForHealth()) {
    console.log(`Parrot Buddy launched. pid=${child.pid}`);
    console.log(`Log: ${logPath}`);
    return;
  }

  console.error(`Parrot Buddy did not become ready. Check ${logPath}`);
  process.exit(1);
}

main();

