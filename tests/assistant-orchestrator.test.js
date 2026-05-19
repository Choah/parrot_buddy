const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AssistantStore } = require('../src/assistant/assistant-store');
const { ReminderStore } = require('../src/assistant/reminder-store');
const { AssistantOrchestrator, isCasualMessage } = require('../src/assistant/assistant-orchestrator');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parrot-orchestrator-'));
}

test('orchestrator saves fake Codex result to local files', async () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminderStore = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  const codexAdapter = {
    runAssistantTurn: async () => ({
      reply: '저장했어요.',
      route: {
        intent: 'task',
        save_required: true,
        confidence: 'high',
        reason: 'user asked to record implementation work'
      },
      history_patch: {
        date: '2026-05-17',
        summary_lines: ['앵무새 개인비서 구현 시작'],
        tasks: ['assistant UI 연결']
      },
      memory_patch: {},
      reminders_to_create: [{
        title: 'assistant UI 확인',
        dueAt: '2026-05-18T00:00:00.000Z',
        timezone: 'Asia/Seoul'
      }],
      reminders_to_update: [],
      clarifying_question: null,
      confidence: 'high'
    })
  };

  const orchestrator = new AssistantOrchestrator({ store, reminderStore, codexAdapter });
  const result = await orchestrator.handleMessage('오늘 앵무새 개인비서 구현 시작 기록해 둬', {
    now: new Date('2026-05-17T01:00:00.000Z')
  });

  assert.equal(result.ok, true);
  assert.equal(result.reminders.length, 1);
  assert.match(fs.readFileSync(path.join(root, 'history', '2026-05-17.md'), 'utf8'), /개인비서/);
});

test('orchestrator answers obvious casual greetings locally without saving', async () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminderStore = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  const codexAdapter = {
    runAssistantTurn: async () => {
      throw new Error('Codex should not be called for obvious casual greetings');
    }
  };

  const orchestrator = new AssistantOrchestrator({ store, reminderStore, codexAdapter });
  const result = await orchestrator.handleMessage('안녕?', {
    now: new Date('2026-05-17T01:00:00.000Z')
  });

  assert.equal(isCasualMessage('안녕?'), true);
  assert.equal(result.ok, true);
  assert.equal(result.casual, true);
  assert.equal(result.route.intent, 'chat');
  assert.equal(result.route.saveRequired, false);
  assert.equal(result.route.needsCodex, false);
  assert.equal(result.reminders.length, 0);
  assert.deepEqual(result.changedFiles, []);
  assert.match(result.reply, /조이/);
  assert.doesNotMatch(result.reply, /대충|귀찮/);
});

test('orchestrator uses saved warm tsundere persona preferences for fast casual greetings', async () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  store.ensureBase();
  fs.appendFileSync(
    path.join(root, 'memory.md'),
    '\n- 조이 페르소나는 차갑지만 알고 보면 따뜻하고 착한 츤데레에 가깝게 유지한다.\n',
    'utf8'
  );
  const reminderStore = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  const codexAdapter = {
    runAssistantTurn: async () => {
      throw new Error('Codex should not be called for obvious casual greetings');
    }
  };

  const orchestrator = new AssistantOrchestrator({ store, reminderStore, codexAdapter });
  const result = await orchestrator.handleMessage('안녕?', {
    now: new Date('2026-05-17T01:00:00.000Z')
  });

  assert.equal(result.ok, true);
  assert.equal(result.casual, true);
  assert.match(result.reply, /별일|봐드릴게요/);
  assert.doesNotMatch(result.reply, /으응|천천히|기다린|대충|귀찮/);
});

test('orchestrator blocks writes for chat routes even if Codex proposes them', async () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminderStore = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  const codexAdapter = {
    runAssistantTurn: async () => ({
      reply: '저장 안 하고 답만 할게요.',
      route: {
        intent: 'chat',
        save_required: false,
        confidence: 'high',
        reason: 'ordinary chat'
      },
      history_patch: {
        save: true,
        date: '2026-05-17',
        summary_lines: ['잡담인데 저장하면 안 됨']
      },
      memory_patch: { add: ['잡담 저장 금지'] },
      reminders_to_create: [{
        title: '잡담 저장 금지',
        dueAt: '2026-05-18T00:00:00.000Z',
        timezone: 'Asia/Seoul'
      }],
      reminders_to_update: [],
      clarifying_question: null,
      confidence: 'high'
    })
  };

  const orchestrator = new AssistantOrchestrator({ store, reminderStore, codexAdapter });
  const result = await orchestrator.handleMessage('조이야 너는 뭐 할 수 있는지 아주 짧게 설명해줘. 그냥 일반 대화로 답해줘', {
    now: new Date('2026-05-17T01:00:00.000Z')
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.saveRequired, false);
  assert.deepEqual(result.reminders, []);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'memory.md'), 'utf8'), /잡담 저장 금지/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'history', '2026-05-17.md'), 'utf8'), /잡담인데 저장하면 안 됨/);
});

test('routes memory statements through Codex for storage', async () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminderStore = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  const codexAdapter = {
    runAssistantTurn: async () => ({
      route: {
        intent: 'memory',
        save_required: true,
        confidence: 'high',
        reason: 'durable user preference'
      },
      reply: '기억해둘게요.',
      history_patch: { save: false },
      memory_patch: { add: ['사용자는 스파게티를 좋아한다.'] },
      reminders_to_create: [],
      reminders_to_update: [],
      clarifying_question: null,
      confidence: 'high'
    })
  };

  const orchestrator = new AssistantOrchestrator({ store, reminderStore, codexAdapter });
  const result = await orchestrator.handleMessage('나는 스파게티 좋아해. 이거 기억해', {
    now: new Date('2026-05-17T01:00:00.000Z')
  });

  assert.equal(result.route.intent, 'memory');
  assert.equal(result.route.saveRequired, true);
  assert.match(fs.readFileSync(path.join(root, 'memory.md'), 'utf8'), /스파게티/);
});

test('orchestrator runs memory maintenance when due', async () => {
  const root = tempRoot();
  const store = new AssistantStore({ root, timezone: 'Asia/Seoul' });
  const reminderStore = new ReminderStore({ root, timezone: 'Asia/Seoul' });
  store.ensureBase();
  fs.writeFileSync(
    path.join(root, 'memory.md'),
    [
      '# Parrot Buddy Memory',
      '',
      ...Array.from({ length: 36 }, (_, index) => (
        `- 중복 메모 ${index}: 사용자는 조이 Assistant 답변을 짧고 이해하기 쉽게 다듬는 것을 선호한다.`
      ))
    ].join('\n'),
    'utf8'
  );
  const codexAdapter = {
    runMemoryMaintenance: async ({ context }) => {
      assert.match(context.memory, /중복 메모/);
      return {
        memory: [
          '# Parrot Buddy Memory',
          '',
          '## 사용자',
          '- 사용자는 조이 Assistant 답변을 짧고 이해하기 쉽게 다듬는 것을 선호한다.',
          '- 사용자는 앵무새 말풍선과 Assistant 대화창이 함께 최신 답변을 보여주길 원한다.',
          '- 사용자는 작업 상태와 알림 문구에서 내부 해시 대신 간단한 번호를 선호한다.',
          '- 사용자는 window size UI가 작업 상태 박스 조절을 방해하지 않길 원한다.',
          '- 사용자는 오래 남길 정보만 유지하고 일회성 중복 기록은 정리하길 원한다.',
          '',
          '## 조이 / Assistant 선호',
          '- 조이는 겉으로는 차갑지만 따뜻한 츤데레 톤을 유지한다.',
          '- 답변은 한국어로 간결하게 한다.'
        ].join('\n'),
        summary: '중복 메모를 장기 선호로 합쳤다.',
        removed: ['반복된 Assistant 답변 선호 기록']
      };
    }
  };
  const orchestrator = new AssistantOrchestrator({ store, reminderStore, codexAdapter });

  const result = await orchestrator.runMemoryMaintenance({
    now: new Date('2026-05-19T03:00:00.000Z'),
    force: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.summary, '중복 메모를 장기 선호로 합쳤다.');
  assert.match(fs.readFileSync(path.join(root, 'memory.md'), 'utf8'), /오래 남길 정보/);
  assert.ok(fs.existsSync(path.join(root, 'memory-maintenance.json')));
});
