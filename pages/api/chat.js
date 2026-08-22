import { OpenAI } from 'openai';
import { clampTemperature, clampTopP, clampPresencePenalty, clampSeed } from '../../lib/sampling';
import { getWeather } from '../../lib/weather';
import { WEATHER_TOOLS, WEATHER_TOOL_NAME, parseWeatherArguments } from '../../lib/weatherTool';

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

function sumNullable(values) {
  const present = values.filter((v) => Number.isFinite(v));
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function roundUsage(raw) {
  return {
    prompt_tokens: raw?.prompt_tokens ?? null,
    completion_tokens: raw?.completion_tokens ?? null,
    cached_tokens: raw?.prompt_tokens_details?.cached_tokens ?? null,
  };
}

// One turn can cost more than one request. The totals are what you paid;
// `rounds` is the itemised receipt, and only appears when there is more
// than one line on it.
function buildUsage(rawUsages, model, sampling) {
  const rounds = rawUsages.map(roundUsage);
  return {
    prompt_tokens: sumNullable(rounds.map((r) => r.prompt_tokens)),
    completion_tokens: sumNullable(rounds.map((r) => r.completion_tokens)),
    cached_tokens: sumNullable(rounds.map((r) => r.cached_tokens)),
    model,
    sampling,
    ...(rounds.length > 1 ? { rounds } : {}),
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

    const wantsTools = req.body?.tools === true;
    const wantsStream = req.body?.stream === true && !wantsTools;
    const samplingSnapshot = { temperature, top_p: topP, presence_penalty: presencePenalty, seed };

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

    const round1Options = wantsTools ? { ...createOptions, tools: WEATHER_TOOLS } : createOptions;

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
          sampling: samplingSnapshot,
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
            // Prefer the served model id, like the non-streaming path does.
            usage: buildUsage([usage], servedModel || process.env.OPENAI_MODEL || 'gpt-4o-mini', samplingSnapshot),
          });
        }
        return res.end();
      } catch (error) {
        console.error('Error calling OpenAI API:', error);
        send({ type: 'error', message: 'Error communicating with OpenAI' });
        return res.end();
      }
    }

    const response = await openai.chat.completions.create(round1Options);

    const first = (response.choices || [])[0];
    const toolCallRaw = first?.message?.tool_calls?.[0];

    if (!wantsTools || !toolCallRaw) {
      const completions = (response.choices || []).map(toUiCompletion);
      if (completions.length === 0) {
        return res.status(502).json({ error: 'Model returned no completions' });
      }

      return res.status(200).json({
        model: response.model,
        completions,
        echoedMessages: sentMessages,
        usage: buildUsage([response.usage], response.model || process.env.OPENAI_MODEL || 'gpt-4o-mini', samplingSnapshot),
      });
    }

    const toolCall = {
      id: toolCallRaw.id,
      name: toolCallRaw.function?.name ?? null,
      arguments: toolCallRaw.function?.arguments ?? '',
      samples: {
        total: (response.choices || []).length,
        agreed: (response.choices || []).filter((c) => {
          const tc = c.message?.tool_calls?.[0];
          return tc?.function?.name === toolCallRaw.function?.name
            && tc?.function?.arguments === toolCallRaw.function?.arguments;
        }).length,
      },
    };

    const startedAt = Date.now();
    let toolResult;
    if (toolCall.name !== WEATHER_TOOL_NAME) {
      toolResult = { ok: false, content: JSON.stringify({ error: `Unknown tool "${toolCall.name}"` }), durationMs: Date.now() - startedAt };
    } else {
      const parsed = parseWeatherArguments(toolCall.arguments);
      if (!parsed.ok) {
        toolResult = { ok: false, content: JSON.stringify({ error: parsed.error }), durationMs: Date.now() - startedAt };
      } else {
        try {
          const weather = await getWeather(parsed.location);
          toolResult = { ok: true, content: JSON.stringify(weather), durationMs: Date.now() - startedAt, status: 200 };
        } catch (error) {
          console.error('Weather tool failed:', error.message);
          toolResult = { ok: false, content: JSON.stringify({ error: error.message }), durationMs: Date.now() - startedAt };
        }
      }
    }

    const round2Messages = [
      ...sentMessages,
      { role: 'assistant', content: null, tool_calls: [{ id: toolCall.id, type: 'function', function: { name: toolCallRaw.function.name, arguments: toolCallRaw.function.arguments } }] },
      { role: 'tool', tool_call_id: toolCall.id, content: toolResult.content },
    ];
    const round2 = await openai.chat.completions.create({ ...round1Options, messages: round2Messages });

    const completions = (round2.choices || []).map(toUiCompletion);
    if (completions.length === 0) {
      return res.status(502).json({ error: 'Model returned no completions' });
    }

    return res.status(200).json({
      model: round2.model,
      completions,
      echoedMessages: round2Messages,
      usage: buildUsage([response.usage, round2.usage], round2.model || process.env.OPENAI_MODEL || 'gpt-4o-mini', samplingSnapshot),
      toolCall,
      toolResult,
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    if (res.headersSent) {
      return res.end();
    }
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
}
