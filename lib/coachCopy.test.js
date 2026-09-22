import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_BOOLEAN_NOTE } from './coachCopy.js';

test('the boolean footnote is a static scale, not a sample score', () => {
  assert.equal(
    DECISION_BOOLEAN_NOTE,
    'P(true) only — low is a clear no; high is a clear yes.',
  );
  assert.equal(DECISION_BOOLEAN_NOTE.includes('0.02'), false);
});
