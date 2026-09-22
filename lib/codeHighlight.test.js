import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightTypeScript } from './codeHighlight.js';

const sample = [
  'function analyze(): Record<string, unknown> {',
  '  // count the jump',
  '  const name = "billing";',
  '  return { tickets: 160, ok: true };',
  '}',
].join('\n');

function roleText(source, role) {
  return highlightTypeScript(source)
    .filter((piece) => piece.role === role)
    .map((piece) => piece.text)
    .join(' ');
}

test('highlighting keeps every character, including a half-written function', () => {
  const partial = 'function ana';
  assert.equal(highlightTypeScript(partial).map((piece) => piece.text).join(''), partial);
  assert.equal(highlightTypeScript(sample).map((piece) => piece.text).join(''), sample);
  assert.match(roleText(partial, 'keyword'), /function/);
});

test('an unfinished string and a function name take color before the line is done', () => {
  const open = highlightTypeScript('const name = "bi');
  assert.equal(open.map((piece) => piece.text).join(''), 'const name = "bi');
  assert.match(roleText('const name = "bi', 'string'), /"bi/);
  assert.match(roleText('function analyze', 'function'), /analyze/);
  assert.match(roleText('return { n: 1', 'punct'), /[{:]/);
});

test('keywords, strings, comments, numbers, and types are marked while the source is still short', () => {
  assert.match(roleText(sample, 'keyword'), /function/);
  assert.match(roleText(sample, 'keyword'), /return/);
  assert.match(roleText(sample, 'string'), /"billing"/);
  assert.match(roleText(sample, 'comment'), /count the jump/);
  assert.match(roleText(sample, 'number'), /160/);
  assert.match(roleText(sample, 'type'), /string/);
  assert.match(roleText(sample, 'function'), /analyze/);
  const early = 'const name = "bi';
  assert.equal(highlightTypeScript(early).map((piece) => piece.text).join(''), early);
  assert.match(roleText(early, 'keyword'), /const/);
});
