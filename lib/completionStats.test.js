import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampledLogprob,
  findForkIndex,
  completionStats,
  formatPerplexity,
  formatJointOdds,
  confidenceRgb,
  confidenceColor,
} from './completionStats.js';

test('findForkIndex returns -1 for fewer than two usable completions', () => {
  assert.equal(findForkIndex([]), -1);
  assert.equal(findForkIndex([{ tokenProbabilities: [{ token: 'a' }] }]), -1);
});

test('findForkIndex ignores completions with empty tokenProbabilities', () => {
  const completions = [
    { tokenProbabilities: [] },
    { tokenProbabilities: [{ token: 'a' }] },
    { tokenProbabilities: [{ token: 'a' }] },
  ];
  assert.equal(findForkIndex(completions), -1);
});

test('findForkIndex finds the first index where tokens differ', () => {
  const completions = [
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }, { token: 'c' }] },
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }, { token: 'd' }] },
  ];
  assert.equal(findForkIndex(completions), 2);
});

test('findForkIndex compares tokens, not rendered text', () => {
  const completions = [
    { tokenProbabilities: [{ token: 'he' }, { token: 'llo' }] },
    { tokenProbabilities: [{ token: 'hell' }, { token: 'o' }] },
  ];
  assert.equal(findForkIndex(completions), 0);
});

test('findForkIndex returns -1 when all completions have identical token sequences', () => {
  const completions = [
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }] },
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }] },
  ];
  assert.equal(findForkIndex(completions), -1);
});

test('findForkIndex returns the shorter length when one completion is a prefix of another', () => {
  const completions = [
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }] },
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }, { token: 'c' }] },
  ];
  assert.equal(findForkIndex(completions), 2);
});

test('findForkIndex returns 0 when the completions differ at the first token', () => {
  const completions = [
    { tokenProbabilities: [{ token: 'x' }] },
    { tokenProbabilities: [{ token: 'y' }] },
  ];
  assert.equal(findForkIndex(completions), 0);
});

test('findForkIndex tolerates null entries inside the compared range', () => {
  const completions = [
    { tokenProbabilities: [{ token: 'a' }, null] },
    { tokenProbabilities: [{ token: 'a' }, { token: 'b' }] },
  ];
  assert.doesNotThrow(() => findForkIndex(completions));
  assert.equal(findForkIndex(completions), 1);
});

test('completionStats returns null without token probabilities', () => {
  assert.equal(completionStats({}), null);
  assert.equal(completionStats({ tokenProbabilities: [] }), null);
});

test('completionStats falls back to top_logprobs when logprob is missing', () => {
  const stats = completionStats({
    tokenProbabilities: [{ token: 'a', top_logprobs: { a: -0.5 } }],
  });
  assert.equal(sampledLogprob({ token: 'a', top_logprobs: { a: -0.5 } }), -0.5);
  assert.equal(stats.meanLogprob, -0.5);
});

test('completionStats returns a token count with null statistics when no logprob is finite', () => {
  const stats = completionStats({
    tokenProbabilities: [{ token: 'a' }, { token: 'b' }, { token: 'c' }],
  });
  assert.deepEqual(stats, {
    tokenCount: 3,
    meanLogprob: null,
    perplexity: null,
    jointLog10: null,
    confidence: null,
  });
});

test('completionStats computes perplexity as exp of the negative mean logprob', () => {
  const stats = completionStats({
    tokenProbabilities: [{ token: 'a', logprob: -1 }, { token: 'b', logprob: -3 }],
  });
  assert.equal(stats.meanLogprob, -2);
  assert.ok(Math.abs(stats.perplexity - Math.exp(2)) < 1e-9);
});

test('completionStats computes jointLog10 without ever exponentiating the sum', () => {
  const tokenProbabilities = Array.from({ length: 500 }, (_, i) => ({
    token: `t${i}`,
    logprob: -1,
  }));
  const stats = completionStats({ tokenProbabilities });
  assert.ok(Number.isFinite(stats.jointLog10));
  assert.ok(stats.jointLog10 < 0);
  assert.ok(Math.abs(stats.jointLog10 - -217.15) < 0.1);
  // Math.exp(-500) itself hasn't underflowed to exactly 0 (it's ~7e-218), but it has
  // lost all usable precision as a probability; further steps down this path do hit
  // hard 0 (doubles underflow to 0 below ~exp(-745)), which is why jointLog10 is
  // derived from the sum directly instead of from Math.exp(sumLogprob).
  assert.ok(Math.exp(-500) < 1e-200);
  assert.equal(Math.exp(-1000), 0);
});

test('completionStats confidence is the geometric mean probability as a percentage', () => {
  const stats = completionStats({
    tokenProbabilities: [
      { token: 'a', logprob: Math.log(0.5) },
      { token: 'b', logprob: Math.log(0.5) },
    ],
  });
  assert.ok(Math.abs(stats.confidence - 50) < 1e-9);
});

test('formatPerplexity renders a plausible-word count of at least one', () => {
  assert.equal(formatPerplexity(0.3), 'picking from ~1 plausible word');
  assert.equal(formatPerplexity(NaN), null);
});

test('formatPerplexity singularises one word', () => {
  assert.equal(formatPerplexity(1), 'picking from ~1 plausible word');
  assert.equal(formatPerplexity(7.2), 'picking from ~7 plausible words');
});

test('formatJointOdds renders 1 in a power of ten and never zero', () => {
  assert.equal(formatJointOdds(-5.7), '~1 in 10^6');
  assert.ok(!formatJointOdds(-5.7).includes('10^0'));
  assert.equal(formatJointOdds(NaN), null);
});

test('formatJointOdds falls back to better than 1 in 10 for near-certain completions', () => {
  assert.equal(formatJointOdds(-0.1), 'better than 1 in 10');
  assert.equal(formatJointOdds(0), 'better than 1 in 10');
});

test('confidenceColor returns transparent for a null percentage', () => {
  assert.equal(confidenceRgb(null), null);
  assert.equal(confidenceColor(null, 0.3), 'transparent');
  assert.equal(confidenceColor(NaN, 0.5), 'transparent');
});

test('completionStats excludes sentinel logprobs from the statistics', () => {
  const completion = {
    tokenProbabilities: [
      { token: 'a', logprob: -0.5 },
      { token: 'b', logprob: -9999 },
      { token: 'c', logprob: -1.5 },
    ],
  };
  const stats = completionStats(completion);
  assert.equal(stats.tokenCount, 3);
  assert.ok(Math.abs(stats.meanLogprob - -1) < 1e-12);
  assert.ok(stats.perplexity < 10);
  assert.ok(stats.jointLog10 > -2);
});

test('formatPerplexity refuses absurd magnitudes', () => {
  assert.equal(formatPerplexity(4.67e92), null);
  assert.equal(formatPerplexity(0), null);
  assert.equal(formatPerplexity(-3), null);
});

test('formatJointOdds refuses absurd exponents', () => {
  assert.equal(formatJointOdds(-4355), null);
});
