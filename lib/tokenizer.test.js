import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode } from 'gpt-tokenizer/encoding/o200k_base';
import { tokenizeForDisplay, isPartialChunk } from './tokenizer.js';

const tokenizer = { encode, decode };

test('tokenizeForDisplay returns zero count and no chunks without a tokenizer', () => {
  const result = tokenizeForDisplay(null, 'hello');
  assert.deepEqual(result, { count: 0, chunks: [] });
});

test('tokenizeForDisplay returns zero count for an empty string', () => {
  const result = tokenizeForDisplay(tokenizer, '');
  assert.deepEqual(result, { count: 0, chunks: [] });
});

test('tokenizeForDisplay ignores non-string input', () => {
  assert.deepEqual(tokenizeForDisplay(tokenizer, undefined), { count: 0, chunks: [] });
  assert.deepEqual(tokenizeForDisplay(tokenizer, 12345), { count: 0, chunks: [] });
});

test('tokenizeForDisplay emits exactly one chunk per token', () => {
  const texts = [
    'strawberry',
    '12345',
    'Hello world',
    '日本語のテキスト',
    'ก้าวหน้า',
    'café 🍓 naïve',
    '🍓🍓🍓',
    '𝕳𝖊𝖑𝖑𝖔',
    '👨‍👩‍👧‍👦 family',
  ];
  for (const text of texts) {
    const { count, chunks } = tokenizeForDisplay(tokenizer, text);
    assert.equal(chunks.length, count, `chunk count mismatch for ${JSON.stringify(text)}`);
  }
});

test('tokenizeForDisplay chunks rejoin to the original text', () => {
  const texts = [
    'strawberry',
    '12345',
    'Hello world',
    '日本語のテキスト',
    'ก้าวหน้า',
    'café 🍓 naïve',
    '🍓🍓🍓',
    '𝕳𝖊𝖑𝖑𝖔',
    '👨‍👩‍👧‍👦 family',
  ];
  for (const text of texts) {
    const { chunks } = tokenizeForDisplay(tokenizer, text);
    assert.equal(chunks.join(''), text, `rejoin mismatch for ${JSON.stringify(text)}`);
  }
});

test('tokenizeForDisplay splits strawberry into three tokens', () => {
  const { chunks } = tokenizeForDisplay(tokenizer, 'strawberry');
  assert.deepEqual(chunks, ['st', 'raw', 'berry']);
});

test('tokenizeForDisplay splits 12345 into two tokens', () => {
  const { chunks } = tokenizeForDisplay(tokenizer, '12345');
  assert.deepEqual(chunks, ['123', '45']);
});

test('tokenizeForDisplay marks continuation bytes as empty chunks', () => {
  const { count, chunks } = tokenizeForDisplay(tokenizer, '𝕳𝖊𝖑𝖑𝖔');
  assert.equal(count, 15);
  const emptyChunks = chunks.filter((chunk) => chunk === '');
  assert.equal(emptyChunks.length, 10);
  assert.equal(
    chunks.some((chunk) => chunk.includes('�')),
    false
  );
});

test('isPartialChunk identifies only the empty chunk', () => {
  assert.equal(isPartialChunk(''), true);
  assert.equal(isPartialChunk(' '), false);
  assert.equal(isPartialChunk('·'), false);
  assert.equal(isPartialChunk('a'), false);
});
