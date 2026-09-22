import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the LLM route stays direct OpenAI logprobs', () => {
  const source = readFileSync('pages/api/chat.js', 'utf8');
  assert.match(source, /from 'openai'/);
  assert.match(source, /logprobs:\s*true/);
  assert.match(source, /top_logprobs:\s*5/);
  assert.match(source, /n:\s*3/);
  assert.equal(source.includes('codeAnalysis'), false);
  assert.equal(source.includes('experimental_evaluate'), false);
  assert.equal(source.includes('/api/code'), false);
});

test('the Decision route stays Jev evaluate', () => {
  const source = readFileSync('pages/api/evaluate.js', 'utf8');
  assert.match(source, /experimental_evaluate/);
  assert.match(source, /runCannedEvaluation/);
  assert.match(source, /typesafe-ai\/jev|experimental_evaluate/);
  assert.equal(source.includes('codeAnalysis'), false);
  assert.equal(source.includes("from 'openai'"), false);
  assert.equal(source.includes('datasetId'), false);
});
