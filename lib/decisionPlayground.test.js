import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THRESHOLD_DEFAULTS,
  clampThresholds,
  decideTriage,
  answerRows,
  scoreCaption,
  formatPercent,
  formatElapsed,
  speedVersusLlm,
} from './decisionPlayground.js';
import { TRIAGE_SCENARIO } from './triageFixture.js';

const clearAnswers = {
  department: {
    type: 'choice',
    choice: 'technical',
    probabilities: { billing: 0.05, technical: 0.93, account: 0.02, other: 0 },
  },
  severity: {
    type: 'score',
    score: 1.2,
    probabilities: { 0: 0.1, 1: 0.6, 2: 0.3, 3: 0 },
  },
  requestsRefund: { type: 'boolean', probability: 0.1 },
};

test('a clear queue under the severity line autos', () => {
  const decision = decideTriage(clearAnswers, THRESHOLD_DEFAULTS);
  assert.equal(decision.action, 'auto');
  assert.equal(decision.readings.departmentChoice, 'technical');
  assert.equal(decision.readings.departmentProbability, 0.93);
});

test('severity at the escalate line escalates even when the queue is clear', () => {
  const decision = decideTriage(
    {
      ...clearAnswers,
      severity: { type: 'score', score: 2, probabilities: { 0: 0, 1: 0, 2: 1, 3: 0 } },
    },
    THRESHOLD_DEFAULTS,
  );
  assert.equal(decision.action, 'escalate');
  assert.match(decision.reasons.join(' '), /severity/i);
});

test('a queue between reject and auto escalates', () => {
  const decision = decideTriage(
    {
      ...clearAnswers,
      department: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.5, technical: 0.3, account: 0.2, other: 0 },
      },
    },
    THRESHOLD_DEFAULTS,
  );
  assert.equal(decision.action, 'escalate');
});

test('a queue under the reject line rejects and ignores the other lines', () => {
  const decision = decideTriage(
    {
      ...clearAnswers,
      department: {
        type: 'choice',
        choice: 'other',
        probabilities: { billing: 0.3, technical: 0.3, account: 0.1, other: 0.3 },
      },
      severity: { type: 'score', score: 3, probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 } },
    },
    THRESHOLD_DEFAULTS,
  );
  assert.equal(decision.action, 'reject');
  assert.equal(decision.reasons.length, 1);
});

test('an in-between refund probability escalates', () => {
  const decision = decideTriage(
    { ...clearAnswers, requestsRefund: { type: 'boolean', probability: 0.55 } },
    THRESHOLD_DEFAULTS,
  );
  assert.equal(decision.action, 'escalate');
  assert.match(decision.reasons.join(' '), /P\(refund\)/);
});

test('a clear refund yes does not escalate by itself', () => {
  const decision = decideTriage(
    { ...clearAnswers, requestsRefund: { type: 'boolean', probability: 0.8 } },
    THRESHOLD_DEFAULTS,
  );
  assert.equal(decision.action, 'auto');
});

test('a missing department distribution escalates instead of pretending it is zero', () => {
  const decision = decideTriage(
    {
      ...clearAnswers,
      department: { type: 'choice', choice: 'technical' },
    },
    THRESHOLD_DEFAULTS,
  );
  assert.equal(decision.action, 'escalate');
  assert.match(decision.reasons.join(' '), /no distribution/);
});

test('confidence is not an input to the action', () => {
  const without = decideTriage(clearAnswers, THRESHOLD_DEFAULTS);
  const withConfidence = decideTriage(clearAnswers, THRESHOLD_DEFAULTS, { department: 0.1 });
  assert.equal(without.action, withConfidence.action);
});

test('the queue lines may cross because reject is checked first', () => {
  const thresholds = clampThresholds({ departmentReject: 0.9, departmentAuto: 0.2 });
  assert.equal(thresholds.departmentReject, 0.9);
  assert.equal(thresholds.departmentAuto, 0.2);
});

test('a peaked answer can still be pushed into auto, escalate, or reject', () => {
  const peaked = {
    department: {
      type: 'choice',
      choice: 'technical',
      probabilities: { billing: 0.01, technical: 0.99, account: 0, other: 0 },
    },
    severity: { type: 'score', score: 3, probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 } },
    requestsRefund: { type: 'boolean', probability: 0.99 },
  };
  assert.equal(decideTriage(peaked, THRESHOLD_DEFAULTS).action, 'escalate');
  assert.equal(
    decideTriage(peaked, { ...THRESHOLD_DEFAULTS, severityEscalate: 4 }).action,
    'auto',
  );
  assert.equal(
    decideTriage(peaked, { ...THRESHOLD_DEFAULTS, departmentReject: 1, severityEscalate: 4 }).action,
    'reject',
  );
  assert.equal(
    decideTriage(peaked, { ...THRESHOLD_DEFAULTS, departmentAuto: 1, severityEscalate: 4 }).action,
    'escalate',
  );
});

test('clampThresholds ignores non-finite input', () => {
  assert.equal(clampThresholds({ refundYes: 'nope' }).refundYes, THRESHOLD_DEFAULTS.refundYes);
});

test('answerRows keeps every choice option, selected or not', () => {
  const rows = answerRows(TRIAGE_SCENARIO.questions.department, clearAnswers.department);
  assert.deepEqual(rows.map((row) => row.key), ['billing', 'technical', 'account', 'other']);
  assert.equal(rows.find((row) => row.selected).key, 'technical');
});

test('scoreCaption names the two levels a fractional score sits between', () => {
  const caption = scoreCaption(2.86, TRIAGE_SCENARIO.questions.severity.criteria);
  assert.match(caption, /Blocking with no workaround/);
  assert.match(caption, /financial or data loss/);
});

test('formatters leave a gap where a number is missing', () => {
  assert.equal(formatPercent(undefined), '—');
  assert.equal(formatPercent(0.913), '91.3%');
  assert.equal(formatElapsed(840), '840 ms');
  assert.equal(formatElapsed(1200), '1.2 s');
  assert.equal(formatElapsed(null), null);
});

test('speed copy uses the measured elapsed and skips a missing clock', () => {
  assert.equal(speedVersusLlm(null), null);
  assert.match(speedVersusLlm(304), /304 ms/);
  assert.match(speedVersusLlm(304), /several seconds/);
  assert.equal(speedVersusLlm(304).includes('~'), false);
});
