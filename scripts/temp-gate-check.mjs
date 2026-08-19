// Invariant-4 empirical gate: do returned logprobs move with temperature?
// Compares position-0 top_logprobs for the same prompt at temp 0.2 vs 1.8.
// Makes two live OpenAI API calls using ../.env — run manually only, never in CI.
import { readFileSync } from 'node:fs';
import { OpenAI } from 'openai';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
);

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL || undefined });
const model = env.OPENAI_MODEL || 'gpt-4o-mini';

async function probe(temperature) {
  const res = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: process.argv[2] || 'Reply with exactly: The sky is blue.' }],
    temperature,
    max_tokens: 8,
    n: 1,
    logprobs: true,
    top_logprobs: 5,
    seed: 42,
  });
  const first = res.choices[0].logprobs.content[0];
  return Object.fromEntries(first.top_logprobs.map((alt) => [alt.token, alt.logprob]));
}

const [low, high] = await Promise.all([probe(0.2), probe(1.8)]);
console.log('model:', model);
console.log('temp 0.2 position-0 top_logprobs:', JSON.stringify(low, null, 2));
console.log('temp 1.8 position-0 top_logprobs:', JSON.stringify(high, null, 2));

const shared = Object.keys(low).filter((t) => t in high);
let maxDelta = 0;
for (const t of shared) maxDelta = Math.max(maxDelta, Math.abs(low[t] - high[t]));
console.log(`shared tokens: ${shared.length}, max |delta logprob|: ${maxDelta.toFixed(4)}`);
console.log(maxDelta < 0.15
  ? 'VERDICT: logprobs are (near-)invariant to temperature — A1 premise HOLDS'
  : 'VERDICT: logprobs MOVE with temperature — A1 premise FALSE, rewrite card copy');
