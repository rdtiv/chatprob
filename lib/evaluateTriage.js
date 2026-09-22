// Server-side wrapper around experimental_evaluate. The situation id
// picks the question list. The browser never supplies that list.
// The AI SDK call itself stays in pages/api/evaluate.js so this module can be
// tested without importing `ai`.
//
// Ops note, not an app path: TypeSafe's REST endpoint is
// POST https://ai-gateway.vercel.sh/typesafe/v1/systemone.
// This module does not call it, and it does not call a /v1/evaluate URL.

import {
  JEV_INPUT_USD_PER_MILLION,
  TRIAGE_MODEL,
  questionsForEvaluate,
} from './triageFixture.js';
import {
  FOREIGN_QUESTIONS_ERROR,
  resolveScenarioId,
  resolveScenarioState,
} from './decisionScenarios.js';

export { TICKET_STATE_ERROR, resolveTicketState } from './ticketState.js';
export { FOREIGN_QUESTIONS_ERROR } from './decisionScenarios.js';

export const GATEWAY_KEY_MESSAGE =
  'Set AI_GATEWAY_API_KEY to run this judgment. On Vercel, Gateway OIDC works instead when it is already enabled. The LLM tab still uses OPENAI_API_KEY.';

export const GATEWAY_FORBIDDEN_MESSAGE =
  'The gateway refused this judgment. Check that AI_GATEWAY_API_KEY can call typesafe-ai/jev.';

export const EVALUATE_FAILED_MESSAGE = 'Judgment failed. Try again.';

export function gatewayAuthLikely(env = process.env) {
  if (typeof env.AI_GATEWAY_API_KEY === 'string' && env.AI_GATEWAY_API_KEY.trim()) return true;
  if (typeof env.VERCEL_OIDC_TOKEN === 'string' && env.VERCEL_OIDC_TOKEN.trim()) return true;
  // Preview and production inject an OIDC token per request when Gateway
  // OIDC is enabled. The SDK reads that token; we only need to attempt the call.
  if (env.VERCEL === '1') return true;
  return false;
}

export function isGatewayAuthError(error) {
  const name = error?.name || '';
  if (name === 'GatewayAuthenticationError') return true;
  const message = String(error?.message || '');
  return /AI_GATEWAY_API_KEY|Unauthenticated|x-vercel-oidc-token|VercelOidcTokenError/i.test(message);
}

export function isGatewayForbiddenError(error) {
  const name = error?.name || '';
  if (name === 'GatewayForbiddenError') return true;
  const status = error?.statusCode ?? error?.status;
  return status === 403;
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const COST_KEYS = ['totalCost', 'marketCost', 'cost'];

export function readReportedCost(providerMetadata) {
  if (!providerMetadata || typeof providerMetadata !== 'object') return null;
  const found = [];
  const visit = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const key of COST_KEYS) {
      const value = obj[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        found.push({ key, value });
      }
    }
  };
  visit(providerMetadata);
  for (const value of Object.values(providerMetadata)) visit(value);
  return (
    found.find((item) => item.key === 'totalCost')?.value
    ?? found.find((item) => item.key === 'marketCost')?.value
    ?? found.find((item) => item.key === 'cost')?.value
    ?? null
  );
}

export function readConfidence(providerMetadata) {
  const raw = providerMetadata?.typesafe?.confidence;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export function listPriceUsd(inputTokens) {
  if (!Number.isFinite(inputTokens) || inputTokens < 0) return null;
  const usd = (inputTokens / 1_000_000) * JEV_INPUT_USD_PER_MILLION;
  return Math.round(usd * 1e12) / 1e12;
}

export function summarizeEvaluation(result, elapsedMs, scenarioId) {
  const inputTokens = finiteOrNull(result?.usage?.inputTokens);
  const outputTokens = finiteOrNull(result?.usage?.outputTokens);
  const totalTokens = finiteOrNull(result?.usage?.totalTokens);
  const reported = readReportedCost(result?.providerMetadata);
  const list = listPriceUsd(inputTokens);
  const cost = reported != null
    ? { usd: reported, source: 'reported' }
    : list != null
      ? { usd: list, source: 'list-price', inputPerMillion: JEV_INPUT_USD_PER_MILLION }
      : null;

  return {
    model: result?.response?.modelId || TRIAGE_MODEL,
    scenarioId,
    answers: result?.answers ?? {},
    confidence: readConfidence(result?.providerMetadata),
    usage: { inputTokens, outputTokens, totalTokens },
    rounding: result?.rounding ?? null,
    timing: { elapsedMs: finiteOrNull(elapsedMs) },
    cost,
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
  };
}

function failure(error) {
  if (isGatewayForbiddenError(error)) {
    return { status: 403, body: { error: GATEWAY_FORBIDDEN_MESSAGE, code: 'gateway_forbidden' } };
  }
  if (isGatewayAuthError(error)) {
    return { status: 401, body: { error: GATEWAY_KEY_MESSAGE, code: 'missing_gateway_auth' } };
  }
  return { status: 502, body: { error: EVALUATE_FAILED_MESSAGE, code: 'evaluate_failed' } };
}

export async function runCannedEvaluation(options = {}) {
  const { evaluate, env = process.env, now = Date.now, state, scenarioId } = options;
  if (typeof evaluate !== 'function') {
    throw new TypeError('evaluate is required');
  }
  // A question list on the request is never forwarded. The allowlist below
  // is the only schema this route will judge.
  if (Object.prototype.hasOwnProperty.call(options, 'questions')) {
    return { status: 400, body: { error: FOREIGN_QUESTIONS_ERROR, code: 'foreign_questions' } };
  }
  const picked = resolveScenarioId(scenarioId);
  if (!picked.ok) {
    return { status: 400, body: { error: picked.error, code: 'unknown_scenario' } };
  }
  const ticket = resolveScenarioState(picked.scenario, state, state == null);
  if (!ticket.ok) {
    return { status: 400, body: { error: ticket.error, code: 'invalid_ticket' } };
  }
  if (!gatewayAuthLikely(env)) {
    return { status: 401, body: { error: GATEWAY_KEY_MESSAGE, code: 'missing_gateway_auth' } };
  }

  const started = now();
  try {
    const result = await evaluate({
      model: TRIAGE_MODEL,
      state: ticket.state,
      questions: questionsForEvaluate(picked.scenario.questions),
      providerOptions: {
        gateway: { zeroDataRetention: true },
      },
    });
    const elapsedMs = Math.max(0, now() - started);
    return { status: 200, body: summarizeEvaluation(result, elapsedMs, picked.scenario.id) };
  } catch (error) {
    console.error('evaluate failed', error?.name || 'Error');
    return failure(error);
  }
}
