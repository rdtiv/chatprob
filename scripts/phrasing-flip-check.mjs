/**
 * Checks whether gpt-4o-mini's ranking of the three financial statements flips
 * with the phrasing of the question. Runs each wording three times (n=3 each,
 * so 9 samples per wording) and reports the #1 pick every time.
 */
import fs from 'node:fs';
import OpenAI from 'openai';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const SYSTEM = 'You help people see that language models sample from a next-token distribution. Vary your wording and sentence openings. Keep answers concise (one or two sentences unless asked otherwise).';

const WORDINGS = [
  ['listed-first', 'Rank in order of importance: income statement, balance sheet, cash flow statement.'],
  ['trailing-ask', 'Income statement, balance sheet, cash flow statement. Rank them in order of importance.'],
];
const OPTS = { 'income statement': /income statement/i, 'balance sheet': /balance sheet/i, 'cash flow': /cash flow/i };
const first = (t) => Object.entries(OPTS).map(([n, re]) => [n, t.search(re)]).filter(([, i]) => i >= 0)
  .sort((a, b) => a[1] - b[1]).map(([n]) => n)[0] || '(none)';

for (const [tag, prompt] of WORDINGS) {
  const picks = [];
  for (let round = 0; round < 3; round += 1) {
    const res = await openai.chat.completions.create({
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      temperature: 1.0, top_p: 1, presence_penalty: 0.45, max_tokens: 300, n: 3,
    });
    res.choices.forEach((ch) => picks.push(first(ch.message.content.replace(/\s+/g, ' '))));
  }
  const tally = picks.reduce((acc, p) => ({ ...acc, [p]: (acc[p] || 0) + 1 }), {});
  console.log(`${tag.padEnd(13)} | ${prompt}`);
  console.log(`              -> ${JSON.stringify(tally)}  (9 samples)`);
}
