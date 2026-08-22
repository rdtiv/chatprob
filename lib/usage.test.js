import test from 'node:test';
import assert from 'node:assert/strict';
import { sumNullable, buildUsage } from './usage.js';

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

test('sumNullable([null, 5]) returns 5', () => {
  assert.equal(sumNullable([null, 5]), 5);
});

test('sumNullable([]) returns null', () => {
  assert.equal(sumNullable([]), null);
});
