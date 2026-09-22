import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIAGE_SCENARIO, SEVERITY_MAX, questionsForEvaluate } from './triageFixture.js';
import {
  DECISION_SCENARIOS,
  DEFAULT_SCENARIO_ID,
  getScenario,
  resolveScenarioId,
  resolveScenarioState,
  questionIds,
} from './decisionScenarios.js';

test('scenario registry keeps the four cards in locked order', () => {
  assert.deepEqual(DECISION_SCENARIOS.map((scenario) => scenario.cardTitle), [
    'Can’t get in',
    'Cancel my plan',
    'Parts came back',
    'Should we call the tool?',
  ]);
  assert.deepEqual(DECISION_SCENARIOS.map((scenario) => scenario.id), [
    'account-lockout-no-refund',
    'cancel-my-plan',
    'parts-came-back',
    'weather-tool-gate',
  ]);
  assert.equal(DECISION_SCENARIOS[0].blurb, 'Locked out after a password reset. Trip tomorrow. No refund ask.');
  assert.equal(DECISION_SCENARIOS[1].blurb, 'Wants out — or a pause — or the double charge fixed. Hard to tell.');
  assert.equal(DECISION_SCENARIOS[2].blurb, 'Dock mail about a return. Which desk owns it?');
  assert.equal(DECISION_SCENARIOS[3].blurb, 'Live weather or memory — when is a tool the right move?');
  assert.equal(new Set(DECISION_SCENARIOS.map((scenario) => scenario.id)).size, 4);
  assert.equal(getScenario('no-such-situation'), null);
  assert.equal(resolveScenarioId(undefined).scenario.id, DEFAULT_SCENARIO_ID);
  assert.equal(resolveScenarioId('not-a-card').ok, false);
});

test('the first card is the canned lockout ticket and the support triad', () => {
  const lockout = getScenario('account-lockout-no-refund');
  assert.equal(lockout.judge, 'support');
  assert.equal(lockout.surface, 'ticket');
  assert.equal(lockout.editHint, 'Edit the subject or message, then run again.');
  assert.deepEqual(lockout.state, TRIAGE_SCENARIO.state);
  assert.deepEqual(questionIds(lockout), ['department', 'severity', 'requestsRefund']);
  assert.equal(lockout.questions, TRIAGE_SCENARIO.questions);
});

test('cancel my plan keeps the same questions and an ambiguous cancel voice', () => {
  const cancel = getScenario('cancel-my-plan');
  assert.equal(cancel.surface, 'ticket');
  assert.equal(cancel.judge, 'support');
  assert.equal(cancel.questions, TRIAGE_SCENARIO.questions);
  assert.equal(cancel.state.subject, 'Please cancel my plan');
  assert.equal(
    cancel.state.message,
    'Please cancel. Unless you can fix the streaming — it freezes every night. Also I think you billed me twice last month. Or just pause me for now. I’m not sure.',
  );
  assert.equal(cancel.state.plan, 'standard');
  assert.equal(cancel.state.previousTickets, 1);
  assert.equal(cancel.state.message.toLowerCase().includes('stripe'), false);
  assert.equal(cancel.editHint, 'Edit the subject or message, then run again.');
});

test('parts came back is inbound mail with a return-desk question list', () => {
  const mail = getScenario('parts-came-back');
  assert.equal(mail.surface, 'email');
  assert.equal(mail.state.from, 'ops@customerco.example');
  assert.equal(mail.state.subject, 'Returned cartons from last week’s shipment');
  assert.equal(
    mail.state.body,
    'The shipment from last week is back on our dock. Cartons were open and a few parts don’t match the packing list. Need someone to take this before second shift.',
  );
  const note = `${mail.state.subject}\n${mail.state.body}`;
  assert.equal(/jamak/i.test(note), false);
  assert.equal(/customer/i.test(note), false);
  assert.deepEqual(questionIds(mail), ['queue', 'severity', 'repeat', 'creditNotRemake']);
  assert.deepEqual(Object.keys(mail.questions.queue.criteria), [
    'quality',
    'sales-credit',
    'ops-shipping',
    'unclear',
  ]);
  assert.equal(mail.questions.severity.type, 'score');
  assert.equal(mail.questions.severity.criteria.length, SEVERITY_MAX + 1);
  assert.equal(mail.questions.repeat.type, 'boolean');
  assert.equal(mail.questions.creditNotRemake.type, 'boolean');
  assert.equal(mail.editHint, 'Edit the subject or body, then run again.');
  const sent = questionsForEvaluate(mail.questions);
  assert.equal(sent.queue.label, undefined);
  assert.equal(sent.queue.criteria.quality.includes('parts'), true);
});

test('the weather card asks whether to use memory, the tool, or a refusal', () => {
  const weather = getScenario('weather-tool-gate');
  assert.equal(weather.surface, 'ask');
  assert.equal(weather.state.ask, 'What’s the weather in Denver right now?');
  assert.deepEqual(questionIds(weather), ['needsLive', 'move']);
  assert.equal(weather.questions.needsLive.type, 'boolean');
  assert.deepEqual(Object.keys(weather.questions.move.criteria), ['memory', 'tool', 'refuse']);
  assert.equal(weather.lines.score, null);
  assert.equal(weather.editHint, 'Edit the question, then run again.');
  const sent = questionsForEvaluate(weather.questions);
  assert.equal(sent.needsLive.label, undefined);
  assert.equal(sent.move.type, 'choice');
});

test('each situation resolves its own canned text and rejects the wrong shape', () => {
  const mail = getScenario('parts-came-back');
  const canned = resolveScenarioState(mail, undefined, true);
  assert.equal(canned.ok, true);
  assert.deepEqual(canned.state, mail.state);
  assert.notEqual(canned.state, mail.state);

  const wrong = resolveScenarioState(mail, {
    subject: 'Can’t sign in after password reset',
    message: 'Locked out.',
    plan: 'family',
    previousTickets: 3,
  }, false);
  assert.equal(wrong.ok, false);

  const weather = resolveScenarioState(getScenario('weather-tool-gate'), { ask: '  Rain today?  ' }, false);
  assert.deepEqual(weather.state, { ask: 'Rain today?' });

  const cancel = resolveScenarioState(getScenario('cancel-my-plan'), undefined, true);
  assert.equal(cancel.state.subject, 'Please cancel my plan');
  assert.notDeepEqual(cancel.state, TRIAGE_SCENARIO.state);
});
