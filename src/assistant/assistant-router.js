const VALID_INTENTS = new Set(['chat', 'recall', 'memory', 'schedule', 'task', 'note']);
const VALID_CONFIDENCE = new Set(['low', 'medium', 'high']);

function normalizeAssistantRoute(route = {}) {
  const intent = VALID_INTENTS.has(String(route.intent || '').toLowerCase())
    ? String(route.intent).toLowerCase()
    : 'chat';
  const saveRequired = typeof route.saveRequired === 'boolean'
    ? route.saveRequired
    : Boolean(route.save_required);
  const confidence = VALID_CONFIDENCE.has(String(route.confidence || '').toLowerCase())
    ? String(route.confidence).toLowerCase()
    : 'medium';

  return {
    intent,
    saveRequired,
    needsCodex: true,
    confidence,
    reason: String(route.reason || '').trim()
  };
}

function enforceActionRoute(action = {}, route = {}) {
  const normalizedRoute = normalizeAssistantRoute(route);
  const normalized = {
    ...action,
    route: {
      intent: normalizedRoute.intent,
      save_required: normalizedRoute.saveRequired,
      confidence: normalizedRoute.confidence,
      reason: normalizedRoute.reason
    }
  };

  if (normalizedRoute.saveRequired) return normalized;

  return {
    ...normalized,
    history_patch: {
      ...(normalized.history_patch || {}),
      save: false
    },
    memory_patch: { add: [], update: [] },
    reminders_to_create: [],
    reminders_to_update: [],
    clarifying_question: null
  };
}

module.exports = {
  enforceActionRoute,
  normalizeAssistantRoute
};
