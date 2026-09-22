import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECISION_BOOLEAN_NOTE, MODE_SUBTITLE } from './coachCopy.js';

test('the boolean footnote is a static scale, not a sample score', () => {
  assert.equal(
    DECISION_BOOLEAN_NOTE,
    'P(true) only — low is a clear no; high is a clear yes.',
  );
  assert.equal(DECISION_BOOLEAN_NOTE.includes('0.02'), false);
});

test('the header names Generate, Evaluate, and Analyze', () => {
  assert.equal(MODE_SUBTITLE, 'Generate token by token. Evaluate a situation. Analyze a table.');
  const source = readFileSync('components/ChatInterface.js', 'utf8');
  assert.match(source, />\s*Generate\s*</);
  assert.match(source, />\s*Evaluate\s*</);
  assert.match(source, />\s*Analyze\s*</);
  assert.equal(/>\s*LLM\s*</.test(source), false);
  assert.equal(/>\s*Decision\s*</.test(source), false);
  assert.equal(/>\s*Code\s*</.test(source), false);
  assert.match(source, /ChatProb — Generate/);
  assert.match(source, /ChatProb — Evaluate/);
  assert.match(source, /ChatProb — Analyze/);
  assert.match(source, /MODE_SUBTITLE/);
});
