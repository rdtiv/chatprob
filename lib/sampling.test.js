import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMP_MIN,
  TEMP_MAX,
  TEMP_DEFAULT,
  TOP_P_MIN,
  TOP_P_HARD_MIN,
  TOP_P_MAX,
  TOP_P_DEFAULT,
  PENALTY_MIN,
  PENALTY_MAX,
  PENALTY_DEFAULT,
  clampTemperature,
  clampTopP,
  clampPresencePenalty,
  clampSeed,
} from './sampling.js';

test('clampTemperature returns the default for non-finite input', () => {
  assert.equal(clampTemperature(NaN), TEMP_DEFAULT);
  assert.equal(clampTemperature(undefined), TEMP_DEFAULT);
  assert.equal(clampTemperature(Infinity), TEMP_DEFAULT);
});

test('clampTemperature allows exactly zero', () => {
  assert.equal(clampTemperature(0), 0);
});

test('clampTemperature clamps below the floor to zero', () => {
  assert.equal(clampTemperature(-5), TEMP_MIN);
});

test('clampTemperature clamps above the ceiling to 1.8', () => {
  assert.equal(clampTemperature(5), TEMP_MAX);
});

test('clampTemperature passes through an in-range value', () => {
  assert.equal(clampTemperature(0.7), 0.7);
});

test('clampTopP returns the default for non-finite input', () => {
  assert.equal(clampTopP(NaN), TOP_P_DEFAULT);
  assert.equal(clampTopP(undefined), TOP_P_DEFAULT);
});

test('clampTopP clamps zero up to the hard minimum', () => {
  assert.equal(clampTopP(0), TOP_P_HARD_MIN);
});

test('clampTopP clamps negative input up to the hard minimum', () => {
  assert.equal(clampTopP(-1), TOP_P_HARD_MIN);
});

test('clampTopP clamps above one', () => {
  assert.equal(clampTopP(1.5), TOP_P_MAX);
});

test('clampPresencePenalty returns the default for non-finite input', () => {
  assert.equal(clampPresencePenalty(NaN), PENALTY_DEFAULT);
  assert.equal(clampPresencePenalty(undefined), PENALTY_DEFAULT);
});

test('clampPresencePenalty clamps to the two-sided range', () => {
  assert.equal(clampPresencePenalty(-5), PENALTY_MIN);
  assert.equal(clampPresencePenalty(5), PENALTY_MAX);
});

test('clampSeed returns null for non-finite input', () => {
  assert.equal(clampSeed(NaN), null);
  assert.equal(clampSeed(Infinity), null);
  assert.equal(clampSeed(undefined), null);
});

test('clampSeed returns null for a fractional value', () => {
  assert.equal(clampSeed(1.5), null);
});

test('clampSeed returns null outside the 32-bit range', () => {
  assert.equal(clampSeed(2 ** 31), null);
  assert.equal(clampSeed(-(2 ** 31)), null);
});

test('clampSeed passes through zero', () => {
  assert.equal(clampSeed(0), 0);
});

test('the slider floor for top_p never reaches the degenerate zero', () => {
  assert.ok(TOP_P_MIN > 0);
  assert.ok(TOP_P_MIN >= TOP_P_HARD_MIN);
});
