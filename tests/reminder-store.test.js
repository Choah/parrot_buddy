const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ReminderStore } = require('../src/assistant/reminder-store');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parrot-reminders-'));
}

test('detects due reminders once and marks them notified', () => {
  const root = tempRoot();
  const store = new ReminderStore({ root });
  const [created] = store.createMany([{
    title: 'Check result',
    dueAt: '2026-05-17T00:00:00.000Z'
  }], {
    now: new Date('2026-05-16T00:00:00.000Z')
  });

  assert.equal(store.dueReminders(new Date('2026-05-16T23:59:00.000Z')).length, 0);
  assert.equal(store.dueReminders(new Date('2026-05-17T00:00:00.000Z')).length, 1);

  store.markNotified(created.id, new Date('2026-05-17T00:01:00.000Z'));
  assert.equal(store.dueReminders(new Date('2026-05-17T00:02:00.000Z')).length, 0);
});
