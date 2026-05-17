const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AssistantStore, formatDateKey } = require('../src/assistant/assistant-store');
const { ReminderStore } = require('../src/assistant/reminder-store');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parrot-assistant-'));
}

test('formats local date keys with timezone', () => {
  const date = new Date('2026-05-16T16:30:00.000Z');
  assert.equal(formatDateKey(date, 'Asia/Seoul'), '2026-05-17');
});

test('refuses paths outside the assistant root', () => {
  const store = new AssistantStore({ root: tempRoot() });
  assert.throws(() => {
    store.resolve('../outside.md');
  }, /outside assistant root/);
});

test('applies assistant action to daily history and reminders', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminders = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  const now = new Date('2026-05-17T03:00:00.000Z');

  const result = store.applyAction({
    reply: '저장했어요.',
    history_patch: {
      date: '2026-05-17',
      summary_lines: ['README 정리와 릴리즈 준비'],
      tasks: ['README 정리'],
      events: ['5월 18일 결과 확인']
    },
    reminders_to_create: [{
      title: '결과 확인',
      dueAt: '2026-05-18T00:00:00.000Z',
      timezone: 'Asia/Seoul'
    }]
  }, {
    userMessage: '오늘 README 정리했고 내일 결과 확인',
    reminderStore: reminders,
    now
  });

  assert.deepEqual(result.changedFiles.sort(), [
    'history/2026-05-17.md',
    'history/latest.md',
    'reminders.json'
  ].sort());
  assert.match(fs.readFileSync(path.join(root, 'history', '2026-05-17.md'), 'utf8'), /README 정리/);
  assert.equal(reminders.list().length, 1);
  assert.equal(reminders.list()[0].title, '결과 확인');
});

test('creates local assistant instructions for Codex and Claude contexts', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  store.ensureBase();

  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /Joy/);
  assert.match(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), /조이/);
});

test('creates the full local assistant workspace when missing', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  store.ensureBase();

  assert.ok(fs.statSync(path.join(root, 'history')).isDirectory());
  assert.ok(fs.statSync(path.join(root, 'sessions')).isDirectory());
  assert.ok(fs.statSync(path.join(root, 'thoughts')).isDirectory());
  assert.ok(fs.existsSync(path.join(root, 'memory.md')));
  assert.ok(fs.existsSync(path.join(root, 'inbox.md')));
  assert.ok(fs.existsSync(path.join(root, 'reminders.json')));
  assert.ok(fs.existsSync(path.join(root, 'settings.json')));
});

test('loads recent history newest first for recall context', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  store.ensureBase();
  fs.writeFileSync(path.join(root, 'history', '2026-05-15.md'), '# old\n', 'utf8');
  fs.writeFileSync(path.join(root, 'history', '2026-05-16.md'), '# newer\n', 'utf8');

  const context = store.loadContext(new Date('2026-05-17T03:00:00.000Z'));
  assert.equal(context.recentHistory[0].path, 'history/2026-05-16.md');
  assert.equal(context.recentHistory[1].path, 'history/2026-05-15.md');
});

test('skips daily history writes for recall-only actions', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminders = new ReminderStore({ root, timezone: 'Asia/Seoul' });

  const result = store.applyAction({
    reply: '오늘 요약입니다.',
    history_patch: { save: false },
    reminders_to_create: []
  }, {
    userMessage: '오늘 정리해줘',
    reminderStore: reminders,
    now: new Date('2026-05-17T03:00:00.000Z')
  });

  assert.deepEqual(result.changedFiles, []);
});

test('skips daily history writes for greetings and small talk', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminders = new ReminderStore({ root, timezone: 'Asia/Seoul' });

  const result = store.applyAction({
    reply: '안녕하세요.',
    history_patch: { save: false },
    reminders_to_create: []
  }, {
    userMessage: '안녕?',
    reminderStore: reminders,
    now: new Date('2026-05-17T03:00:00.000Z')
  });

  assert.deepEqual(result.changedFiles, []);
});

test('builds daily Joy thoughts from memory and recent sessions', () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const now = new Date('2026-05-18T03:00:00.123Z');
  store.ensureBase();
  fs.appendFileSync(
    path.join(root, 'memory.md'),
    '\n- 사용자는 스파게티를 좋아한다.\n',
    'utf8'
  );
  store.writeSession({
    userMessage: '내일 병원 예약 챙겨줘',
    codexAvailable: true,
    route: { intent: 'schedule' },
    action: { reply: '챙겨둘게요.' },
    result: {},
    now
  });

  const bank = store.dailyThoughtBank(now);
  const joined = bank.thoughts.join('\n');

  assert.equal(bank.dateKey, '2026-05-18');
  assert.equal(bank.thoughts.length, 30);
  assert.match(joined, /스파게티/);
  assert.match(joined, /병원 예약/);
  assert.ok(fs.existsSync(path.join(root, 'thoughts', '2026-05-18.json')));
});
