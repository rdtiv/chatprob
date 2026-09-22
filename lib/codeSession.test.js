import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCodeSession,
  pickDataset,
  markRunFinished,
  beginRun,
  resetToPicker,
} from './codeSession.js';

test('code opens on the picker', () => {
  const session = initialCodeSession();
  assert.equal(session.phase, 'picker');
  assert.equal(session.datasetId, null);
  assert.equal(session.status, 'idle');
});

test('a picked card leaves the picker until reset', () => {
  const picked = pickDataset(initialCodeSession(), 'cancel-cohorts');
  assert.equal(picked.phase, 'dataset');
  assert.equal(picked.datasetId, 'cancel-cohorts');
  assert.equal(picked.status, 'idle');
  const ready = markRunFinished(beginRun(picked, null).session);
  assert.equal(ready.phase, 'dataset');
  assert.equal(ready.status, 'ready');
});

test('a new run aborts the previous controller', () => {
  const first = new AbortController();
  const started = beginRun(pickDataset(initialCodeSession(), 'weather-history'), first);
  assert.equal(first.signal.aborted, true);
  assert.equal(started.session.status, 'loading');
  assert.equal(started.session.datasetId, 'weather-history');
  assert.equal(started.controller.signal.aborted, false);
});

test('reset returns to the picker, clears the thread, and aborts an in-flight run', () => {
  const running = beginRun(pickDataset(initialCodeSession(), 'rma-log'), null);
  running.session.turns = [{ user: 'What piled up?', output: { weeks: '7-9' } }];
  assert.equal(running.session.phase, 'dataset');
  const reset = resetToPicker(running.controller);
  assert.equal(running.controller.signal.aborted, true);
  assert.equal(reset.controller, null);
  assert.equal(reset.session.phase, 'picker');
  assert.equal(reset.session.datasetId, null);
  assert.equal(reset.session.status, 'idle');
  assert.deepEqual(reset.session.turns, []);
  const again = resetToPicker(null);
  assert.equal(again.session.phase, 'picker');
  assert.deepEqual(again.session.turns, []);
});
