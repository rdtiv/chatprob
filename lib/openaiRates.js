// List prices per 1M tokens. Update when OpenAI changes the card.
const RATES = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
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
    outputPerMillion: rates.output,
    approximate: !key,
  };
}

export function tokenCost(tokens, dollarsPerMillion) {
  if (!Number.isFinite(tokens) || tokens < 0) return 0;
  return (tokens / 1_000_000) * dollarsPerMillion;
}

export function turnCost(usage, rates) {
  const input = tokenCost(usage?.prompt_tokens, rates.inputPerMillion);
  const output = tokenCost(usage?.completion_tokens, rates.outputPerMillion);
  return { input, output, total: input + output };
}

export function sumCosts(items) {
  return items.reduce(
    (sum, item) => ({
      input: sum.input + item.input,
      output: sum.output + item.output,
      total: sum.total + item.total,
    }),
    { input: 0, output: 0, total: 0 }
  );
}

export function formatUsd(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(4)}`;
  if (amount >= 0.0001) return `$${amount.toFixed(6)}`;
  return `$${amount.toFixed(8)}`;
}
