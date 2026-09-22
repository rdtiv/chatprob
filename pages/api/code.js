import { OpenAI } from 'openai';
import { runCodeTurn } from '../../lib/codeRun';

export const config = {
  maxDuration: 60,
};

// Code tab. Direct OpenAI, same key and host as pages/api/chat.js.
// Not the AI Gateway and not Jev. The model writes TypeScript. The
// sandbox runs it. This route does not accept rows.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  try {
    const outcome = await runCodeTurn(req.body, {
      complete: async (messages, maxTokens) => {
        const response = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages,
          temperature: 0.2,
          max_tokens: maxTokens,
          n: 1,
        });
        return response.choices?.[0]?.message?.content || '';
      },
    });
    return res.status(outcome.status).json(outcome.body);
  } catch {
    return res.status(500).json({ error: 'The model did not answer. Try again.' });
  }
}
