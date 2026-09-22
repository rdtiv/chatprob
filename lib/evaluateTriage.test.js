import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GATEWAY_FORBIDDEN_MESSAGE,
  GATEWAY_KEY_MESSAGE,
  TICKET_STATE_ERROR,
  gatewayAuthLikely,
  isGatewayAuthError,
  isGatewayForbiddenError,
  readConfidence,
  readReportedCost,
  listPriceUsd,
  resolveTicketState,
  runCannedEvaluation,
} from './evaluateTriage.js';
import { TRIAGE_MODEL, TRIAGE_SCENARIO } from './triageFixture.js';

const fakeResult = {
  answers: {
    department: {
      type: 'choice',
      choice: 'technical',
      probabilities: { billing: 0.08, technical: 0.91, account: 0.01, other: 0 },
    },
    severity: {
      type: 'score',
      score: 2.86,
      probabilities: { 0: 0, 1: 0.02, 2: 0.1, 3: 0.88 },
    },
    requestsRefund: { type: 'boolean', probability: 0.97 },
  },
  usage: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 },
  warnings: [],
  rounding: { probabilityDecimals: 2, scoreDecimals: 2 },
  providerMetadata: {
    typesafe: { confidence: { department: 0.91, severity: 0.62 } },
  },
  response: { modelId: 'typesafe-ai/jev' },
};

test('gateway auth is likely with a key, an OIDC token, or a Vercel runtime', () => {
  assert.equal(gatewayAuthLikely({}), false);
  assert.equal(gatewayAuthLikely({ AI_GATEWAY_API_KEY: '  ' }), false);
  assert.equal(gatewayAuthLikely({ AI_GATEWAY_API_KEY: 'gw_test' }), true);
  assert.equal(gatewayAuthLikely({ VERCEL_OIDC_TOKEN: 'token' }), true);
  assert.equal(gatewayAuthLikely({ VERCEL: '1' }), true);
});

test('a missing credential does not call evaluate', async () => {
  let called = false;
  const outcome = await runCannedEvaluation({
    env: {},
    evaluate: async () => {
      called = true;
      return fakeResult;
    },
  });
  assert.equal(called, false);
  assert.equal(outcome.status, 401);
  assert.equal(outcome.body.code, 'missing_gateway_auth');
  assert.equal(outcome.body.error, GATEWAY_KEY_MESSAGE);
});

test('a successful judgment returns answers, list price, and confidence', async () => {
  let seen = null;
  const outcome = await runCannedEvaluation({
    env: { AI_GATEWAY_API_KEY: 'gw_test' },
    now: (() => {
      let t = 1000;
      return () => {
        t += 250;
        return t;
      };
    })(),
    evaluate: async (args) => {
      seen = args;
      return fakeResult;
    },
  });

  assert.equal(seen.model, TRIAGE_MODEL);
  assert.deepEqual(seen.state, TRIAGE_SCENARIO.state);
  assert.equal(seen.questions.department.label, undefined);
  assert.equal(seen.questions.requestsRefund.type, 'boolean');
  assert.deepEqual(seen.providerOptions, { gateway: { zeroDataRetention: true } });
  assert.equal(JSON.stringify(seen).includes('/v1/evaluate'), false);
  assert.equal(JSON.stringify(seen).includes('Edit the subject or message, then run again.'), false);
  assert.equal(JSON.stringify(seen).includes('P(true) only'), false);

  assert.equal(outcome.status, 200);
  assert.equal(outcome.body.answers.department.choice, 'technical');
  assert.equal(outcome.body.confidence.department, 0.91);
  assert.equal(outcome.body.confidence.requestsRefund, undefined);
  assert.equal(outcome.body.timing.elapsedMs, 250);
  assert.equal(outcome.body.cost.source, 'list-price');
  assert.equal(outcome.body.cost.usd, listPriceUsd(1000));
  assert.equal(outcome.body.usage.outputTokens, 0);
});

test('a reported gateway cost wins over the list price', () => {
  const cost = readReportedCost({
    gateway: { totalCost: 0.01, marketCost: 0.02 },
    typesafe: { confidence: { department: 0.5 } },
  });
  assert.equal(cost, 0.01);
  assert.deepEqual(readConfidence({ typesafe: { confidence: { department: 0.5, severity: 'nope' } } }), {
    department: 0.5,
  });
});

test('a forbidden gateway call becomes the refusal message', async () => {
  const error = new Error('forbidden sk-secret-should-not-leak');
  error.name = 'GatewayForbiddenError';
  assert.equal(isGatewayForbiddenError(error), true);
  const byStatus = new Error('no');
  byStatus.statusCode = 403;
  assert.equal(isGatewayForbiddenError(byStatus), true);
  const outcome = await runCannedEvaluation({
    env: { AI_GATEWAY_API_KEY: 'gw_test' },
    evaluate: async () => {
      throw error;
    },
  });
  assert.equal(outcome.status, 403);
  assert.equal(outcome.body.code, 'gateway_forbidden');
  assert.equal(outcome.body.error, GATEWAY_FORBIDDEN_MESSAGE);
  assert.equal(JSON.stringify(outcome.body).includes('sk-'), false);
  assert.equal(JSON.stringify(outcome.body).includes('gw_'), false);
});

test('an auth failure from the SDK becomes the key message', async () => {
  const error = new Error('Unauthenticated. Configure AI_GATEWAY_API_KEY');
  error.name = 'GatewayAuthenticationError';
  assert.equal(isGatewayAuthError(error), true);
  const outcome = await runCannedEvaluation({
    env: { VERCEL: '1' },
    evaluate: async () => {
      throw error;
    },
  });
  assert.equal(outcome.status, 401);
  assert.equal(outcome.body.error, GATEWAY_KEY_MESSAGE);
  assert.equal(JSON.stringify(outcome.body).includes('gw_'), false);
});

test('a body state is what evaluate receives', async () => {
  const edited = {
    subject: '  Invoice export stuck  ',
    message: 'The CSV download spins forever. Please refund this month.',
    plan: 'team',
    previousTickets: '4',
    ignored: 'not sent',
  };
  let seen = null;
  const outcome = await runCannedEvaluation({
    env: { AI_GATEWAY_API_KEY: 'gw_test' },
    state: edited,
    evaluate: async (args) => {
      seen = args;
      return fakeResult;
    },
  });
  assert.equal(outcome.status, 200);
  assert.deepEqual(seen.state, {
    subject: 'Invoice export stuck',
    message: 'The CSV download spins forever. Please refund this month.',
    plan: 'team',
    previousTickets: 4,
  });
  assert.equal(seen.questions.department.label, undefined);
  assert.equal(seen.model, TRIAGE_MODEL);
  assert.notDeepEqual(seen.state, TRIAGE_SCENARIO.state);
});

test('a missing state still judges the canned ticket', () => {
  const resolved = resolveTicketState(undefined, true);
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.state, TRIAGE_SCENARIO.state);
});

test('an invalid state does not call evaluate', async () => {
  let called = false;
  const outcome = await runCannedEvaluation({
    env: { AI_GATEWAY_API_KEY: 'gw_test' },
    state: { subject: '', message: 'hello', plan: 'pro', previousTickets: 1 },
    evaluate: async () => {
      called = true;
      return fakeResult;
    },
  });
  assert.equal(called, false);
  assert.equal(outcome.status, 400);
  assert.equal(outcome.body.code, 'invalid_ticket');
  assert.equal(outcome.body.error, TICKET_STATE_ERROR);
  assert.equal(resolveTicketState(['nope']).ok, false);
  assert.equal(resolveTicketState({ subject: 'x', message: 'y', plan: 'z', previousTickets: -1 }).ok, false);
});

test('a non-auth failure stays a short retry message', async () => {
  const outcome = await runCannedEvaluation({
    env: { AI_GATEWAY_API_KEY: 'gw_test' },
    evaluate: async () => {
      throw new Error('socket hang up with sk-secret-should-not-leak');
    },
  });
  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.code, 'evaluate_failed');
  assert.equal(outcome.body.error.includes('sk-'), false);
});
