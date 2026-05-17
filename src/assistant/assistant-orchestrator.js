const { EventEmitter } = require('node:events');
const { AssistantStore } = require('./assistant-store');
const { ReminderStore } = require('./reminder-store');
const { CodexAdapter, CodexUnavailableError } = require('./codex-adapter');
const { enforceActionRoute, normalizeAssistantRoute } = require('./assistant-router');

const CASUAL_MESSAGE_PATTERN = /^(안녕|안녕[?!.~]*|하이|hi|hello|헬로|뭐해[?!.~]*|조이야[?!.~]*|고마워[?!.~]*|땡큐|thanks?|nice to meet you[!.~]*|만나서 반가워[!.~]*)$/i;

function isCasualMessage(message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return text.length <= 40 && CASUAL_MESSAGE_PATTERN.test(text);
}

function prefersWarmTsundere(memoryText = '') {
  return /차갑|따뜻|착한|츤데레|덜\s*매정|매정하지|부드럽|상냥|나른|느슨|졸린|느긋/i.test(String(memoryText || ''));
}

function casualReply(message, { memory = '' } = {}) {
  const text = String(message || '').trim();
  const warmTsundere = prefersWarmTsundere(memory);
  if (/고마워|땡큐|thanks?/i.test(text)) {
    return warmTsundere
      ? '됐어요. 고맙다는 말은 넣어두고, 다음 것도 말해봐요. 제가 봐드릴게요.'
      : '됐어요. 이 정도는 당연하죠. 필요하면 또 불러요.';
  }
  if (/뭐해/i.test(text)) {
    return warmTsundere
      ? '주인님이 또 놓치는 거 없나 보고 있었죠. 걱정돼서라기보다... 제가 착해서요.'
      : '주인님 일정 놓치나 보고 있었죠. 딱히 걱정돼서 그러는 건 아니고요.';
  }
  if (warmTsundere) {
    return '조이 왔어요, 주인님. 별일 없죠? 뭐... 없어도 제가 한 번은 봐드릴게요.';
  }
  return '조이 왔어요, 주인님. 별일 없죠? 뭐... 없어도 제가 한 번은 봐드릴게요.';
}

class AssistantOrchestrator extends EventEmitter {
  constructor({
    store = new AssistantStore(),
    reminderStore = new ReminderStore({ root: store.root, timezone: store.timezone }),
    codexAdapter = new CodexAdapter()
  } = {}) {
    super();
    this.store = store;
    this.reminderStore = reminderStore;
    this.codexAdapter = codexAdapter;
    this.store.ensureBase();
  }

  snapshot(now = new Date()) {
    return {
      ok: true,
      root: this.store.root,
      timezone: this.store.timezone,
      upcoming: this.reminderStore.upcoming(12, now),
      due: this.reminderStore.dueReminders(now)
    };
  }

  async handleMessage(message, { now = new Date() } = {}) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
      return {
        ok: false,
        error: '메시지를 입력해 주세요.'
      };
    }

    if (isCasualMessage(trimmed)) {
      const memory = this.store.readText('memory.md', '');
      return {
        ok: true,
        reply: casualReply(trimmed, { memory }),
        route: {
          intent: 'chat',
          saveRequired: false,
          needsCodex: false,
          confidence: 'high',
          reason: 'local fast path for obvious small talk'
        },
        changedFiles: [],
        reminders: [],
        updatedReminders: [],
        needsConfirmation: false,
        casual: true,
        snapshot: this.snapshot(now)
      };
    }

    const context = this.store.loadContext(now, this.reminderStore);

    try {
      const action = await this.codexAdapter.runAssistantTurn({
        message: trimmed,
        context,
        assistantRoot: this.store.root,
        now
      });
      const route = normalizeAssistantRoute(action.route);
      const routedAction = enforceActionRoute(action, route);

      const applyResult = this.store.applyAction(routedAction, {
        userMessage: trimmed,
        reminderStore: this.reminderStore,
        now
      });

      const sessionPath = this.store.writeSession({
        userMessage: trimmed,
        codexAvailable: true,
        route,
        action: routedAction,
        result: applyResult,
        now
      });

      const result = {
        ok: true,
        reply: routedAction.reply,
        route,
        changedFiles: [...applyResult.changedFiles, sessionPath],
        reminders: applyResult.createdReminders,
        updatedReminders: applyResult.updatedReminders,
        needsConfirmation: applyResult.needsConfirmation,
        clarifyingQuestion: routedAction.clarifying_question || null,
        snapshot: this.snapshot(now)
      };
      this.emit('changed', result);
      return result;
    } catch (error) {
      const isCodex = error instanceof CodexUnavailableError;
      const result = {
        ok: false,
        setupRequired: isCodex,
        error: isCodex
          ? 'Codex CLI를 실행할 수 없어요. 터미널에서 `codex login`이 되어 있는지 확인해 주세요.'
          : error.message,
        details: isCodex ? error.details : undefined,
        snapshot: this.snapshot(now)
      };
      this.store.writeSession({
        userMessage: trimmed,
        codexAvailable: !isCodex,
        route: null,
        action: null,
        result,
        now
      });
      return result;
    }
  }

  collectDueReminders(now = new Date()) {
    const due = this.reminderStore.dueReminders(now);
    return due.map((reminder) => this.reminderStore.markNotified(reminder.id, now)).filter(Boolean);
  }

  markReminderDone(id, now = new Date()) {
    const reminder = this.reminderStore.markDone(id, now);
    if (reminder) this.emit('changed', this.snapshot(now));
    return reminder;
  }

  randomThought(now = new Date()) {
    return this.store.randomThought(now);
  }

  refreshThoughts(now = new Date()) {
    return this.store.dailyThoughtBank(now);
  }
}

module.exports = {
  AssistantOrchestrator,
  isCasualMessage,
  casualReply
};
