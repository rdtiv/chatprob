import { OpenAI } from 'openai';
import { streamCodeTurn } from '../../lib/codeRun';

export const config = {
  maxDuration: 60,
};

// Analyze tab. Direct OpenAI, same key and host as pages/api/chat.js.
// Not the AI Gateway and not Jev. The reply is NDJSON: code, running,
// result, markdown, done. This route does not accept rows.

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
  const controller = new AbortController();
  let closed = false;
  req.on('close', () => {
    if (!res.writableEnded) {
      closed = true;
      controller.abort();
    }
  });

  async function* streamCompletion(messages, maxTokens, signal) {
    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      n: 1,
      stream: true,
    }, { signal });
    for await (const chunk of stream) {
      if (signal?.aborted || closed) {
        stream.controller?.abort?.();
        return;
      }
      const text = chunk.choices?.[0]?.delta?.content || '';
      if (text) yield text;
    }
  }

  try {
    let started = false;
    const outcome = await streamCodeTurn(req.body, {
      signal: controller.signal,
      streamText: streamCompletion,
      emit(event) {
        if (closed || controller.signal.aborted) return;
        if (!started) {
          started = true;
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.flushHeaders?.();
        }
        if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`);
      },
    });
    if (!started) {
      return res.status(outcome.status).json({ error: outcome.error || 'The model did not answer. Try again.' });
    }
    return res.end();
  } catch {
    if (res.headersSent) {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: 'error', message: 'The model did not answer. Try again.' })}\n`);
        res.end();
      }
      return undefined;
    }
    return res.status(500).json({ error: 'The model did not answer. Try again.' });
  }
}
