import test from 'node:test';
import assert from 'node:assert/strict';
import { abortedFields, abortedTurn } from './abortedTurn.js';
import { pruneForStorage } from './persistence.js';

test('abortedFields marks a turn aborted, errored, and unbilled', () => {
  const fields = abortedFields();
  assert.equal(fields.error, true);
  assert.equal(fields.aborted, true);
  assert.equal(fields.usage, null);
  assert.equal(fields.timing, null);
  assert.equal('abortReason' in fields, false);
});

test('abortedFields carries a reason only when one is given', () => {
  assert.equal(abortedFields('rate limited').abortReason, 'rate limited');
  assert.equal('abortReason' in abortedFields(''), false);
});

test('abortedTurn builds a full assistant message with one empty completion', () => {
  const turn = abortedTurn();
  assert.equal(turn.role, 'assistant');
  assert.equal(turn.content, '');
  assert.deepEqual(turn.completions, [{ text: '', tokenProbabilities: [] }]);
  assert.equal(turn.activeIndex, 0);
  assert.equal(typeof turn.timestamp, 'string');
  assert.equal(turn.error, true);
  assert.equal(turn.aborted, true);
});

test('abortedTurn respects an explicit timestamp and reason', () => {
  const turn = abortedTurn({ timestamp: '2026-01-01T00:00:00.000Z', reason: 'stopped' });
  assert.equal(turn.timestamp, '2026-01-01T00:00:00.000Z');
  assert.equal(turn.abortReason, 'stopped');
});

test('an abortedTurn message never occupies a pruneForStorage keep slot', () => {
  // Mirrors persistence.js's own contract: error:true turns are excluded from
  // the counted/kept successful-turn budget, regardless of how many pile up.
  const messages = Array.from({ length: 30 }, () => ({
    role: 'user',
    content: 'hi',
  })).flatMap((userMsg, i) => [userMsg, abortedTurn({ timestamp: `t${i}` })]);
  const result = pruneForStorage(messages, 5);
  assert.equal(result, messages); // nothing counted, so nothing to prune
});
