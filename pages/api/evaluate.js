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

  // The body is ignored. Day one judges the canned ticket only, so this
  // route is not an open proxy to the gateway.
  const outcome = await runCannedEvaluation({
    env: process.env,
    evaluate: (args) => experimental_evaluate(args),
  });
  return res.status(outcome.status).json(outcome.body);
}
