import { experimental_evaluate } from 'ai';
import { runCannedEvaluation } from '../../lib/evaluateTriage';

export const config = {
  maxDuration: 30,
};

// Judgment only. The LLM tab stays on pages/api/chat.js (OpenAI Chat
// Completions, logprobs, top_logprobs: 5, n: 3) and is not routed here.
//
// experimental_evaluate('typesafe-ai/jev') goes through the AI SDK gateway
// evaluation protocol. Do not send this ticket to an OpenAI-compatible chat
// endpoint, and do not invent POST …/v1/evaluate.
//
// TypeSafe's own REST, for ops rather than this app, is
// POST https://ai-gateway.vercel.sh/typesafe/v1/systemone.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Questions stay the allowlist for the situation id. A missing id and a
  // missing state still judge the canned lockout ticket. A `questions`
  // field is a 400 — this route is not an open proxy for a schema the
  // browser invented. The LLM tab stays on pages/api/chat.js.
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const options = {
    env: process.env,
    state: Object.prototype.hasOwnProperty.call(body, 'state') ? body.state : undefined,
    scenarioId: Object.prototype.hasOwnProperty.call(body, 'scenarioId') ? body.scenarioId : undefined,
    evaluate: (args) => experimental_evaluate(args),
  };
  if (Object.prototype.hasOwnProperty.call(body, 'questions')) {
    options.questions = body.questions;
  }
  const outcome = await runCannedEvaluation(options);
  return res.status(outcome.status).json(outcome.body);
}
