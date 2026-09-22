// Four Decision situations, in the order the picker shows them.
// Questions live here and are chosen by id on the server. The browser
// may send a situation id and the text; it may not send a question list.

import { TRIAGE_SCENARIO } from './triageFixture.js';
import { TEXT_LIMITS, cleanText, resolveTicketState, TICKET_STATE_ERROR } from './ticketState.js';

export const DEFAULT_SCENARIO_ID = 'account-lockout-no-refund';

export const UNKNOWN_SCENARIO_ERROR = 'That situation is not one this page can judge.';

export const FOREIGN_QUESTIONS_ERROR =
  'Questions stay on the server. Send the situation and the text, not a question list.';

export const EMAIL_STATE_ERROR = 'The mail needs a from address, a subject, and a body.';

export const ASK_STATE_ERROR = 'The question needs the words they asked.';

const FROM_LIMIT = 120;
const ASK_LIMIT = TEXT_LIMITS.message;

const TICKET_HINT = 'Edit the subject or message, then run again.';

const SUPPORT_LINES = {
  choiceReject: 'Reject a queue below',
  choiceAuto: 'Auto-route a queue at',
  choiceAutoHint: 'Checked after reject. A picked queue under this line is named, then escalated.',
  score: 'Escalate when severity reaches',
  scoreHint: '3 is the top of the rubric. Past 3, severity stops forcing an escalate.',
  booleanYes: 'Call a refund a clear yes at',
};

const SUPPORT_QUESTIONS = TRIAGE_SCENARIO.questions;

export const DECISION_SCENARIOS = [
  {
    id: DEFAULT_SCENARIO_ID,
    cardTitle: 'Can’t get in',
    blurb: 'Locked out after a password reset. Trip tomorrow. No refund ask.',
    surface: 'ticket',
    editHint: TICKET_HINT,
    state: TRIAGE_SCENARIO.state,
    questions: SUPPORT_QUESTIONS,
    judge: 'support',
    lines: SUPPORT_LINES,
  },
  {
    id: 'cancel-my-plan',
    cardTitle: 'Cancel my plan',
    blurb: 'Wants out — or a pause — or the double charge fixed. Hard to tell.',
    surface: 'ticket',
    editHint: TICKET_HINT,
    state: {
      subject: 'Please cancel my plan',
      message:
        'Please cancel. Unless you can fix the streaming — it freezes every night. Also I think you billed me twice last month. Or just pause me for now. I’m not sure.',
      plan: 'standard',
      previousTickets: 1,
    },
    questions: SUPPORT_QUESTIONS,
    judge: 'support',
    lines: SUPPORT_LINES,
  },
  {
    id: 'parts-came-back',
    cardTitle: 'Parts came back',
    blurb: 'Dock mail about a return. Which desk owns it?',
    surface: 'email',
    editHint: 'Edit the subject or body, then run again.',
    state: {
      from: 'ops@customerco.example',
      subject: 'Returned cartons from last week’s shipment',
      body:
        'The shipment from last week is back on our dock. Cartons were open and a few parts don’t match the packing list. Need someone to take this before second shift.',
    },
    questions: {
      queue: {
        type: 'choice',
        label: 'Queue',
        instructions: 'Which desk should take this mail?',
        criteria: {
          quality: 'The parts themselves look wrong',
          'sales-credit': 'This is about a credit',
          'ops-shipping': 'Shipping or the dock',
          unclear: 'The note does not say which desk',
        },
      },
      severity: {
        type: 'score',
        label: 'Severity',
        instructions: 'How serious is this return for the plant?',
        criteria: [
          'Paperwork only',
          'The line can keep running',
          'A shipment is stuck',
          'The line is down, or the count is already wrong',
        ],
      },
      repeat: {
        type: 'boolean',
        label: 'Came back before',
        instructions: 'Does this note describe a repeat return?',
        criteria: {
          true: 'The same parts have come back before.',
          false: 'This reads as a first return.',
        },
      },
      creditNotRemake: {
        type: 'boolean',
        label: 'Credit, not a remake',
        instructions: 'Is the ask a credit rather than making the parts again?',
        criteria: {
          true: 'They want a credit instead of a remake.',
          false: 'They want the parts made again, or the note does not ask for a credit.',
        },
      },
    },
    judge: 'shaped',
    lines: {
      choiceReject: 'Reject a queue below',
      choiceAuto: 'Auto-route a queue at',
      choiceAutoHint: 'Checked after reject. A picked queue under this line is named, then escalated.',
      score: 'Escalate when severity reaches',
      scoreHint: '3 is the top of the rubric. Past 3, severity stops forcing an escalate.',
      booleanYes: 'Call each yes-or-no a clear yes at',
    },
    playground: {
      choiceId: 'queue',
      scoreId: 'severity',
      booleans: [
        {
          id: 'repeat',
          missing: 'Repeat probability is missing.',
          gap: 'P(repeat) sits between a clear no and a clear yes.',
        },
        {
          id: 'creditNotRemake',
          missing: 'Credit probability is missing.',
          gap: 'P(credit) sits between a clear no and a clear yes.',
        },
      ],
      missingChoice: 'The queue answer has no distribution, so this playground will not auto-route.',
      lowChoice: 'The picked queue is under the reject line, so this playground refuses to name one.',
      midChoice: 'The picked queue is named, but it sits under the auto line.',
      missingScore: 'Severity has no score.',
      highScore: 'Severity is at or above the escalate line.',
      autoReason: 'Queue, severity, and the yes-or-no lines all cleared.',
    },
  },
  {
    id: 'weather-tool-gate',
    cardTitle: 'Should we call the tool?',
    blurb: 'Live weather or memory — when is a tool the right move?',
    surface: 'ask',
    editHint: 'Edit the question, then run again.',
    state: {
      ask: 'What’s the weather in Denver right now?',
    },
    questions: {
      needsLive: {
        type: 'boolean',
        label: 'Needs a live look',
        instructions: 'Does a fair answer need a live weather check?',
        criteria: {
          true: 'A fair answer needs weather from right now.',
          false: 'Memory, or a refusal, is enough.',
        },
      },
      move: {
        type: 'choice',
        label: 'Next move',
        instructions: 'What should happen with this question?',
        criteria: {
          memory: 'Answer from memory',
          tool: 'Call the weather tool',
          refuse: 'Say it cannot know',
        },
      },
    },
    judge: 'shaped',
    lines: {
      choiceReject: 'Refuse a move below',
      choiceAuto: 'Take a move at',
      choiceAutoHint: 'Checked after refuse. A picked move under this line is named, then escalated.',
      score: null,
      scoreHint: null,
      booleanYes: 'Call a live look a clear yes at',
    },
    playground: {
      choiceId: 'move',
      scoreId: null,
      booleans: [
        {
          id: 'needsLive',
          missing: 'Live-look probability is missing.',
          gap: 'P(live look) sits between a clear no and a clear yes.',
        },
      ],
      missingChoice: 'The next-move answer has no distribution, so this playground will not auto-route.',
      lowChoice: 'The picked move is under the reject line, so this playground refuses to name one.',
      midChoice: 'The picked move is named, but it sits under the auto line.',
      missingScore: null,
      highScore: null,
      autoReason: 'The next move and the live-look line both cleared.',
    },
  },
];

const BY_ID = new Map(DECISION_SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function getScenario(id) {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id) ?? null;
}

export function resolveScenarioId(scenarioId) {
  if (scenarioId == null) {
    return { ok: true, scenario: getScenario(DEFAULT_SCENARIO_ID) };
  }
  const scenario = getScenario(scenarioId);
  if (!scenario) return { ok: false, error: UNKNOWN_SCENARIO_ERROR };
  return { ok: true, scenario };
}

function cloneTicket(state) {
  return {
    subject: state.subject,
    message: state.message,
    plan: state.plan,
    previousTickets: state.previousTickets,
  };
}

function cloneEmail(state) {
  return {
    from: state.from,
    subject: state.subject,
    body: state.body,
  };
}

function cloneAsk(state) {
  return { ask: state.ask };
}

function cleanFrom(value) {
  const text = cleanText(value, FROM_LIMIT);
  if (!text || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return null;
  return text;
}

function resolveEmailState(state) {
  if (typeof state !== 'object' || state == null || Array.isArray(state)) {
    return { ok: false, error: EMAIL_STATE_ERROR };
  }
  const from = cleanFrom(state.from);
  const subject = cleanText(state.subject, TEXT_LIMITS.subject);
  const body = cleanText(state.body, TEXT_LIMITS.message);
  if (from == null || subject == null || body == null) {
    return { ok: false, error: EMAIL_STATE_ERROR };
  }
  return { ok: true, state: { from, subject, body } };
}

function resolveAskState(state) {
  if (typeof state !== 'object' || state == null || Array.isArray(state)) {
    return { ok: false, error: ASK_STATE_ERROR };
  }
  const ask = cleanText(state.ask, ASK_LIMIT);
  if (ask == null) return { ok: false, error: ASK_STATE_ERROR };
  return { ok: true, state: { ask } };
}

function cannedState(scenario) {
  if (scenario.surface === 'email') return cloneEmail(scenario.state);
  if (scenario.surface === 'ask') return cloneAsk(scenario.state);
  return cloneTicket(scenario.state);
}

// `allowDefault` is only for a missing state: that situation's canned text.
// A present state that fails the shape check is not replaced.
export function resolveScenarioState(scenario, state, allowDefault = false) {
  if (!scenario) return { ok: false, error: UNKNOWN_SCENARIO_ERROR };
  if (state == null) {
    if (!allowDefault) {
      if (scenario.surface === 'email') return { ok: false, error: EMAIL_STATE_ERROR };
      if (scenario.surface === 'ask') return { ok: false, error: ASK_STATE_ERROR };
      return { ok: false, error: TICKET_STATE_ERROR };
    }
    return { ok: true, state: cannedState(scenario) };
  }
  if (scenario.surface === 'email') return resolveEmailState(state);
  if (scenario.surface === 'ask') return resolveAskState(state);
  return resolveTicketState(state, false);
}

export function questionIds(scenario) {
  return Object.keys(scenario?.questions ?? {});
}
