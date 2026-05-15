#!/usr/bin/env node
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.PARROT_BUDDY_PORT || 17872);

function usage() {
  console.log(`Usage:
  buddy-run [--label "Name"] [--source cli|vscode] [--cwd /path] -- <command>

Examples:
  node bin/buddy-run.js --label "Tests" -- npm test
  node bin/buddy-run.js --source vscode --label "Build" -- npm run build
`);
}

function parseArgs(argv) {
  const delimiter = argv.indexOf('--');
  if (delimiter === -1 || delimiter === argv.length - 1) {
    usage();
    process.exit(2);
  }

  const options = argv.slice(0, delimiter);
  const commandArgs = argv.slice(delimiter + 1);
  const parsed = {
    label: '',
    source: 'cli',
    cwd: process.cwd(),
    command: commandArgs.join(' '),
    commandArgs
  };

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = options[index + 1];

    if (option === '--label') {
      parsed.label = value || '';
      index += 1;
    } else if (option === '--source') {
      parsed.source = value || 'cli';
      index += 1;
    } else if (option === '--cwd') {
      parsed.cwd = path.resolve(value || process.cwd());
      index += 1;
    } else if (option === '--help' || option === '-h') {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown option: ${option}`);
      usage();
      process.exit(2);
    }
  }

  if (!parsed.label) parsed.label = parsed.command;
  return parsed;
}

function postJson(pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        method: 'POST',
        path: pathname,
        timeout: 600,
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

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Parrot Buddy bridge timed out'));
    });
    req.write(body);
    req.end();
  });
}

function playFallbackSound(status) {
  if (os.platform() !== 'darwin') {
    process.stdout.write('\u0007');
    return;
  }

  const soundPath = status === 'success'
    ? '/System/Library/Sounds/Glass.aiff'
    : '/System/Library/Sounds/Basso.aiff';

  if (!fs.existsSync(soundPath)) {
    process.stdout.write('\u0007');
    return;
  }

  execFile('/usr/bin/afplay', [soundPath], () => {});
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const id = `cli-${crypto.randomBytes(6).toString('hex')}`;

  let connected = false;
  try {
    connected = await postJson('/task/start', {
      id,
      label: options.label,
      source: options.source,
      command: options.command,
      startedAt: new Date().toISOString()
    });
  } catch {
    connected = false;
  }

  if (!connected) {
    console.warn('Parrot Buddy is not running; command will still execute.');
  }

  const child = spawn(options.commandArgs[0], options.commandArgs.slice(1), {
    cwd: options.cwd,
    stdio: 'inherit',
    env: process.env
  });

  child.on('error', async (error) => {
    console.error(error.message);
    if (connected) {
      await postJson('/task/finish', {
        id,
        status: 'failed',
        exitCode: 1,
        finishedAt: new Date().toISOString()
      }).catch(() => {});
    } else {
      playFallbackSound('failed');
    }
    process.exit(1);
  });

  child.on('exit', async (code, signal) => {
    const status = signal ? 'stopped' : code === 0 ? 'success' : 'failed';
    if (connected) {
      await postJson('/task/finish', {
        id,
        status,
        exitCode: Number.isInteger(code) ? code : null,
        finishedAt: new Date().toISOString()
      }).catch(() => {
        playFallbackSound(status);
      });
    } else {
      playFallbackSound(status);
    }
    process.exit(Number.isInteger(code) ? code : 1);
  });
}

main();
