import { OpenAI } from 'openai';

export const config = {
  maxDuration: 60,
};

function assistantText(msg) {
  if (msg.completions?.length) {
    const active = msg.completions[msg.activeIndex || 0];
    if (active && typeof active.text === 'string') return active.text;
  }
  if (typeof msg.content === 'string') return msg.content;
  if (msg.content && typeof msg.content.text === 'string') return msg.content.text;
  return '';
}

function toApiMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((msg) => {
      const role = msg.role === 'assistant' || msg.role === 'system' ? msg.role : 'user';
      const content = role === 'assistant' ? assistantText(msg) : String(msg.content ?? '');
      return { role, content };
    })
    .filter((msg) => msg.content.trim().length > 0);
}

const VARIETY_SYSTEM_PROMPT =
  'You help people see that language models sample from a next-token distribution. Vary your wording and sentence openings. Keep answers concise (one or two sentences unless asked otherwise).';

function clampTemperature(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1.2;
  return Math.min(1.8, Math.max(0.2, parsed));
}

function toUiCompletion(choice) {
  const text = (choice.message?.content || '').trim();
  const tokens = choice.logprobs?.content || [];

  return {
    text,
    tokenProbabilities: tokens.map((token) => {
      const topLogprobs = Object.fromEntries(
        (token.top_logprobs || []).map((alt) => [alt.token, alt.logprob])
      );
      if (typeof token.logprob === 'number' && token.token != null) {
        topLogprobs[token.token] = token.logprob;
      }
      return {
        token: token.token,
        logprob: token.logprob,
        top_logprobs: topLogprobs,
      };
    }),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
  }

  try {
    const apiMessages = toApiMessages(req.body?.messages);
    if (apiMessages.length === 0) {
      return res.status(400).json({ error: 'messages are required' });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const temperature = clampTemperature(req.body?.temperature);
    const hasSystem = apiMessages.some((msg) => msg.role === 'system');

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: hasSystem
        ? apiMessages
        : [{ role: 'system', content: VARIETY_SYSTEM_PROMPT }, ...apiMessages],
      temperature,
      presence_penalty: 0.45,
      max_tokens: 300,
      n: 3,
      logprobs: true,
      top_logprobs: 5,
    });

    const completions = (response.choices || []).map(toUiCompletion);
    if (completions.length === 0) {
      return res.status(502).json({ error: 'Model returned no completions' });
    }

    return res.status(200).json({
      model: response.model,
      completions,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? null,
        completion_tokens: response.usage?.completion_tokens ?? null,
      },
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
}
