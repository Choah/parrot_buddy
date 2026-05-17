const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CodexAdapter,
  buildAssistantPrompt,
  extractJson,
  validateAction
} = require('../src/assistant/codex-adapter');

test('extracts JSON from fenced Codex output', () => {
  const parsed = extractJson('```json\n{"reply":"ok"}\n```');
  assert.equal(parsed.reply, 'ok');
});

test('validates assistant action defaults', () => {
  const action = validateAction({ reply: '저장했어요.' });
  assert.deepEqual(action.reminders_to_create, []);
  assert.equal(action.confidence, 'medium');
  assert.equal(action.route.intent, 'chat');
  assert.equal(action.route.save_required, false);
});

test('builds prompt with local context', () => {
  const prompt = buildAssistantPrompt({
    message: '오늘 한 일 정리',
    now: new Date('2026-05-17T00:00:00.000Z'),
    context: {
      dateKey: '2026-05-17',
      timezone: 'Asia/Seoul',
      reminders: [],
      memory: 'likes concise notes',
      todayHistory: '# 2026-05-17',
      inbox: ''
    }
  });

  assert.match(prompt, /Return JSON only/);
  assert.match(prompt, /조이/);
  assert.match(prompt, /tsundere/);
  assert.match(prompt, /router and the assistant/);
  assert.match(prompt, /chat\|recall\|memory\|schedule\|task\|note/);
  assert.match(prompt, /오늘 한 일 정리/);
  assert.match(prompt, /Asia\/Seoul/);
});

test('CodexAdapter uses injected runner and output file', async () => {
  const adapter = new CodexAdapter({
    command: 'codex',
    runner: async ({ args }) => {
      const outputIndex = args.indexOf('--output-last-message') + 1;
      const fs = require('node:fs');
      fs.writeFileSync(args[outputIndex], JSON.stringify({ reply: '저장했어요.' }), 'utf8');
      return { stdout: '', stderr: '' };
    }
  });

  const action = await adapter.runAssistantTurn({
    message: 'test',
    assistantRoot: process.cwd(),
    now: new Date('2026-05-17T00:00:00.000Z'),
    context: {
      dateKey: '2026-05-17',
      timezone: 'Asia/Seoul',
      reminders: [],
      memory: '',
      todayHistory: '',
      inbox: ''
    }
  });

  assert.equal(action.reply, '저장했어요.');
});
