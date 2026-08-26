import test from 'node:test';
import assert from 'node:assert/strict';
import { sumNullable, buildUsage, formatTokenSummary, formatUserTokenLine, userPromptBreakdown, selectedReplyTokens, offeredTools } from './usage.js';

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

test('buildUsage omits tools unless the fourth argument is true', () => {
  const off = buildUsage(
    [{ prompt_tokens: 10, completion_tokens: 2 }],
    'gpt-4o-mini',
    { temperature: 1 }
  );
  assert.equal('tools' in off, false);

  const on = buildUsage(
    [{ prompt_tokens: 10, completion_tokens: 2 }],
    'gpt-4o-mini',
    { temperature: 1 },
    true
  );
  assert.equal(on.tools, true);

  const coerced = buildUsage(
    [{ prompt_tokens: 10, completion_tokens: 2 }],
    'gpt-4o-mini',
    { temperature: 1 },
    false
  );
  assert.equal('tools' in coerced, false);
});

test('formatUserTokenLine is the in-flight count until prompt tokens arrive', () => {
  assert.equal(formatUserTokenLine(6), '≈ 6 tokens');
  assert.equal(formatUserTokenLine(6, null), '≈ 6 tokens');
  assert.equal(formatUserTokenLine(NaN, 143), null);
});

test('formatUserTokenLine first send is this message plus the unitemised remainder', () => {
  assert.equal(
    formatUserTokenLine(5, 50),
    '5 this message + 45 system and wrappers = 50 input tokens'
  );
  assert.equal(
    formatUserTokenLine(5, 50, true),
    '5 this message + 45 system, wrappers, and the tool schema = 50 input tokens'
  );
});

test('formatUserTokenLine later send is the billed remainder chain', () => {
  assert.equal(
    formatUserTokenLine({
      messageTokens: 5,
      promptTokens: 106,
      replayedTokens: 50,
      lastReplyTokens: 43,
    }),
    '50 from earlier turns + 43 last reply + 5 this message + 8 wrappers = 106 input tokens'
  );
});

test('formatUserTokenLine names the schema in the remainder when tools just turned on', () => {
  assert.equal(
    formatUserTokenLine({
      messageTokens: 5,
      promptTokens: 186,
      replayedTokens: 50,
      lastReplyTokens: 43,
      toolsOffered: true,
      previousToolsOffered: false,
    }),
    '50 from earlier turns + 43 last reply + 5 this message + 88 wrappers and the tool schema = 186 input tokens'
  );
});

test('formatUserTokenLine names the schema on the total when it was already in history', () => {
  assert.equal(
    formatUserTokenLine({
      messageTokens: 5,
      promptTokens: 186,
      replayedTokens: 130,
      lastReplyTokens: 43,
      toolsOffered: true,
      previousToolsOffered: true,
    }),
    '130 from earlier turns + 43 last reply + 5 this message + 8 wrappers = 186 input tokens, including the tool schema'
  );
});

test('userPromptBreakdown refuses a chain that does not sum to the billed prompt', () => {
  assert.equal(userPromptBreakdown({
    messageTokens: 5,
    promptTokens: 106,
    replayedTokens: 50,
    lastReplyTokens: 80,
  }), null);
  assert.equal(
    formatUserTokenLine({
      messageTokens: 5,
      promptTokens: 106,
      replayedTokens: 50,
      lastReplyTokens: 80,
    }),
    '5 this message · 106 input tokens'
  );
});

test('formatUserTokenLine without a last-reply count keeps last reply inside the new remainder', () => {
  assert.equal(
    formatUserTokenLine({
      messageTokens: 5,
      promptTokens: 106,
      replayedTokens: 50,
    }),
    '50 from earlier turns + 5 this message + 51 last reply and wrappers = 106 input tokens'
  );
});

test('userPromptBreakdown treats a replayed count larger than this prompt as a first send', () => {
  const breakdown = userPromptBreakdown({
    messageTokens: 5,
    promptTokens: 40,
    replayedTokens: 50,
    lastReplyTokens: 43,
  });
  assert.deepEqual(breakdown.addends, [
    { tokens: 5, label: 'this message' },
    { tokens: 35, label: 'system and wrappers' },
  ]);
});

test('selectedReplyTokens reads the active tab length', () => {
  assert.equal(selectedReplyTokens(null), null);
  assert.equal(selectedReplyTokens({
    activeIndex: 1,
    completions: [
      { tokenProbabilities: [1, 2] },
      { tokenProbabilities: [1, 2, 3, 4] },
    ],
  }), 4);
});

test('offeredTools keys on usage.tools and falls back to echo or tool cards', () => {
  assert.equal(offeredTools(null), false);
  assert.equal(offeredTools({ usage: { prompt_tokens: 10 } }), false);
  assert.equal(offeredTools({ usage: { tools: true } }), true);
  assert.equal(offeredTools({ echoedTools: [{ type: 'function' }] }), true);
  assert.equal(offeredTools({ echoedTools: [] }), false);
  assert.equal(offeredTools({ toolCall: { name: 'get_weather' } }), true);
  assert.equal(offeredTools({ toolCalls: [{ name: 'get_weather' }] }), true);
});
