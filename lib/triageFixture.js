// One canned support ticket for the Decision tab. Day one does not accept
// a client-supplied state: POST /api/evaluate always judges this fixture.
//
// `label` is UI copy. questionsForEvaluate strips it before the model call
// so the payload stays a Choice / Score / Boolean question map.

export const TRIAGE_MODEL = 'typesafe-ai/jev';

// Published list price, input tokens only. Output tokens are not charged.
// https://vercel.com/ai-gateway/models/jev
export const JEV_INPUT_USD_PER_MILLION = 0.042;

export const TRIAGE_SCENARIO = {
  id: 'stripe-sync-refund',
  title: 'A support ticket',
  state: {
    subject: 'Stripe sync broken',
    message:
      'My Stripe connection has failed for three days and I am losing sales. Refund me for this month.',
    plan: 'pro',
    previousTickets: 2,
  },
  questions: {
    department: {
      type: 'choice',
      label: 'Queue',
      instructions: 'Which team should handle this ticket?',
      criteria: {
        billing: 'Charges, invoices, and refunds',
        technical: 'Bugs, outages, and integration failures',
        account: 'Login, permissions, and profile changes',
        other: 'Anything that does not fit the other teams',
      },
    },
    severity: {
      type: 'score',
      label: 'Severity',
      instructions: 'How severe is the issue for the customer?',
      criteria: [
        'Cosmetic or informational',
        'Degraded, but a workaround exists',
        'Blocking with no workaround',
        'Blocking and causing financial or data loss',
      ],
    },
    requestsRefund: {
      type: 'boolean',
      label: 'Refund asked',
      instructions: 'Is the customer asking for money back?',
      criteria: {
        true: 'The customer asks to be refunded.',
        false: 'The customer does not ask for money back.',
      },
    },
  },
};

export const SEVERITY_MAX = TRIAGE_SCENARIO.questions.severity.criteria.length - 1;

export function questionsForEvaluate(questions = TRIAGE_SCENARIO.questions) {
  const out = {};
  for (const [id, question] of Object.entries(questions)) {
    const next = {
      type: question.type,
      instructions: question.instructions,
    };
    if (question.criteria != null) next.criteria = question.criteria;
    out[id] = next;
  }
  return out;
}
