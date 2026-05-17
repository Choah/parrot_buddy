const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REMINDER_STATUSES = new Set(['open', 'done', 'snoozed', 'cancelled']);

function nowIso(date = new Date()) {
  return date.toISOString();
}

function slugify(value) {
  return String(value || 'reminder')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'reminder';
}

function createReminderId(title, dueAt) {
  const digest = crypto
    .createHash('sha1')
    .update(`${title}\n${dueAt}\n${Date.now()}\n${Math.random()}`)
    .digest('hex')
    .slice(0, 8);
  return `rem_${slugify(title)}_${digest}`;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeReminder(input = {}, { now = new Date(), timezone = 'Asia/Seoul' } = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Reminder title is required');

  const dueDate = parseDate(input.dueAt);
  if (!dueDate) throw new Error(`Invalid reminder dueAt: ${input.dueAt}`);

  const status = input.status || 'open';
  if (!REMINDER_STATUSES.has(status)) throw new Error(`Invalid reminder status: ${status}`);

  const createdAt = input.createdAt || nowIso(now);
  return {
    id: input.id || createReminderId(title, dueDate.toISOString()),
    title,
    dueAt: dueDate.toISOString(),
    timezone: input.timezone || timezone,
    status,
    source: input.source || null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    lastNotifiedAt: input.lastNotifiedAt || null,
    snoozedUntil: input.snoozedUntil || null,
    repeat: input.repeat || null
  };
}

class ReminderStore {
  constructor({ root, timezone = 'Asia/Seoul' }) {
    if (!root) throw new Error('Assistant root is required');
    this.root = root;
    this.timezone = timezone;
    this.filePath = path.join(root, 'reminders.json');
  }

  ensureFile() {
    fs.mkdirSync(this.root, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '[]\n', 'utf8');
    }
  }

  list() {
    this.ensureFile();
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  save(reminders) {
    this.ensureFile();
    fs.writeFileSync(this.filePath, `${JSON.stringify(reminders, null, 2)}\n`, 'utf8');
  }

  createMany(items = [], options = {}) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const existing = this.list();
    const now = options.now || new Date();
    const created = items.map((item) => normalizeReminder(item, {
      now,
      timezone: this.timezone
    }));
    this.save([...existing, ...created]);
    return created;
  }

  updateMany(items = [], options = {}) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const now = options.now || new Date();
    const byId = new Map(this.list().map((reminder) => [reminder.id, reminder]));
    const updated = [];

    for (const item of items) {
      if (!item?.id || !byId.has(item.id)) continue;
      const next = normalizeReminder({
        ...byId.get(item.id),
        ...item,
        updatedAt: nowIso(now)
      }, {
        now,
        timezone: this.timezone
      });
      byId.set(next.id, next);
      updated.push(next);
    }

    if (updated.length > 0) this.save(Array.from(byId.values()));
    return updated;
  }

  dueReminders(now = new Date()) {
    const nowTime = now.getTime();
    return this.list().filter((reminder) => {
      if (!['open', 'snoozed'].includes(reminder.status)) return false;
      if (reminder.lastNotifiedAt) return false;
      const dueAt = parseDate(reminder.snoozedUntil || reminder.dueAt);
      return dueAt && dueAt.getTime() <= nowTime;
    });
  }

  markNotified(id, notifiedAt = new Date()) {
    const reminders = this.list();
    let changed = null;
    const next = reminders.map((reminder) => {
      if (reminder.id !== id) return reminder;
      changed = {
        ...reminder,
        lastNotifiedAt: nowIso(notifiedAt),
        updatedAt: nowIso(notifiedAt)
      };
      return changed;
    });
    if (changed) this.save(next);
    return changed;
  }

  markDone(id, doneAt = new Date()) {
    const reminders = this.list();
    let changed = null;
    const next = reminders.map((reminder) => {
      if (reminder.id !== id) return reminder;
      changed = {
        ...reminder,
        status: 'done',
        updatedAt: nowIso(doneAt)
      };
      return changed;
    });
    if (changed) this.save(next);
    return changed;
  }

  upcoming(limit = 20, now = new Date()) {
    const nowTime = now.getTime();
    return this.list()
      .filter((reminder) => ['open', 'snoozed'].includes(reminder.status))
      .filter((reminder) => {
        const dueAt = parseDate(reminder.snoozedUntil || reminder.dueAt);
        return dueAt && dueAt.getTime() >= nowTime;
      })
      .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
      .slice(0, limit);
  }
}

module.exports = {
  ReminderStore,
  normalizeReminder,
  createReminderId
};
