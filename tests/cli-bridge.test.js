const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { TaskStore } = require('../src/task-store');
const { createApiServer } = require('../src/api-server');

function runBuddy(port, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'buddy-run.js'), ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PARROT_BUDDY_PORT: String(port)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code, stderr });
    });
  });
}

test('buddy-run reports task lifecycle to the localhost bridge', async () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const store = new TaskStore();
  const api = createApiServer({ store, port });

  await api.start();
  try {
    const result = await runBuddy(port, [
      '--label',
      'Bridge pass',
      '--source',
      'vscode',
      '--',
      process.execPath,
      '-e',
      'setTimeout(()=>process.exit(0), 50)'
    ]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');

    const tasks = store.getTasks();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].label, 'Bridge pass');
    assert.equal(tasks[0].source, 'vscode');
    assert.equal(tasks[0].status, 'success');
    assert.equal(tasks[0].exitCode, 0);
  } finally {
    await api.stop();
  }
});

