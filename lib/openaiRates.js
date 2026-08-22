// List prices per 1M tokens. Update when OpenAI changes the card.
// cachedInput is the discounted rate for prompt tokens served from OpenAI's
// prompt cache. VERIFY these against the current pricing page before shipping.
const RATES = {
  'gpt-4o-mini':  { input: 0.15, cachedInput: 0.075, output: 0.60 },
  'gpt-4o':       { input: 2.50, cachedInput: 1.25,  output: 10.00 },
  'gpt-4.1-nano': { input: 0.10, cachedInput: 0.025, output: 0.40 },
  'gpt-4.1-mini': { input: 0.40, cachedInput: 0.10,  output: 1.60 },
  'gpt-4.1':      { input: 2.00, cachedInput: 0.50,  output: 8.00 },
};

export function rateFor(model) {
  const id = String(model || 'gpt-4o-mini').toLowerCase();
  const key = Object.keys(RATES)
    .sort((a, b) => b.length - a.length)
    .find((name) => id === name || id.startsWith(`${name}-`));
  const rates = RATES[key] || RATES['gpt-4o-mini'];
  return {
    model: key || 'gpt-4o-mini',
    inputPerMillion: rates.input,
    cachedInputPerMillion: rates.cachedInput ?? rates.input * 0.5,
    outputPerMillion: rates.output,
    approximate: !key,
  };
}

export function tokenCost(tokens, dollarsPerMillion) {
  if (!Number.isFinite(tokens) || tokens < 0) return 0;
  return (tokens / 1_000_000) * dollarsPerMillion;
}

export function turnCost(usage, rates) {
  const prompt = Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens : 0;
  const rawCached = Number.isFinite(usage?.cached_tokens) ? usage.cached_tokens : 0;
  const cached = Math.min(Math.max(rawCached, 0), prompt);
  const input = tokenCost(prompt - cached, rates.inputPerMillion);
  const cachedInput = tokenCost(cached, rates.cachedInputPerMillion);
  const output = tokenCost(usage?.completion_tokens, rates.outputPerMillion);
  return { input, cachedInput, output, total: input + cachedInput + output };
}

export function sumCosts(items) {
  return items.reduce(
    (sum, item) => ({
      input: sum.input + item.input,
      cachedInput: sum.cachedInput + item.cachedInput,
      output: sum.output + item.output,
      total: sum.total + item.total,
    }),
    { input: 0, cachedInput: 0, output: 0, total: 0 }
  );
}

export function formatUsd(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  const n = Math.round(0.01 / amount);
  if (n >= 2 && n <= 10_000) return `≈ 1/${n} of a cent`;
  return 'less than 1/10,000 of a cent';
}

export function formatScale(usdPerTurn) {
  if (!Number.isFinite(usdPerTurn) || usdPerTurn <= 0) return null;
  const total = usdPerTurn * 1e6;
  let dollars;
  if (total >= 0.01) {
    dollars = `$${total.toFixed(2)}`;
  } else {
    dollars = 'under a cent';
  }
  return `a million chats like this ≈ ${dollars}`;
}
