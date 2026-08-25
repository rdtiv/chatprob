import { OpenAI } from 'openai';
import { clampTemperature, clampTopP, clampPresencePenalty, clampSeed } from '../../lib/sampling';
import { getWeather } from '../../lib/weather';
import { WEATHER_TOOLS, WEATHER_TOOL_NAME, parseWeatherArguments } from '../../lib/weatherTool';
import { buildUsage } from '../../lib/usage';

export const config = {
  maxDuration: 60,
};

// A multi-city prompt ("weather in Denver and Boston") makes the model emit
// two tool_calls in one response — parallel calls in a single request. Beyond
// this many we stop running them; the cap is structural, not a convention.
const MAX_TOOL_CALLS = 3;

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

    // Some choices call the tool, some may answer in text (sampling is noisy);
    // pick the first choice that actually asked for a tool, not just choice 0.
    const chosen = (response.choices || []).find((c) => c.message?.tool_calls?.length);

    if (!wantsTools || !chosen) {
      const completions = (response.choices || []).map(toUiCompletion);
      if (completions.length === 0) {
        return res.status(502).json({ error: 'Model returned no completions' });
      }

      return res.status(200).json({
        model: response.model,
        completions,
        echoedMessages: sentMessages,
        echoedTools: wantsTools ? WEATHER_TOOLS : null,
        echoedToolChoice: null,
        usage: buildUsage([response.usage], response.model || process.env.OPENAI_MODEL || 'gpt-4o-mini', samplingSnapshot, wantsTools || undefined),
      });
    }

    // Order-insensitive: two samples that ask for the same calls in a
    // different order (Denver-then-Boston vs Boston-then-Denver) still agree.
    const sortedCallPairsKey = (toolCalls) => JSON.stringify(
      (toolCalls || [])
        .map((tc) => [tc.function?.name ?? null, tc.function?.arguments ?? ''])
        .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '') || a[1].localeCompare(b[1]))
    );
    const chosenCallPairs = sortedCallPairsKey(chosen.message.tool_calls);
    const samples = {
      total: (response.choices || []).length,
      agreed: (response.choices || []).filter((c) => sortedCallPairsKey(c.message?.tool_calls) === chosenCallPairs).length,
    };

    const calls = chosen.message.tool_calls.map((call) => ({
      id: call.id,
      name: call.function?.name ?? null,
      arguments: call.function?.arguments ?? '',
    }));
    calls[0].samples = samples;

    // Every call the model asked for gets a tool message back (the model must
    // see its own full request), but only the first MAX_TOOL_CALLS are
    // actually executed — the rest are answered with a skipped-error result
    // and no fetch. Run in parallel; each call's own try/catch stays inside
    // its mapper so one failure never rejects the batch.
    const results = await Promise.all(calls.map(async (call, index) => {
      const startedAt = Date.now();
      const fail = (message) => ({ ok: false, content: JSON.stringify({ error: message }), durationMs: Date.now() - startedAt });
      if (index >= MAX_TOOL_CALLS) {
        return fail('Skipped — this app runs at most 3 tool calls per turn');
      }
      if (call.name !== WEATHER_TOOL_NAME) {
        return fail(`Unknown tool "${call.name ?? '(unnamed)'}"`);
      }
      const parsed = parseWeatherArguments(call.arguments);
      if (!parsed.ok) {
        return fail(parsed.error);
      }
      try {
        const weather = await getWeather(parsed.location);
        return { ok: true, content: JSON.stringify(weather), durationMs: Date.now() - startedAt, status: 200 };
      } catch (error) {
        console.error('Weather tool failed:', error.message);
        return fail(error.message);
      }
    }));

    const round2Messages = [
      ...sentMessages,
      {
        role: 'assistant',
        content: null,
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name ?? '', arguments: c.arguments } })),
      },
      ...calls.map((c, i) => ({ role: 'tool', tool_call_id: c.id, content: results[i].content })),
    ];
    // The schema stays in the prompt so the two requests differ by exactly
    // the tool call and its result (the staircase story), while tool_choice
    // 'none' forbids a second call — the one-round cap is structural.
    const round2 = await openai.chat.completions.create({
      ...createOptions,
      messages: round2Messages,
      tools: WEATHER_TOOLS,
      tool_choice: 'none',
    });

    const completions = (round2.choices || []).map(toUiCompletion);
    if (completions.length === 0) {
      return res.status(502).json({ error: 'Model returned no completions' });
    }

    return res.status(200).json({
      model: round2.model,
      completions,
      echoedMessages: round2Messages,
      echoedTools: WEATHER_TOOLS,
      echoedToolChoice: 'none',
      usage: buildUsage([response.usage, round2.usage], round2.model || process.env.OPENAI_MODEL || 'gpt-4o-mini', samplingSnapshot, true),
      toolCalls: calls,
      toolResults: results,
      toolCall: calls[0],
      toolResult: results[0],
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    if (res.headersSent) {
      return res.end();
    }
    return res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
}
