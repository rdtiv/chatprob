import { OpenAI } from 'openai';
import { clampTemperature, clampTopP, clampPresencePenalty, clampSeed } from '../../lib/sampling';

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

function toTokenProbability(token) {
  const topLogprobs = Object.fromEntries(
    (token.top_logprobs || []).map((alt) => [alt.token, alt.logprob])
  );
  if (typeof token.logprob === 'number' && token.token != null) {
    topLogprobs[token.token] = token.logprob;
  }
  return { token: token.token, logprob: token.logprob, top_logprobs: topLogprobs };
}

function toUiCompletion(choice) {
  const text = (choice.message?.content || '').trim();
  return {
    text,
    tokenProbabilities: (choice.logprobs?.content || []).map(toTokenProbability),
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
    const topP = clampTopP(req.body?.top_p);
    const presencePenalty = clampPresencePenalty(req.body?.presence_penalty);
    const seed = clampSeed(req.body?.seed);
    const hasSystem = apiMessages.some((msg) => msg.role === 'system');

    const sentMessages = hasSystem
      ? apiMessages
      : [{ role: 'system', content: VARIETY_SYSTEM_PROMPT }, ...apiMessages];

    const wantsStream = req.body?.stream === true;

    const createOptions = {
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: sentMessages,
      temperature,
      top_p: topP,
      presence_penalty: presencePenalty,
      ...(seed == null ? {} : { seed }),
      max_tokens: 300,
      n: 3,
      logprobs: true,
      top_logprobs: 5,
    };

    if (wantsStream) {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();
      res.on('error', () => {});
      const send = (event) => {
        if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
      };

      let aborted = false;
      let stream;
      req.on('close', () => {
        aborted = true;
        stream?.controller?.abort?.();
      });

      try {
        send({
          type: 'meta',
          echoedMessages: sentMessages,
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          sampling: { temperature, top_p: topP, presence_penalty: presencePenalty, seed },
        });

        stream = await openai.chat.completions.create({
          ...createOptions,
          stream: true,
          stream_options: { include_usage: true },
        });

        if (aborted) {
          stream.controller?.abort?.();
        }

        let usage = null;
        let servedModel = null;
        for await (const chunk of stream) {
          if (aborted) break;
          if (chunk.model) servedModel = chunk.model;
          if (chunk.usage) usage = chunk.usage;
          for (const choice of chunk.choices || []) {
            const tokens = (choice.logprobs?.content || []).map(toTokenProbability);
            const text = choice.delta?.content || '';
            if (!text && tokens.length === 0) continue;
            send({ type: 'delta', index: choice.index, text, tokens });
          }
        }

        if (!aborted) {
          send({
            type: 'done',
            usage: {
              prompt_tokens: usage?.prompt_tokens ?? null,
              completion_tokens: usage?.completion_tokens ?? null,
              cached_tokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
              // Prefer the served model id, like the non-streaming path does.
              model: servedModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
              sampling: { temperature, top_p: topP, presence_penalty: presencePenalty, seed },
            },
          });
        }
        return res.end();
      } catch (error) {
        console.error('Error calling OpenAI API:', error);
        send({ type: 'error', message: 'Error communicating with OpenAI' });
        return res.end();
      }
    }

    const response = await openai.chat.completions.create(createOptions);

    const completions = (response.choices || []).map(toUiCompletion);
    if (completions.length === 0) {
      return res.status(502).json({ error: 'Model returned no completions' });
    }

    return res.status(200).json({
      model: response.model,
      completions,
      echoedMessages: sentMessages,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? null,
        completion_tokens: response.usage?.completion_tokens ?? null,
        cached_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? null,
        model: response.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        sampling: { temperature, top_p: topP, presence_penalty: presencePenalty, seed },
      },
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    if (res.headersSent) {
      return res.end();
    }
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
}
