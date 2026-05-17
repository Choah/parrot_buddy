const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceActionRoute, normalizeAssistantRoute } = require('../src/assistant/assistant-router');

test('normalizes LLM route output', () => {
  const route = normalizeAssistantRoute({
    intent: 'MEMORY',
    save_required: true,
    confidence: 'HIGH',
    reason: 'personal preference'
  });

  assert.deepEqual(route, {
    intent: 'memory',
    saveRequired: true,
    needsCodex: true,
    confidence: 'high',
    reason: 'personal preference'
  });
});

test('falls back to non-saving chat for malformed LLM route output', () => {
  const route = normalizeAssistantRoute({
    intent: 'unknown',
    save_required: false,
    confidence: 'certain'
  });

  assert.equal(route.intent, 'chat');
  assert.equal(route.saveRequired, false);
  assert.equal(route.confidence, 'medium');
});

test('prevents non-save LLM routes from writing memory or reminders', () => {
  const action = enforceActionRoute({
    reply: '알겠어요.',
    route: {
      intent: 'chat',
      save_required: false,
      confidence: 'high',
      reason: 'ordinary chat'
    },
    history_patch: {
      save: true,
      summary_lines: ['should not save']
    },
    memory_patch: {
      add: ['should not save']
    },
    reminders_to_create: [{ title: 'bad', dueAt: '2026-05-18T00:00:00.000Z' }],
    reminders_to_update: [],
    clarifying_question: '저장할까요?'
  }, {
    intent: 'chat',
    saveRequired: false,
    confidence: 'high',
    reason: 'ordinary chat'
  });

  assert.equal(action.history_patch.save, false);
  assert.deepEqual(action.memory_patch.add, []);
  assert.deepEqual(action.reminders_to_create, []);
  assert.equal(action.clarifying_question, null);
});

test('allows save-required LLM routes to write durable fields', () => {
  const action = enforceActionRoute({
    reply: '기억해둘게요.',
    memory_patch: {
      add: ['사용자는 스파게티를 좋아한다.']
    },
    reminders_to_create: []
  }, {
    intent: 'memory',
    saveRequired: true,
    confidence: 'high',
    reason: 'durable user preference'
  });

  assert.equal(action.route.intent, 'memory');
  assert.equal(action.route.save_required, true);
  assert.deepEqual(action.memory_patch.add, ['사용자는 스파게티를 좋아한다.']);
});
