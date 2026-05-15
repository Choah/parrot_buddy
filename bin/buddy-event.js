#!/usr/bin/env node
const http = require('node:http');

const PORT = Number(process.env.PARROT_BUDDY_PORT || 17872);

function postJson(pathname, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        method: 'POST',
        path: pathname,
        timeout: 450,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

async function main() {
  const [action, id, ...rest] = process.argv.slice(2);
  if (!action || !id) process.exit(2);

  if (action === 'start') {
    const [label, command, cwd] = rest;
    await postJson('/task/start', {
      id,
      label: label || command || 'Terminal command',
      source: 'terminal',
      command: command || '',
      cwd: cwd || process.cwd(),
      startedAt: new Date().toISOString()
    });
    return;
  }

  if (action === 'finish') {
    const exitCode = Number(rest[0] || 0);
    await postJson('/task/finish', {
      id,
      status: exitCode === 0 ? 'success' : 'failed',
      exitCode,
      finishedAt: new Date().toISOString()
    });
    return;
  }

  process.exit(2);
}

main();

