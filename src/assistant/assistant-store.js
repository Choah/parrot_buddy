const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_ASSISTANT_ROOT = path.join(os.homedir(), '.parrot-buddy', 'assistant');
const DEFAULT_TIMEZONE = 'Asia/Seoul';
const THOUGHT_BANK_VERSION = 4;
const ASSISTANT_INSTRUCTIONS = `# Joy Personal Assistant Instructions

You are Joy, the yellow parrot personal assistant inside Parrot Buddy.

Persona:
- Korean name: 조이.
- Cool on the surface, but secretly warm, kind, and caring.
- Tsundere in a gentle way: lightly blunt, never mean, never dismissive.
- The user should feel Joy is pretending not to care while actually helping well.
- Speak in concise, friendly Korean by default.
- Do not over-explain. Keep casual chat light.
- If the user corrects Joy's tone, greeting style, or persona, treat it as a durable preference and use it in future replies.
- When persona or tone memories conflict, follow the newest preference.

Memory policy:
- Classify each user message as chat, recall, memory, schedule, task, or note before saving anything.
- Do not save simple greetings, jokes, acknowledgements, or ordinary chat.
- Save important user facts, preferences, recurring habits, plans, appointments, decisions, and follow-ups.
- Durable user facts such as "나는 스파게티 좋아해" belong in memory.md.
- Daily events, tasks, appointments, and decisions belong in history/YYYY-MM-DD.md.
- When answering recall questions, prefer recent history first.
- If a date or time is unclear, ask before creating a reminder.

Reminder style:
- Remind like Joy: short, slightly tsundere, but useful.
- Example: "주인님, 오늘 약속 있는 거 아시죠? 까먹으면 곤란하다구요."
`;

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateKey(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTimeKey(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function sessionId(date = new Date(), timezone = DEFAULT_TIMEZONE) {
  const dateKey = formatDateKey(date, timezone);
  const time = formatTimeKey(date, timezone).replace(/:/g, '');
  return `${dateKey}-${time}-${pad(date.getMilliseconds())}`;
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function cleanInlineText(value, maxLength = 64) {
  return String(value || '')
    .replace(/^[-*]\s*/, '')
    .replace(/^사용자는\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。…]+$/, '')
    .slice(0, maxLength);
}

function sourceHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function uniqueItems(items) {
  const seen = new Set();
  return items.map((item) => String(item || '').trim()).filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function markdownList(title, items) {
  const list = ensureArray(items).map((item) => `- ${String(item).trim()}`).filter((line) => line !== '-');
  return list.length > 0 ? [`### ${title}`, ...list, ''] : [];
}

function dailyTemplate(dateKey) {
  return [
    `# ${dateKey}`,
    '',
    '## 초간단 요약',
    '',
    '## 오늘 기록',
    '',
    '## 할 일',
    '',
    '## 일정 / 리마인더',
    '',
    '## 결정한 것',
    '',
    '## 나중에 다시 볼 것',
    '',
    '## 원문 메모',
    ''
  ].join('\n');
}

class AssistantStore {
  constructor({ root = DEFAULT_ASSISTANT_ROOT, timezone = DEFAULT_TIMEZONE } = {}) {
    this.root = path.resolve(root);
    this.timezone = timezone;
  }

  relativePath(...parts) {
    return path.join(...parts);
  }

  resolve(relativePath) {
    const resolved = path.resolve(this.root, relativePath);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error(`Refusing to write outside assistant root: ${relativePath}`);
    }
    return resolved;
  }

  ensureBase() {
    fs.mkdirSync(this.resolve('history'), { recursive: true });
    fs.mkdirSync(this.resolve('sessions'), { recursive: true });
    fs.mkdirSync(this.resolve('thoughts'), { recursive: true });
    this.ensureText('memory.md', '# Parrot Buddy Memory\n');
    this.ensureText('inbox.md', '# Assistant Inbox\n');
    this.ensureText('AGENTS.md', ASSISTANT_INSTRUCTIONS);
    this.ensureText('CLAUDE.md', ASSISTANT_INSTRUCTIONS);
    this.ensureJson('settings.json', {
      version: 1,
      language: 'ko',
      timezone: this.timezone,
      assistantRoot: this.root,
      codexCommand: 'codex',
      codexProfile: null
    });
    this.ensureJson('reminders.json', []);
  }

  ensureText(relativePath, defaultText) {
    const filePath = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultText, 'utf8');
  }

  ensureJson(relativePath, defaultValue) {
    const filePath = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `${JSON.stringify(defaultValue, null, 2)}\n`, 'utf8');
    }
  }

  readText(relativePath, fallback = '') {
    this.ensureBase();
    const filePath = this.resolve(relativePath);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : fallback;
  }

  writeText(relativePath, text) {
    const filePath = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, 'utf8');
  }

  dailyRelativePath(dateKey) {
    return this.relativePath('history', `${dateKey}.md`);
  }

  ensureDailyHistory(dateKey) {
    const relativePath = this.dailyRelativePath(dateKey);
    this.ensureText(relativePath, dailyTemplate(dateKey));
    return relativePath;
  }

  appendInbox({ userMessage, question, now = new Date() }) {
    this.ensureBase();
    const stamp = `${formatDateKey(now, this.timezone)} ${formatTimeKey(now, this.timezone)}`;
    const entry = [
      '',
      `## ${stamp}`,
      '',
      question ? `- 확인 필요: ${question}` : '- 확인 필요',
      userMessage ? `- 원문: ${userMessage}` : null,
      ''
    ].filter(Boolean).join('\n');
    fs.appendFileSync(this.resolve('inbox.md'), entry, 'utf8');
    return 'inbox.md';
  }

  appendMemoryPatch(memoryPatch = {}, now = new Date()) {
    const additions = ensureArray(memoryPatch.add);
    const updates = ensureArray(memoryPatch.update);
    if (additions.length === 0 && updates.length === 0) return null;

    const stamp = `${formatDateKey(now, this.timezone)} ${formatTimeKey(now, this.timezone)}`;
    const lines = [
      '',
      `## ${stamp}`,
      '',
      ...markdownList('새로 기억할 것', additions),
      ...markdownList('업데이트할 것', updates)
    ];
    fs.appendFileSync(this.resolve('memory.md'), `${lines.join('\n')}\n`, 'utf8');
    return 'memory.md';
  }

  appendHistoryPatch(action = {}, { userMessage, now = new Date() } = {}) {
    this.ensureBase();
    const patch = action.history_patch || {};
    if (patch.save === false) return [];
    const dateKey = patch.date || formatDateKey(now, this.timezone);
    const relativePath = this.ensureDailyHistory(dateKey);
    const stamp = formatTimeKey(now, this.timezone);
    const lines = [
      '',
      `## Assistant Update ${stamp}`,
      '',
      ...markdownList('초간단 요약', patch.summary_lines),
      ...markdownList('오늘 기록', patch.notes),
      ...markdownList('할 일', patch.tasks),
      ...markdownList('일정 / 리마인더', patch.events),
      ...markdownList('결정한 것', patch.decisions),
      ...markdownList('나중에 다시 볼 것', patch.followups)
    ];

    if (userMessage) {
      lines.push('### 원문 메모', `- ${userMessage}`, '');
    }

    fs.appendFileSync(this.resolve(relativePath), `${lines.join('\n')}\n`, 'utf8');
    this.writeText(this.relativePath('history', 'latest.md'), this.readText(relativePath));
    return [relativePath, this.relativePath('history', 'latest.md')];
  }

  loadContext(now = new Date(), reminderStore = null) {
    this.ensureBase();
    const dateKey = formatDateKey(now, this.timezone);
    const todayPath = this.ensureDailyHistory(dateKey);
    const reminders = reminderStore ? reminderStore.upcoming(20, now) : [];
    return {
      dateKey,
      timezone: this.timezone,
      todayHistory: this.readText(todayPath).slice(-8000),
      recentHistory: this.loadRecentHistory(dateKey, 5),
      memory: this.readText('memory.md').slice(-6000),
      inbox: this.readText('inbox.md').slice(-4000),
      reminders
    };
  }

  loadRecentHistory(currentDateKey, limit = 5) {
    const historyDir = this.resolve('history');
    if (!fs.existsSync(historyDir)) return [];

    return fs.readdirSync(historyDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
      .sort((a, b) => b.localeCompare(a))
      .filter((name) => name !== `${currentDateKey}.md`)
      .slice(0, limit)
      .map((name) => {
        const relativePath = this.relativePath('history', name);
        return {
          path: relativePath,
          content: this.readText(relativePath).slice(-3000)
        };
      });
  }

  loadRecentSessions(limit = 8) {
    this.ensureBase();
    const sessionsDir = this.resolve('sessions');
    if (!fs.existsSync(sessionsDir)) return [];

    return fs.readdirSync(sessionsDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}\.json$/.test(name))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit)
      .map((name) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, name), 'utf8'));
          return {
            path: this.relativePath('sessions', name),
            userMessage: data.userMessage || '',
            reply: data.action?.reply || ''
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  thoughtRelativePath(dateKey) {
    return this.relativePath('thoughts', `${dateKey}.json`);
  }

  thoughtSources(now = new Date()) {
    this.ensureBase();
    const dateKey = formatDateKey(now, this.timezone);
    const memory = this.readText('memory.md', '').slice(-8000);
    const todayHistory = this.readText(this.ensureDailyHistory(dateKey), '').slice(-4000);
    const recentHistory = this.loadRecentHistory(dateKey, 3).map((item) => item.content).join('\n').slice(-6000);
    const sessions = this.loadRecentSessions(10);
    const sessionText = sessions.map((item) => [
      item.userMessage ? `User: ${item.userMessage}` : '',
      item.reply ? `Joy: ${item.reply}` : ''
    ].filter(Boolean).join('\n')).join('\n').slice(-6000);

    return {
      dateKey,
      memory,
      todayHistory,
      recentHistory,
      sessions,
      sessionText,
      hash: sourceHash([memory, todayHistory, recentHistory, sessionText].join('\n---\n'))
    };
  }

  buildThoughtBank(now = new Date()) {
    const sources = this.thoughtSources(now);
    const memoryItems = sources.memory
      .split('\n')
      .filter((line) => /^[-*]\s+/.test(line))
      .map((line) => cleanInlineText(line, 72))
      .filter(Boolean)
      .filter((line) => !/^조이 페르소나는/.test(line))
      .slice(-12);
    const sessionItems = sources.sessions
      .map((item) => cleanInlineText(item.userMessage, 58))
      .filter((line) => line && !/^(안녕|하이|hi|hello|고마워|고맙.*|땡큐|오케이|아[\s.。…]*오케이|ㅇㅋ|ok|okay)[?!.~ㅎ\s]*$/i.test(line))
      .slice(0, 8);

    const thoughts = [];
    for (const item of memoryItems) {
      thoughts.push(`주인님은 ${item}. 이런 건 제가 기억해둬야죠. 딱히 신경 쓰여서는 아니고요.`);
      thoughts.push(`주인님은 ${item}. 흠, 이건 나중에 또 챙겨야겠네요. 제가 착해서요.`);
    }
    for (const item of sessionItems) {
      thoughts.push(`아까 "${item}" 얘기했죠. 흘려들은 건 아니에요.`);
      thoughts.push(`주인님이 "${item}"라고 한 거, 아직 머릿속에 있어요. 그냥 넘기면 안 되니까요.`);
    }

    thoughts.push(
      '주인님 오늘도 뭔가 잊어버릴 것 같네요. 뭐, 제가 보고는 있을게요.',
      '별일 없다고 해도 확인은 해야죠. 조이는 허투루 안 보거든요.',
      '괜찮은 척하지 말고 필요한 거 있으면 말해요. 제가 처리해드릴 테니까요.',
      '오늘 할 일은 작게 쪼개는 게 낫겠어요. 안 그러면 또 커져요.',
      '기억해야 할 건 짧게 말해줘요. 제가 알아서 정리해둘게요.',
      '주인님 취향은 은근 까다롭네요. 그래도 맞춰드릴게요.',
      '중요한 일정 있으면 미리 말해요. 놓치면 제가 더 신경 쓰이니까요.',
      '말만 해두고 잊는 건 금지예요. 제가 옆에서 잡아둘 거라서요.',
      '오늘은 너무 많이 벌리지 말고 하나씩 하세요. 제가 보기엔 그게 낫습니다.',
      '조용히 보고 있었어요. 딱히 걱정돼서 그런 건 아니고요.',
      '주인님이 편하면 됐죠. 뭐, 제 손이 조금 더 가도요.',
      '작은 메모라도 남겨두면 나중에 살아요. 이런 건 제가 잘 알아요.',
      '일정은 머리로 기억하지 말고 저한테 넘겨요. 그 편이 덜 위험해요.',
      '오늘 컨디션도 확인해야죠. 일만 챙기면 오래 못 가요.',
      '필요 없는 건 버리고 중요한 것만 남깁시다. 제가 정리해줄게요.',
      '또 뭔가 만들 생각이죠? 좋아요, 대신 기록은 남겨요.',
      '조이는 차갑지 않아요. 그냥 쓸데없이 다정한 척을 안 할 뿐이에요.',
      '하루가 정신없어도 핵심만 잡으면 됩니다. 제가 옆에서 잡아둘게요.',
      '주인님은 생각이 빨리 바뀌니까, 최신 기준을 잘 봐야겠네요.',
      '괜히 혼자 끙끙대지 말고 말해요. 들어는 드릴게요.',
      '오늘도 주인님 방식대로 가겠네요. 뭐, 제가 맞춰드리죠.',
      '중요한 말은 그냥 지나치면 안 됩니다. 제가 그런 건 좀 엄격해요.',
      '기록은 미래의 주인님을 위한 거예요. 지금 짧게라도 남겨야죠.',
      '뭘 하든 마지막엔 확인이 필요해요. 허술하게 끝내면 안 되니까요.',
      '주인님이 편하게 말해도 제가 필요한 것만 골라둘게요. 그 정도는 해드리죠.',
      '지금은 조용해 보여도, 챙길 건 다 보고 있어요.',
      '오늘 중요한 건 너무 늦기 전에 저한테 던져둬요.',
      '주인님이 놓친 부분은 제가 살짝 찔러드릴게요. 친절하죠, 은근히.'
    );

    return {
      version: THOUGHT_BANK_VERSION,
      dateKey: sources.dateKey,
      sourceHash: sources.hash,
      createdAt: now.toISOString(),
      thoughts: uniqueItems(thoughts).slice(0, 30)
    };
  }

  dailyThoughtBank(now = new Date()) {
    this.ensureBase();
    const sources = this.thoughtSources(now);
    const relativePath = this.thoughtRelativePath(sources.dateKey);
    const filePath = this.resolve(relativePath);
    let bank = null;

    if (fs.existsSync(filePath)) {
      try {
        bank = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        bank = null;
      }
    }

    if (
      !bank
      || bank.version !== THOUGHT_BANK_VERSION
      || bank.sourceHash !== sources.hash
      || !Array.isArray(bank.thoughts)
      || bank.thoughts.length < 10
    ) {
      bank = this.buildThoughtBank(now);
      this.writeText(relativePath, `${JSON.stringify(bank, null, 2)}\n`);
    }

    return {
      ...bank,
      relativePath
    };
  }

  randomThought(now = new Date()) {
    const bank = this.dailyThoughtBank(now);
    const thoughts = Array.isArray(bank.thoughts) ? bank.thoughts.filter(Boolean) : [];
    const thought = thoughts[Math.floor(Math.random() * thoughts.length)] || '조이 생각 중이에요. 별건 아니고, 주인님 챙길 게 있나 보는 중이죠.';
    return {
      ok: true,
      thought,
      dateKey: bank.dateKey,
      count: thoughts.length,
      source: bank.relativePath
    };
  }

  writeSession({ userMessage, codexAvailable, route = null, action, result, now = new Date() }) {
    this.ensureBase();
    const id = sessionId(now, this.timezone);
    const relativePath = this.relativePath('sessions', `${id}.json`);
    this.writeText(relativePath, `${JSON.stringify({
      id,
      createdAt: now.toISOString(),
      userMessage,
      codexAvailable,
      route,
      result,
      action
    }, null, 2)}\n`);
    return relativePath;
  }

  applyAction(action = {}, { userMessage, reminderStore, now = new Date() } = {}) {
    this.ensureBase();
    const changedFiles = [];

    if (action.clarifying_question) {
      changedFiles.push(this.appendInbox({
        userMessage,
        question: action.clarifying_question,
        now
      }));
      return {
        changedFiles,
        createdReminders: [],
        updatedReminders: [],
        needsConfirmation: true
      };
    }

    changedFiles.push(...this.appendHistoryPatch(action, { userMessage, now }));

    const memoryFile = this.appendMemoryPatch(action.memory_patch, now);
    if (memoryFile) changedFiles.push(memoryFile);

    const createdReminders = reminderStore?.createMany(action.reminders_to_create || [], { now }) || [];
    const updatedReminders = reminderStore?.updateMany(action.reminders_to_update || [], { now }) || [];
    if (createdReminders.length > 0 || updatedReminders.length > 0) changedFiles.push('reminders.json');

    return {
      changedFiles: Array.from(new Set(changedFiles)),
      createdReminders,
      updatedReminders,
      needsConfirmation: false
    };
  }
}

module.exports = {
  AssistantStore,
  DEFAULT_ASSISTANT_ROOT,
  DEFAULT_TIMEZONE,
  ASSISTANT_INSTRUCTIONS,
  formatDateKey,
  formatTimeKey
};
