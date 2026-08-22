import test from 'node:test';
import assert from 'node:assert/strict';
import { rateFor, tokenCost, turnCost, sumCosts, formatUsd, formatScale } from './openaiRates.js';

test('rateFor matches an exact model id', () => {
  const rates = rateFor('gpt-4o');
  assert.equal(rates.model, 'gpt-4o');
  assert.equal(rates.inputPerMillion, 2.50);
  assert.equal(rates.outputPerMillion, 10.00);
  assert.equal(rates.approximate, false);
});

test('rateFor matches a dated model suffix', () => {
  const rates = rateFor('gpt-4o-mini-2024-07-18');
  assert.equal(rates.model, 'gpt-4o-mini');
  assert.equal(rates.inputPerMillion, 0.15);
  assert.equal(rates.outputPerMillion, 0.60);
  assert.equal(rates.approximate, false);
});

test('rateFor falls back to gpt-4o-mini and flags the result approximate', () => {
  const rates = rateFor('some-unknown-model');
  assert.equal(rates.model, 'gpt-4o-mini');
  assert.equal(rates.inputPerMillion, 0.15);
  assert.equal(rates.outputPerMillion, 0.60);
  assert.equal(rates.approximate, true);
});

test('rateFor returns a cached input rate for every table entry', () => {
  const models = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1'];
  for (const model of models) {
    const rates = rateFor(model);
    assert.ok(Number.isFinite(rates.cachedInputPerMillion), `${model} cachedInputPerMillion should be finite`);
    assert.ok(rates.cachedInputPerMillion < rates.inputPerMillion, `${model} cachedInputPerMillion should be less than inputPerMillion`);
  }
});

test('rateFor derives a cached rate when the table omits one', () => {
  const rates = rateFor('some-unknown-model');
  assert.equal(rates.approximate, true);
  assert.equal(rates.cachedInputPerMillion, rates.inputPerMillion * 0.5);
});

test('tokenCost returns zero for non-finite or negative token counts', () => {
  assert.equal(tokenCost(undefined, 1), 0);
  assert.equal(tokenCost(null, 1), 0);
  assert.equal(tokenCost(NaN, 1), 0);
  assert.equal(tokenCost(-5, 1), 0);
});

test('turnCost without cached tokens matches the uncached input rate', () => {
  const rates = rateFor('gpt-4o-mini');
  const usage = { prompt_tokens: 1000, completion_tokens: 500 };
  const cost = turnCost(usage, rates);
  assert.equal(cost.input, tokenCost(1000, rates.inputPerMillion));
  assert.equal(cost.cachedInput, 0);
  assert.equal(cost.output, tokenCost(500, rates.outputPerMillion));
  assert.equal(cost.total, cost.input + cost.cachedInput + cost.output);
});

test('turnCost treats null cached tokens as zero', () => {
  const rates = rateFor('gpt-4o-mini');
  const usage = { prompt_tokens: 1000, completion_tokens: 500, cached_tokens: null };
  const cost = turnCost(usage, rates);
  assert.equal(cost.input, tokenCost(1000, rates.inputPerMillion));
  assert.equal(cost.cachedInput, 0);
});

test('turnCost prices cached tokens at the discounted rate', () => {
  const rates = rateFor('gpt-4o');
  const usage = { prompt_tokens: 1000, completion_tokens: 200, cached_tokens: 400 };
  const cost = turnCost(usage, rates);
  assert.equal(cost.input, tokenCost(600, rates.inputPerMillion));
  assert.equal(cost.cachedInput, tokenCost(400, rates.cachedInputPerMillion));
});

test('turnCost clamps cached tokens above the prompt total', () => {
  const rates = rateFor('gpt-4o');
  const usage = { prompt_tokens: 100, completion_tokens: 50, cached_tokens: 9999 };
  const cost = turnCost(usage, rates);
  assert.equal(cost.input, 0);
  assert.equal(cost.cachedInput, tokenCost(100, rates.cachedInputPerMillion));
  assert.ok(cost.input >= 0);
});

test('turnCost clamps negative cached tokens to zero', () => {
  const rates = rateFor('gpt-4o');
  const usage = { prompt_tokens: 1000, completion_tokens: 50, cached_tokens: -50 };
  const cost = turnCost(usage, rates);
  assert.equal(cost.cachedInput, 0);
  assert.equal(cost.input, tokenCost(1000, rates.inputPerMillion));
});

test('turnCost total equals input plus cachedInput plus output', () => {
  const rates = rateFor('gpt-4.1');
  const usage = { prompt_tokens: 3000, completion_tokens: 700, cached_tokens: 1200 };
  const cost = turnCost(usage, rates);
  assert.equal(cost.total, cost.input + cost.cachedInput + cost.output);
});

test('sumCosts accumulates cached input across turns', () => {
  const rates = rateFor('gpt-4o');
  const costA = turnCost({ prompt_tokens: 1000, completion_tokens: 100, cached_tokens: 400 }, rates);
  const costB = turnCost({ prompt_tokens: 2000, completion_tokens: 200, cached_tokens: 900 }, rates);
  const sum = sumCosts([costA, costB]);
  assert.equal(sum.cachedInput, costA.cachedInput + costB.cachedInput);
  assert.equal(sum.input, costA.input + costB.input);
  assert.equal(sum.output, costA.output + costB.output);
  assert.equal(sum.total, costA.total + costB.total);
});

test('formatUsd never renders a bare zero for a positive amount', () => {
  assert.notEqual(formatUsd(1e-9), '$0');
});

test('formatUsd renders a fraction-of-a-cent phrasing for small amounts', () => {
  assert.equal(formatUsd(6e-5), '≈ 1/167 of a cent');
});

test('formatUsd renders a plain dollar amount at or above a cent', () => {
  assert.equal(formatUsd(0.02), '$0.02');
});

test('formatUsd falls back to a floor phrasing below 1/10,000 of a cent', () => {
  assert.equal(formatUsd(1e-9), 'less than 1/10,000 of a cent');
});

test('formatUsd renders $0 for zero or non-positive amounts', () => {
  assert.equal(formatUsd(0), '$0');
});

test('formatUsd renders two decimal places at or above a dollar', () => {
  assert.equal(formatUsd(1.5), '$1.50');
});

test('formatUsd renders a half-cent fraction', () => {
  assert.equal(formatUsd(0.005), '≈ 1/2 of a cent');
});

test('formatScale projects a per-turn cost to a million chats', () => {
  assert.equal(formatScale(6e-5), 'a million chats like this ≈ $60.00');
});

test('formatScale returns null for zero or non-positive amounts', () => {
  assert.equal(formatScale(0), null);
});

test('formatUsd shows just-under-a-cent amounts as $0.01, not as a tiny fraction', () => {
  assert.equal(formatUsd(0.008), '$0.01');
  assert.equal(formatUsd(0.0067), '$0.01');
  assert.equal(formatUsd(0.0066), '≈ 1/2 of a cent');
});
