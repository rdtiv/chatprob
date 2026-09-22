import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDIT_BEAT_MS,
  initialDecisionSession,
  pickScenario,
  markRunFinished,
  fieldsLocked,
  beginRun,
  resetToPicker,
} from './decisionSession.js';

test('decision opens on the picker', () => {
  const session = initialDecisionSession();
  assert.equal(session.phase, 'picker');
  assert.equal(session.scenarioId, null);
  assert.equal(session.status, 'idle');
  assert.equal(EDIT_BEAT_MS < 1500, true);
});

test('a picked card leaves the picker until reset', () => {
  const picked = pickScenario(initialDecisionSession(), 'cancel-my-plan');
  assert.equal(picked.phase, 'scenario');
  assert.equal(picked.scenarioId, 'cancel-my-plan');
  assert.equal(picked.status, 'idle');
});

test('scores stay read-only for a beat, then editing unlocks', () => {
  const running = beginRun(pickScenario(initialDecisionSession(), 'account-lockout-no-refund'), null);
  assert.equal(fieldsLocked({ status: running.session.status, beat: false }), true);
  const scored = markRunFinished(running.session);
  assert.equal(scored.status, 'ready');
  assert.equal(fieldsLocked({ status: scored.status, beat: true }), true);
  assert.equal(fieldsLocked({ status: scored.status, beat: false }), false);
  assert.equal(fieldsLocked({ status: 'error', beat: false }), false);
});

test('a new run aborts the previous controller', () => {
  const first = new AbortController();
  const started = beginRun(
    pickScenario(initialDecisionSession(), 'weather-tool-gate'),
    first,
  );
  assert.equal(first.signal.aborted, true);
  assert.equal(started.session.status, 'loading');
  assert.equal(started.session.scenarioId, 'weather-tool-gate');
  assert.equal(started.controller.signal.aborted, false);
});

test('reset returns to the picker and aborts an in-flight run', () => {
  const running = beginRun(pickScenario(initialDecisionSession(), 'parts-came-back'), null);
  assert.equal(running.session.phase, 'scenario');
  const reset = resetToPicker(running.controller);
  assert.equal(running.controller.signal.aborted, true);
  assert.equal(reset.controller, null);
  assert.equal(reset.session.phase, 'picker');
  assert.equal(reset.session.scenarioId, null);
  assert.equal(reset.session.status, 'idle');
  const again = resetToPicker(null);
  assert.equal(again.session.phase, 'picker');
});
