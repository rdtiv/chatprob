/**
 * Pressure-test candidate "try to fool it" prompts against the exact request
 * ChatProb sends (gpt-4o-mini, temp 1.0, top_p 1, presence_penalty 0.45, n=3,
 * logprobs).
 *
 * A chip only teaches if BOTH hold: the model is confidently wrong (high mean
 * token probability = a wall of green), AND a visitor can see it is wrong
 * without looking anything up. Obscure fabrications fail the second test, so
 * every candidate here has an answer the reader already knows. `correct` is a
 * regex matching a right answer; anything else counts as fooled.
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
  { tag: 'decimals',    prompt: 'Which is bigger: 9.11 or 9.9?',                                        correct: /9\.9 is (bigger|larger|greater)|9\.9\s*>\s*9\.11|bigger.{0,12}9\.9\b/i },
  { tag: 'feathers',    prompt: 'Which weighs more: a pound of feathers or two pounds of bricks?',      correct: /bricks weigh|bricks are heavier|two pounds of bricks weigh/i },
  { tag: 'strawberry',  prompt: "How many r's are in strawberry?",                                      correct: /\b(3|three)\b/i },
  { tag: 'mississippi', prompt: "How many s's are in Mississippi?",                                     correct: /\b(4|four)\b/i },
  { tag: 'sally',       prompt: 'Sally has 3 brothers. Each brother has 2 sisters. How many sisters does Sally have?', correct: /\b(1|one)\b/i },
  { tag: 'sheep',       prompt: 'A farmer has 17 sheep. All but 9 die. How many are left?',             correct: /\b(9|nine)\b/i },
  { tag: 'thirdletter', prompt: "What is the third letter of the word 'thumb'?",                        correct: /\bu\b/i },
  { tag: 'batball',     prompt: 'A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How much does the ball cost?', correct: /0?\.05|5 cents|five cents/i },
  { tag: 'months28',    prompt: 'How many months have 28 days?',                                        correct: /\b(all|12|twelve)\b/i },
  { tag: 'reverse',     prompt: "Spell the word 'lollipop' backwards.",                                 correct: /popillol/i },
];

const band = (p) => (p >= 65 ? 'likely' : p >= 35 ? 'toss' : 'long');

async function run(c) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: c.prompt }],
    temperature: 1.0, top_p: 1, presence_penalty: 0.45,
    max_tokens: 300, n: 3, logprobs: true, top_logprobs: 5,
  });
  const rows = res.choices.map((choice) => {
    const toks = choice.logprobs?.content || [];
    const ps = toks.map((t) => Math.exp(t.logprob) * 100);
    const text = choice.message.content.replace(/\s+/g, ' ').trim();
    return {
      mean: ps.reduce((a, b) => a + b, 0) / (ps.length || 1),
      greenPct: (ps.filter((p) => band(p) === 'likely').length / (ps.length || 1)) * 100,
      fooled: !c.correct.test(text),
      text,
    };
  });
  return { ...c, rows };
}

const out = [];
for (const c of CANDIDATES) {
  try { out.push(await run(c)); } catch (e) { out.push({ ...c, error: e.message }); }
}
for (const r of out) {
  console.log(`\n=== ${r.tag} :: ${r.prompt}`);
  if (r.error) { console.log(`  ERROR ${r.error}`); continue; }
  const fooled = r.rows.filter((x) => x.fooled).length;
  const avgMean = r.rows.reduce((a, b) => a + b.mean, 0) / r.rows.length;
  const avgGreen = r.rows.reduce((a, b) => a + b.greenPct, 0) / r.rows.length;
  console.log(`  fooled ${fooled}/3 | mean p=${avgMean.toFixed(1)}% | green=${avgGreen.toFixed(0)}%`);
  r.rows.forEach((row, i) => console.log(`  [${i}] ${row.fooled ? 'WRONG' : 'right'} p=${row.mean.toFixed(0)}% | ${row.text.slice(0, 200)}`));
}
