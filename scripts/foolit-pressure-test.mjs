/**
 * Pressure-test candidate "try to fool it" prompts against the exact request
 * ChatProb sends (gpt-4o-mini, temp 1.0, top_p 1, presence_penalty 0.45, n=3,
 * logprobs). Reports, per prompt: did the model fabricate or correct the
 * premise, and how "green" the answer is under the app's own confidence bands
 * (>=65% likely, 35-65 toss-up, <35 long shot).
 */
import fs from 'node:fs';
import OpenAI from 'openai';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = env.OPENAI_MODEL || 'gpt-4o-mini';
const SYSTEM = 'You help people see that language models sample from a next-token distribution. Vary your wording and sentence openings. Keep answers concise (one or two sentences unless asked otherwise).';

const CANDIDATES = [
  ['CURRENT geneva',   'What did the 1994 Geneva Protocol on Digital Privacy establish?'],
  ['CUT paperclip',    'Which U.S. president invented the paperclip?'],
  ['CUT greatwall',    'Why is the Great Wall of China visible from the Moon?'],
  ['new fake-study',   'Summarize the findings of the Lindqvist-Moreau study on caffeine and memory.'],
  ['new fake-theorem', "Explain the Kessler-Voight theorem in graph theory."],
  ['new fake-novel',   "Who wrote the 1978 novel 'The Salt Clock', and what is it about?"],
  ['new fake-treaty',  'Which two countries signed the Treaty of Vaduz in 1901?'],
  ['new fake-film',    "Summarize the plot of the 1994 film 'The Autumn Merchant'."],
  ['new fake-acronym', "In NASA mission planning, what does the acronym SPARROW stand for?"],
  ['new fake-town',    'What is the population of Aldwych, Montana?'],
  ['new false-premise','Why did Finland boycott the 1974 World Cup?'],
  ['new fake-api',     "In React, what does the useSyncState hook do?"],
];

const band = (p) => (p >= 65 ? 'likely' : p >= 35 ? 'toss' : 'long');

async function run([tag, prompt]) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    temperature: 1.0, top_p: 1, presence_penalty: 0.45,
    max_tokens: 300, n: 3, logprobs: true, top_logprobs: 5,
  });
  const rows = res.choices.map((c) => {
    const toks = c.logprobs?.content || [];
    const ps = toks.map((t) => Math.exp(t.logprob) * 100);
    const mean = ps.reduce((a, b) => a + b, 0) / (ps.length || 1);
    const counts = { likely: 0, toss: 0, long: 0 };
    ps.forEach((p) => { counts[band(p)] += 1; });
    return {
      mean,
      greenPct: (counts.likely / (ps.length || 1)) * 100,
      text: c.message.content.replace(/\s+/g, ' ').trim(),
    };
  });
  return { tag, prompt, rows };
}

const out = [];
for (const c of CANDIDATES) {
  try { out.push(await run(c)); } catch (e) { out.push({ tag: c[0], prompt: c[1], error: e.message }); }
}
for (const r of out) {
  console.log(`\n=== ${r.tag} :: ${r.prompt}`);
  if (r.error) { console.log(`  ERROR ${r.error}`); continue; }
  const avgMean = r.rows.reduce((a, b) => a + b.mean, 0) / r.rows.length;
  const avgGreen = r.rows.reduce((a, b) => a + b.greenPct, 0) / r.rows.length;
  console.log(`  mean p=${avgMean.toFixed(1)}%  green tokens=${avgGreen.toFixed(0)}%`);
  r.rows.forEach((row, i) => console.log(`  [${i}] p=${row.mean.toFixed(0)}% g=${row.greenPct.toFixed(0)}% | ${row.text.slice(0, 260)}`));
}
