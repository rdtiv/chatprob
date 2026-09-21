import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIAGE_MODEL,
  TRIAGE_SCENARIO,
  JEV_INPUT_USD_PER_MILLION,
  questionsForEvaluate,
} from './triageFixture.js';

test('the canned model id is typesafe-ai/jev', () => {
  assert.equal(TRIAGE_MODEL, 'typesafe-ai/jev');
  assert.equal(JEV_INPUT_USD_PER_MILLION, 0.042);
});

test('the fixture asks a choice, a score, and a boolean', () => {
  const types = Object.values(TRIAGE_SCENARIO.questions).map((question) => question.type);
  assert.deepEqual(types, ['choice', 'score', 'boolean']);
  assert.equal(typeof TRIAGE_SCENARIO.state.message, 'string');
});

test('questionsForEvaluate strips UI labels', () => {
  const questions = questionsForEvaluate();
  assert.equal(questions.department.label, undefined);
  assert.equal(questions.department.type, 'choice');
  assert.equal(questions.department.criteria.technical.includes('Bugs'), true);
  assert.equal(questions.severity.criteria.length, 4);
  assert.deepEqual(questions.requestsRefund.criteria, TRIAGE_SCENARIO.questions.requestsRefund.criteria);
});
