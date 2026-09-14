import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WINNER_TAKE_ALL_EPSILON,
  buildFrozenSet,
  frozenRows,
  rawOdds,
  oddsAmongCandidates,
  nucleusMembership,
  nucleusUiVisible,
  formatPercent,
} from './resoftmax.js';

test('buildFrozenSet keeps the sampled token when it is below the 0.5% cutoff', () => {
  const frozen = buildFrozenSet({
    topLogprobs: { A: -0.1, B: -0.2, C: -0.3, D: -0.4, E: -10 },
    sampledToken: 'E',
    sampledLogprob: -10,
  });
  assert.equal(frozen.candidates.length, 5);
  assert.equal(frozen.sampledOutside, null);
  const sampledRow = frozen.candidates.find((c) => c.token === 'E');
  assert.ok(sampledRow);
  assert.equal(sampledRow.isSampled, true);
  assert.equal(sampledRow.logprob, -10);
});

test('buildFrozenSet caps alternatives at five rows', () => {
  const topLogprobs = {
    A: -0.1, B: -0.2, C: -0.3, D: -0.4, E: -0.5, F: -0.6, G: -0.7, H: -0.8,
  };
  const frozen = buildFrozenSet({ topLogprobs, sampledToken: null, sampledLogprob: null });
  assert.equal(frozen.candidates.length, 5);
  assert.equal(frozen.sampledOutside, null);
});

test('buildFrozenSet drops alternatives below the 0.5% cutoff', () => {
  const frozen = buildFrozenSet({
    topLogprobs: { A: -0.1, B: -10 },
    sampledToken: 'A',
    sampledLogprob: -0.1,
  });
  assert.equal(frozen.candidates.length, 1);
  assert.equal(frozen.candidates[0].token, 'A');
  assert.ok(!frozen.candidates.some((c) => c.token === 'B'));
  assert.equal(frozen.sampledOutside, null);
});

test('buildFrozenSet puts a sampled token outside the top five in sampledOutside, never twice', () => {
  const topLogprobs = {
    A: -0.1, B: -0.2, C: -0.3, // above cutoff
    D: -8, E: -9,              // below cutoff
    S: -10,                    // sampled, rank 5 (0-indexed), i.e. 6th place
  };
  const frozen = buildFrozenSet({ topLogprobs, sampledToken: 'S', sampledLogprob: -10 });

  assert.ok(!frozen.candidates.some((c) => c.isSampled));
  assert.ok(frozen.sampledOutside !== null);
  assert.equal(frozen.sampledOutside.token, 'S');

  const rows = frozenRows(frozen);
  const tokens = rows.map((r) => r.token);
  assert.equal(new Set(tokens).size, tokens.length);
  assert.equal(tokens.filter((t) => t === 'S').length, 1);
});

test('buildFrozenSet synthesises the sampled row when top_logprobs omits it', () => {
  const frozen = buildFrozenSet({
    topLogprobs: { A: -0.1, B: -0.2 },
    sampledToken: 'C',
    sampledLogprob: -5,
  });
  const sampledRow = frozen.candidates.find((c) => c.token === 'C');
  assert.ok(sampledRow);
  assert.equal(sampledRow.isSampled, true);
  assert.equal(sampledRow.logprob, -5);
  assert.equal(frozen.sampledOutside, null);
});

test('buildFrozenSet ranks ties by first-seen order', () => {
  const frozen = buildFrozenSet({
    topLogprobs: { A: -1, B: -1, C: -1 },
    sampledToken: null,
    sampledLogprob: null,
  });
  assert.deepEqual(frozen.candidates.map((c) => c.token), ['A', 'B', 'C']);
});

test('buildFrozenSet ignores non-finite logprobs', () => {
  const frozen = buildFrozenSet({
    topLogprobs: { A: -0.1, B: NaN, C: Infinity, D: -0.2 },
    sampledToken: null,
    sampledLogprob: null,
  });
  const tokens = frozen.candidates.map((c) => c.token);
  assert.ok(!tokens.includes('B'));
  assert.ok(!tokens.includes('C'));
  assert.deepEqual(tokens.sort(), ['A', 'D']);
});

test('frozenRows lists candidates first and the outside-top sampled row last', () => {
  const topLogprobs = {
    A: -0.1, B: -0.2, C: -0.3,
    D: -8, E: -9,
    S: -10,
  };
  const frozen = buildFrozenSet({ topLogprobs, sampledToken: 'S', sampledLogprob: -10 });
  const rows = frozenRows(frozen);
  assert.deepEqual(rows.slice(0, rows.length - 1), frozen.candidates);
  assert.deepEqual(rows[rows.length - 1], frozen.sampledOutside);
});

test('oddsAmongCandidates sums to 1 at every temperature', () => {
  const rows = [
    { token: 'A', logprob: -0.5, isSampled: true },
    { token: 'B', logprob: -1.5, isSampled: false },
    { token: 'C', logprob: -3.0, isSampled: false },
  ];
  for (const t of [0.2, 0.5, 1, 1.2, 1.8]) {
    const odds = oddsAmongCandidates(rows, t);
    const sum = odds.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `T=${t} sum=${sum}`);
  }
});

test('oddsAmongCandidates at T=1 differs from rawOdds', () => {
  const rows = [
    { token: 'A', logprob: -0.5, isSampled: true },
    { token: 'B', logprob: -1.5, isSampled: false },
    { token: 'C', logprob: -3.0, isSampled: false },
  ];
  const raw = rawOdds(rows);
  const rawSum = raw.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(rawSum - 1) > 1e-6, `raw sum should not be 1, got ${rawSum}`);

  const among = oddsAmongCandidates(rows, 1);
  const differs = among.some((v, i) => Math.abs(v - raw[i]) > 1e-9);
  assert.ok(differs);
});

test('oddsAmongCandidates at T=1 equals rawOdds renormalised over the frozen set', () => {
  const rows = [
    { token: 'A', logprob: -0.2, isSampled: true },
    { token: 'B', logprob: -1.1, isSampled: false },
    { token: 'C', logprob: -2.7, isSampled: false },
    { token: 'D', logprob: -6.0, isSampled: false },
  ];
  const raw = rawOdds(rows);
  const rawSum = raw.reduce((a, b) => a + b, 0);
  const expected = raw.map((r) => r / rawSum);
  const among = oddsAmongCandidates(rows, 1);
  among.forEach((v, i) => {
    assert.ok(Math.abs(v - expected[i]) < 1e-9, `index ${i}: ${v} vs ${expected[i]}`);
  });
});

test('oddsAmongCandidates flattens monotonically as temperature rises', () => {
  const rows = [
    { token: 'A', logprob: -0.1, isSampled: true },
    { token: 'B', logprob: -2, isSampled: false },
    { token: 'C', logprob: -5, isSampled: false },
  ];
  const p05 = oddsAmongCandidates(rows, 0.5);
  const p10 = oddsAmongCandidates(rows, 1.0);
  const p18 = oddsAmongCandidates(rows, 1.8);

  const max05 = Math.max(...p05), max10 = Math.max(...p10), max18 = Math.max(...p18);
  const min05 = Math.min(...p05), min10 = Math.min(...p10), min18 = Math.min(...p18);

  assert.ok(max05 > max10, `${max05} > ${max10}`);
  assert.ok(max10 > max18, `${max10} > ${max18}`);
  assert.ok(min05 < min10, `${min05} < ${min10}`);
  assert.ok(min10 < min18, `${min10} < ${min18}`);
});

test('oddsAmongCandidates preserves the frozen row order and length at every temperature', () => {
  const rows = [
    { token: 'A', logprob: -0.3, isSampled: false },
    { token: 'B', logprob: -1.0, isSampled: true },
    { token: 'C', logprob: -2.5, isSampled: false },
    { token: 'D', logprob: -4.0, isSampled: false },
  ];
  const logprobRankOrder = [...rows.keys()].sort((a, b) => rows[b].logprob - rows[a].logprob);

  for (const t of [0.3, 1, 2.5]) {
    const odds = oddsAmongCandidates(rows, t);
    assert.equal(odds.length, rows.length);
    const probRankOrder = [...odds.keys()].sort((a, b) => odds[b] - odds[a]);
    assert.deepEqual(probRankOrder, logprobRankOrder, `T=${t}`);
  }
});

test('oddsAmongCandidates is winner-take-all at T <= WINNER_TAKE_ALL_EPSILON', () => {
  const rows = [
    { token: 'A', logprob: -3, isSampled: false },
    { token: 'B', logprob: -0.5, isSampled: true },
    { token: 'C', logprob: -1, isSampled: false },
  ];
  const odds = oddsAmongCandidates(rows, 0);
  assert.deepEqual(odds, [0, 1, 0]);
});

test('oddsAmongCandidates breaks winner-take-all ties toward the first frozen row', () => {
  const rows = [
    { token: 'A', logprob: -0.5, isSampled: false },
    { token: 'B', logprob: -0.5, isSampled: true },
    { token: 'C', logprob: -2, isSampled: false },
  ];
  const odds = oddsAmongCandidates(rows, WINNER_TAKE_ALL_EPSILON);
  assert.deepEqual(odds, [1, 0, 0]);
});

test('oddsAmongCandidates treats a non-finite temperature as 1', () => {
  const rows = [
    { token: 'A', logprob: -0.4, isSampled: true },
    { token: 'B', logprob: -1.2, isSampled: false },
    { token: 'C', logprob: -3.3, isSampled: false },
  ];
  const withNaN = oddsAmongCandidates(rows, NaN);
  const withUndefined = oddsAmongCandidates(rows, undefined);
  const withOne = oddsAmongCandidates(rows, 1);
  assert.deepEqual(withNaN, withOne);
  assert.deepEqual(withUndefined, withOne);
});

test('oddsAmongCandidates is numerically stable at T=0.1 with a wide logprob spread', () => {
  const rows = [
    { token: 'A', logprob: -0.1, isSampled: true },
    { token: 'B', logprob: -12, isSampled: false },
    { token: 'C', logprob: -25, isSampled: false },
  ];
  const odds = oddsAmongCandidates(rows, 0.1);
  assert.ok(odds.every((v) => Number.isFinite(v) && !Number.isNaN(v)));
  const sum = odds.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
});

test('formatPercent matches the shipped precision ladder', () => {
  const cases = [
    [1, '100.0%'],
    [0.5, '50.0%'],
    [0.0123, '1.23%'],
    [0.001234, '0.12%'],
    [0.000123, '0.012%'],
    [0.0000123, '0.0012%'],
    [1e-7, '<0.001%'],
  ];
  for (const [probability, expected] of cases) {
    assert.equal(formatPercent(probability), expected, `probability=${probability}`);
  }
});

test('nucleusMembership keeps the smallest prefix whose mass reaches p', () => {
  const membership = nucleusMembership([0.5, 0.3, 0.1, 0.05, 0.05], 0.8);
  assert.deepEqual(membership, [true, true, false, false, false]);
});

test('nucleusMembership includes the token that crosses p', () => {
  const membership = nucleusMembership([0.4, 0.3, 0.2, 0.1], 0.5);
  assert.deepEqual(membership, [true, true, false, false]);
});

test('nucleusMembership at p=1 keeps every positive-mass row', () => {
  assert.deepEqual(nucleusMembership([0.4, 0.3, 0.2, 0.1], 1), [true, true, true, true]);
});

test('nucleusMembership at p=1 keeps an incomplete vocabulary that cannot reach 1', () => {
  assert.deepEqual(nucleusMembership([0.4, 0.25, 0.1], 1), [true, true, true]);
});

test('nucleusMembership drops zero-mass rows even when p=1', () => {
  assert.deepEqual(nucleusMembership([1, 0, 0], 1), [true, false, false]);
});

test('nucleusMembership after winner-take-all keeps only the winner', () => {
  const rows = [
    { token: 'A', logprob: -3 },
    { token: 'B', logprob: -0.5 },
    { token: 'C', logprob: -1 },
  ];
  const odds = oddsAmongCandidates(rows, 0);
  assert.deepEqual(nucleusMembership(odds, 1), [false, true, false]);
  assert.deepEqual(nucleusMembership(odds, 0.05), [false, true, false]);
});

test('nucleusUiVisible stays off at default top-p even when winner-take-all zeros look like a cut', () => {
  const rows = [
    { token: 'A', logprob: -3 },
    { token: 'B', logprob: -0.5 },
    { token: 'C', logprob: -1 },
  ];
  const odds = oddsAmongCandidates(rows, 0);
  const membership = nucleusMembership(odds, 1);
  assert.ok(membership.some((kept) => !kept));
  assert.equal(nucleusUiVisible(1), false);
});

test('nucleusUiVisible turns on only when top-p is below 1', () => {
  assert.equal(nucleusUiVisible(0.95), true);
  assert.equal(nucleusUiVisible(0.05), true);
  assert.equal(nucleusUiVisible(0), true);
  assert.equal(nucleusUiVisible(NaN), false);
  assert.equal(nucleusUiVisible(undefined), false);
});

test('nucleusMembership widens as temperature flattens the same frozen rows', () => {
  const rows = [
    { token: 'A', logprob: -0.2 },
    { token: 'B', logprob: -1.2 },
    { token: 'C', logprob: -2.4 },
    { token: 'D', logprob: -3.5 },
  ];
  const sharp = nucleusMembership(oddsAmongCandidates(rows, 0.4), 0.7);
  const flat = nucleusMembership(oddsAmongCandidates(rows, 1.8), 0.7);
  assert.ok(sharp.filter(Boolean).length < flat.filter(Boolean).length);
});

test('nucleusMembership treats a dropped row as definite given the shown ranking', () => {
  const raw = [0.55, 0.20, 0.08, 0.03, 0.01];
  const membership = nucleusMembership(raw, 0.5);
  assert.deepEqual(membership, [true, false, false, false, false]);
  assert.ok(raw[0] >= 0.5);
});

test('nucleusMembership a kept prefix may still be short of a full-vocab nucleus', () => {
  const raw = [0.2, 0.15, 0.1, 0.05, 0.02];
  const membership = nucleusMembership(raw, 0.8);
  assert.deepEqual(membership, [true, true, true, true, true]);
  assert.ok(raw.reduce((a, b) => a + b, 0) < 0.8);
});

test('nucleusMembership breaks probability ties toward the earlier frozen row', () => {
  const membership = nucleusMembership([0.3, 0.3, 0.3], 0.3);
  assert.deepEqual(membership, [true, false, false]);
});

test('nucleusMembership treats a non-finite top-p as 1', () => {
  const probs = [0.5, 0.3, 0.2];
  assert.deepEqual(nucleusMembership(probs, NaN), nucleusMembership(probs, 1));
  assert.deepEqual(nucleusMembership(probs, undefined), nucleusMembership(probs, 1));
});

test('nucleusMembership keeps a single top row when top-p is at or below zero', () => {
  assert.deepEqual(nucleusMembership([0.4, 0.3, 0.2], 0), [true, false, false]);
  assert.deepEqual(nucleusMembership([0.1, 0.6, 0.3], -1), [false, true, false]);
});

test('nucleusMembership keeps the first frozen row when every probability is zero', () => {
  assert.deepEqual(nucleusMembership([0, 0, 0], 0.5), [true, false, false]);
});

test('nucleusMembership treats non-finite probabilities as zero', () => {
  assert.deepEqual(nucleusMembership([0.6, NaN, 0.4], 0.6), [true, false, false]);
});

test('nucleusMembership returns an empty mask for an empty list', () => {
  assert.deepEqual(nucleusMembership([], 0.5), []);
});

test('nucleusMembership preserves length and does not reorder the caller', () => {
  const probs = [0.05, 0.7, 0.15, 0.1];
  const membership = nucleusMembership(probs, 0.8);
  assert.equal(membership.length, probs.length);
  assert.deepEqual(membership, [false, true, true, false]);
});

test('rawOdds returns exp(logprob) and does not renormalise', () => {
  const rows = [
    { token: 'A', logprob: -0.5, isSampled: true },
    { token: 'B', logprob: -1.5, isSampled: false },
    { token: 'C', logprob: -3.0, isSampled: false },
  ];
  const odds = rawOdds(rows);
  odds.forEach((v, i) => {
    assert.ok(Math.abs(v - Math.exp(rows[i].logprob)) < 1e-15);
  });
  const sum = odds.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) > 1e-6, `sum should not be renormalised to 1, got ${sum}`);
});
