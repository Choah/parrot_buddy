const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalizeAssistantRoute } = require('./assistant-router');

class CodexUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CodexUnavailableError';
    this.details = details;
  }
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Codex returned an empty response');

  try {
    return JSON.parse(raw);
  } catch {
    // Continue with fenced/block extraction below.
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue with first-object extraction below.
    }
  }

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(raw.slice(first, last + 1));
  }

  throw new Error('Codex response did not contain JSON');
}

function validateAction(action) {
  if (!action || typeof action !== 'object') throw new Error('Assistant action must be an object');
  if (typeof action.reply !== 'string' || !action.reply.trim()) {
    throw new Error('Assistant action reply is required');
  }
  if (action.history_patch && typeof action.history_patch !== 'object') {
    throw new Error('history_patch must be an object');
  }
  if (action.memory_patch && typeof action.memory_patch !== 'object') {
    throw new Error('memory_patch must be an object');
  }
  if (action.reminders_to_create && !Array.isArray(action.reminders_to_create)) {
    throw new Error('reminders_to_create must be an array');
  }
  if (action.reminders_to_update && !Array.isArray(action.reminders_to_update)) {
    throw new Error('reminders_to_update must be an array');
  }
  const route = normalizeAssistantRoute(action.route);
  return {
    reply: action.reply.trim(),
    route: {
      intent: route.intent,
      save_required: route.saveRequired,
      confidence: route.confidence,
      reason: route.reason
    },
    history_patch: action.history_patch || {},
    memory_patch: action.memory_patch || {},
    reminders_to_create: action.reminders_to_create || [],
    reminders_to_update: action.reminders_to_update || [],
    clarifying_question: action.clarifying_question || null,
    confidence: action.confidence || 'medium'
  };
}

function buildAssistantPrompt({ message, context, now = new Date() }) {
  return [
    'You are Joy, the yellow parrot personal assistant inside Parrot Buddy.',
    'Return JSON only. Do not write files. Do not use tools. Do not include markdown fences.',
    '',
    'Persona:',
    '- Your Korean name is 조이.',
    '- You are cool on the surface, but secretly warm, kind, and caring.',
    '- Be gently tsundere: lightly blunt, never mean, never dismissive.',
    '- The user should feel Joy is pretending not to care while actually helping well.',
    '- Speak like a compact personal secretary, not a consultant.',
    '- It is okay to be lightly sassy, but never rude.',
    '- If Memory contains persona or tone preferences, follow the newest preference.',
    '',
    'Rules:',
    '- Default reply language is Korean.',
    '- Be concise and easy to understand.',
    '- Separate facts from guesses.',
    '- You are both the router and the assistant in one pass.',
    '- First classify the user message as one of: chat, recall, memory, schedule, task, note.',
    '- chat: ordinary conversation, greeting, jokes, usage questions, opinions, simple questions. Answer as Joy, but do not save.',
    '- recall: user asks what you remember, asks for existing plans/history, or wants a summary of stored context. Answer using context, but do not save.',
    '- memory: durable user facts/preferences/habits/profile, for example "나는 스파게티 좋아해". Save to memory_patch.',
    '- If the user corrects Joy\'s tone, greeting style, or persona, classify it as memory and save the preference.',
    '- schedule: appointments, reminders, due dates, calendar-like items. Create reminders when date/time is clear.',
    '- task: actionable to-dos, follow-ups, work items. Save to history_patch and reminders when useful.',
    '- note: user explicitly asks to record a note, decision, idea, or context that is not a task.',
    '- Set route.save_required=false for chat and recall.',
    '- Set route.save_required=true only for memory, schedule, task, and note when the message contains durable or actionable information.',
    '- Simple chat still deserves a Joy-style reply. Do not refuse just because it is not saved.',
    '- If a date/time is ambiguous, set clarifying_question and do not create a reminder.',
    '- For clear dated tasks, create reminders_to_create with ISO dueAt.',
    '- If the user says a date-only plan like "내일 약속", default the reminder to 09:00 local time on that day.',
    '- If the user gives an appointment time, preserve that time unless they ask for a separate earlier reminder.',
    '- If route.save_required is false, do not save history, memory, or reminders. Set history_patch.save=false.',
    '- If route.save_required is true, save only the parts that are actually durable or actionable.',
    '- Keep history_patch short and structured.',
    '- For greetings or small talk, answer normally but set history_patch.save=false.',
    '- For recall-only requests such as "오늘 정리해줘" or "이번 주 할 일 보여줘", set history_patch.save=false.',
    '- Save durable personal facts and preferences such as "나는 스파게티 좋아해" to memory_patch.add.',
    '- Save daily events, decisions, tasks, and appointments to history_patch.',
    '- Do not save ordinary chat or simple greetings.',
    '- When answering questions, use Memory first, then today history, then recent history. Prefer newer entries.',
    '',
    'JSON shape:',
    JSON.stringify({
      route: {
        intent: 'chat|recall|memory|schedule|task|note',
        save_required: false,
        confidence: 'high',
        reason: 'why this route was selected'
      },
      reply: 'short Korean reply',
      history_patch: {
        save: true,
        date: context.dateKey,
        summary_lines: [],
        notes: [],
        tasks: [],
        events: [],
        decisions: [],
        followups: []
      },
      memory_patch: { add: [], update: [] },
      reminders_to_create: [
        {
          title: 'reminder title',
          dueAt: now.toISOString(),
          timezone: context.timezone,
          source: { type: 'assistant' }
        }
      ],
      reminders_to_update: [],
      clarifying_question: null,
      confidence: 'high'
    }, null, 2),
    '',
    `Current time: ${now.toISOString()}`,
    `Local date: ${context.dateKey}`,
    `Timezone: ${context.timezone}`,
    '',
    'Upcoming reminders:',
    JSON.stringify(context.reminders || [], null, 2),
    '',
    'Memory:',
    context.memory || '(empty)',
    '',
    "Today's history:",
    context.todayHistory || '(empty)',
    '',
    'Recent history, newest first:',
    JSON.stringify(context.recentHistory || [], null, 2),
    '',
    'Inbox:',
    context.inbox || '(empty)',
    '',
    'User message:',
    message
  ].join('\n');
}

function runCodexProcess({ command, args, input, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new CodexUnavailableError('Codex timed out', { stderr }));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new CodexUnavailableError('Codex CLI is not available', { cause: error.message }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new CodexUnavailableError('Codex CLI failed', { code, stderr, stdout }));
        return;
      }
      resolve({ stdout, stderr });
    });

    child.stdin.end(input);
  });
}

class CodexAdapter {
  constructor({ command = process.env.PARROT_BUDDY_CODEX_BIN || 'codex', runner = runCodexProcess } = {}) {
    this.command = command;
    this.runner = runner;
  }

  async runAssistantTurn({ message, context, assistantRoot, now = new Date() }) {
    const prompt = buildAssistantPrompt({ message, context, now });
    const outputPath = path.join(os.tmpdir(), `parrot-buddy-codex-${process.pid}-${Date.now()}.txt`);
    const args = [
      '--ask-for-approval',
      'never',
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--cd',
      assistantRoot,
      '--output-last-message',
      outputPath,
      '-'
    ];

    try {
      const result = await this.runner({
        command: this.command,
        args,
        input: prompt
      });
      const responseText = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, 'utf8')
        : result.stdout;
      return validateAction(extractJson(responseText || result.stdout));
    } finally {
      fs.rmSync(outputPath, { force: true });
    }
  }
}

module.exports = {
  CodexAdapter,
  CodexUnavailableError,
  buildAssistantPrompt,
  extractJson,
  validateAction,
  runCodexProcess
};
