// Pure checks for the one editable ticket. The Decision workbench and
// POST /api/evaluate share this so a bad edit is rejected the same way
// in the browser and on the server.

import { TRIAGE_SCENARIO } from './triageFixture.js';

export const TICKET_STATE_ERROR =
  'The ticket needs a subject, a message, a plan, and a whole number of earlier tickets.';

export const TEXT_LIMITS = {
  subject: 240,
  message: 4000,
  plan: 64,
};

const MAX_PREVIOUS_TICKETS = 9999;

export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export function cleanCount(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= 0 && value <= MAX_PREVIOUS_TICKETS ? value : null;
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed <= MAX_PREVIOUS_TICKETS ? parsed : null;
  }
  return null;
}

// `allowDefault` is for a missing body: the canned lockout ticket. A present
// state that fails these checks is a 400, so a bad edit is not silently
// judged as the canned ticket.
export function resolveTicketState(state, allowDefault = false) {
  if (state == null) {
    if (!allowDefault) return { ok: false, error: TICKET_STATE_ERROR };
    return {
      ok: true,
      state: {
        subject: TRIAGE_SCENARIO.state.subject,
        message: TRIAGE_SCENARIO.state.message,
        plan: TRIAGE_SCENARIO.state.plan,
        previousTickets: TRIAGE_SCENARIO.state.previousTickets,
      },
    };
  }
  if (typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: TICKET_STATE_ERROR };
  }
  const subject = cleanText(state.subject, TEXT_LIMITS.subject);
  const message = cleanText(state.message, TEXT_LIMITS.message);
  const plan = cleanText(state.plan, TEXT_LIMITS.plan);
  const previousTickets = cleanCount(state.previousTickets);
  if (subject == null || message == null || plan == null || previousTickets == null) {
    return { ok: false, error: TICKET_STATE_ERROR };
  }
  return { ok: true, state: { subject, message, plan, previousTickets } };
}
