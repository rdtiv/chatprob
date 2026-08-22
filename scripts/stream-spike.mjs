// Phase 6 gate spike: does stream:true + n:3 + logprobs work end-to-end?
// Live API calls — run manually only, never in CI.
import { readFileSync } from 'node:fs';
import { OpenAI } from 'openai';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL || undefined });
const model = env.OPENAI_MODEL || 'gpt-4o-mini';

const stream = await openai.chat.completions.create({
  model,
  messages: [{ role: 'user', content: 'Write one short metaphor for rain.' }],
  temperature: 1.0,
  max_tokens: 60,
  n: 3,
  logprobs: true,
  top_logprobs: 5,
  stream: true,
  stream_options: { include_usage: true },
});

const byIndex = { 0: { tokens: 0, withLogprobs: 0, text: '' }, 1: { tokens: 0, withLogprobs: 0, text: '' }, 2: { tokens: 0, withLogprobs: 0, text: '' } };
let chunks = 0, usage = null, indicesSeen = new Set();
for await (const chunk of stream) {
  chunks++;
  if (chunk.usage) usage = chunk.usage;
  for (const choice of chunk.choices || []) {
    indicesSeen.add(choice.index);
    const slot = byIndex[choice.index];
    if (!slot) continue;
    if (choice.delta?.content) slot.text += choice.delta.content;
    const lp = choice.logprobs?.content;
    if (Array.isArray(lp) && lp.length) {
      slot.tokens += lp.length;
      slot.withLogprobs += lp.filter((t) => Array.isArray(t.top_logprobs) && t.top_logprobs.length >= 5).length;
    }
  }
}
console.log('chunks received:', chunks);
console.log('choice indices seen:', [...indicesSeen].sort());
for (const [i, s] of Object.entries(byIndex)) {
  console.log(`choice ${i}: tokens=${s.tokens} with_top5_logprobs=${s.withLogprobs} text="${s.text.slice(0, 60)}"`);
}
console.log('usage:', usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens } : 'ABSENT');
const ok = [...indicesSeen].length === 3 && Object.values(byIndex).every((s) => s.tokens > 0 && s.withLogprobs === s.tokens);
console.log(ok ? 'VERDICT: stream + n=3 + logprobs WORKS end-to-end' : 'VERDICT: gaps found — see counts above');
