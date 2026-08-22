import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeCutoff } from './modelFacts.js';

test('knowledgeCutoff matches an exact model id', () => {
  assert.deepEqual(knowledgeCutoff('gpt-4o-mini'), {
    model: 'gpt-4o-mini',
    label: 'October 2023',
  });
});

test('knowledgeCutoff matches a dated model suffix', () => {
  const result = knowledgeCutoff('gpt-4o-mini-2024-07-18');
  assert.equal(result.model, 'gpt-4o-mini');
  assert.equal(result.label, 'October 2023');
});

test('knowledgeCutoff does not let a dated mini id resolve to the base model', () => {
  const result = knowledgeCutoff('gpt-4o-mini-2024-07-18');
  assert.notEqual(result.model, 'gpt-4o');
});

test('knowledgeCutoff matches a dated nano suffix', () => {
  assert.deepEqual(knowledgeCutoff('gpt-4.1-nano-2025-04-14'), {
    model: 'gpt-4.1-nano',
    label: 'June 2024',
  });
});

test('knowledgeCutoff returns null for unknown or missing input, never throws', () => {
  for (const input of ['some-unknown-model', '', null, undefined, 42]) {
    assert.equal(knowledgeCutoff(input), null, `expected null for ${String(input)}`);
  }
});

test('knowledgeCutoff lowercases the input before matching', () => {
  const result = knowledgeCutoff('GPT-4O');
  assert.equal(result.model, 'gpt-4o');
});

test('knowledgeCutoff returns a non-empty label for every table entry', () => {
  const models = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-nano', 'gpt-4.1-mini', 'gpt-4.1'];
  for (const model of models) {
    const result = knowledgeCutoff(model);
    assert.ok(result, `expected a result for ${model}`);
    assert.equal(typeof result.label, 'string');
    assert.ok(result.label.length > 0);
  }
});
