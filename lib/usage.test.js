import test from 'node:test';
import assert from 'node:assert/strict';
import { sumNullable, buildUsage, formatTokenSummary } from './usage.js';

test('buildUsage single-round output has exactly the expected keys, in order, and no rounds', () => {
  const usage = buildUsage(
    [{ prompt_tokens: 10, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 3 } }],
    'gpt-4o-mini',
    { temperature: 1 }
  );

  assert.deepEqual(Object.keys(usage), ['prompt_tokens', 'completion_tokens', 'cached_tokens', 'model', 'sampling']);
  assert.equal(usage.prompt_tokens, 10);
  assert.equal(usage.completion_tokens, 20);
  assert.equal(usage.cached_tokens, 3);
  assert.equal(usage.model, 'gpt-4o-mini');
  assert.deepEqual(usage.sampling, { temperature: 1 });
  assert.equal('rounds' in usage, false);
});

test('buildUsage two rounds sums totals and attaches a rounds array of 2 with cached_tokens per round', () => {
  const usage = buildUsage(
    [
      { prompt_tokens: 10, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 3 } },
      { prompt_tokens: 15, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 0 } },
    ],
    'gpt-4o-mini',
    { temperature: 1 }
  );

  assert.equal(usage.prompt_tokens, 25);
  assert.equal(usage.completion_tokens, 25);
  assert.equal(usage.cached_tokens, 3);
  assert.equal(usage.rounds.length, 2);
  assert.deepEqual(usage.rounds[0], { prompt_tokens: 10, completion_tokens: 20, cached_tokens: 3 });
  assert.deepEqual(usage.rounds[1], { prompt_tokens: 15, completion_tokens: 5, cached_tokens: 0 });
});

test('buildUsage with a null raw usage produces nulls', () => {
  const usage = buildUsage([null], 'gpt-4o-mini', { temperature: 1 });

  assert.equal(usage.prompt_tokens, null);
  assert.equal(usage.completion_tokens, null);
  assert.equal(usage.cached_tokens, null);
});

test('buildUsage sums zeros to 0, not null', () => {
  const usage = buildUsage(
    [{ prompt_tokens: 0, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }],
    'gpt-4o-mini',
    { temperature: 1 }
  );

  assert.equal(usage.prompt_tokens, 0);
  assert.equal(usage.completion_tokens, 0);
  assert.equal(usage.cached_tokens, 0);
});

test('buildUsage treats a missing prompt_tokens_details as a null cached_tokens', () => {
  const usage = buildUsage([{ prompt_tokens: 10, completion_tokens: 20 }], 'gpt-4o-mini', { temperature: 1 });

  assert.equal(usage.cached_tokens, null);
});

test('buildUsage([], model, sampling) produces all-null sums, no rounds key, and keeps model/sampling', () => {
  const usage = buildUsage([], 'gpt-4o-mini', { temperature: 1 });

  assert.equal(usage.prompt_tokens, null);
  assert.equal(usage.completion_tokens, null);
  assert.equal(usage.cached_tokens, null);
  assert.equal(usage.model, 'gpt-4o-mini');
  assert.deepEqual(usage.sampling, { temperature: 1 });
  assert.equal('rounds' in usage, false);
});

test('sumNullable([null, 5]) returns 5', () => {
  assert.equal(sumNullable([null, 5]), 5);
});

test('sumNullable([]) returns null', () => {
  assert.equal(sumNullable([]), null);
});

test('formatTokenSummary renders one request as "N in · M out"', () => {
  assert.equal(formatTokenSummary({ prompt_tokens: 143, completion_tokens: 13 }), '143 in · 13 out');
});

test('formatTokenSummary renders a tool turn as the per-request prompts plus the summed output', () => {
  const usage = { prompt_tokens: 611, completion_tokens: 49, rounds: [
    { prompt_tokens: 270, completion_tokens: 9 }, { prompt_tokens: 341, completion_tokens: 40 },
  ] };
  assert.equal(formatTokenSummary(usage), '270 + 341 in · 49 out · 2 requests');
});

test('formatTokenSummary omits the out segment when completion_tokens is missing, and returns null without prompt_tokens', () => {
  assert.equal(formatTokenSummary({ prompt_tokens: 50, completion_tokens: null }), '50 in');
  assert.equal(formatTokenSummary({ completion_tokens: 5 }), null);
  assert.equal(formatTokenSummary(null), null);
});
