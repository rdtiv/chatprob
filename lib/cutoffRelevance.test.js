import test from 'node:test';
import assert from 'node:assert/strict';
import { needsCutoffNote, mentionsWeather } from './cutoffRelevance.js';

test('a chip source alone does not need the cutoff note', () => {
  const message = { role: 'user', source: 'chip-judgment', content: 'Rank in order of importance: income statement, balance sheet, cash flow statement.' };
  assert.equal(needsCutoffNote(message), false);
});

test('a chip prompt asking for something current still needs the cutoff note', () => {
  const message = { role: 'user', source: 'chip-starter', content: "What's the weather in Denver right now?" };
  assert.equal(needsCutoffNote(message), true);
});

test('typed message with bare "now" does not need the cutoff note', () => {
  const message = { role: 'user', source: 'typed', content: 'now that I think about it, what is 2+2?' };
  assert.equal(needsCutoffNote(message), false);
});

test('typed message with a recency keyword needs the cutoff note', () => {
  const message = { role: 'user', source: 'typed', content: "what's the weather in Denver right now?" };
  assert.equal(needsCutoffNote(message), true);
});

test('message with no source and no keywords does not need the cutoff note', () => {
  const message = { role: 'user', content: 'what is 2+2?' };
  assert.equal(needsCutoffNote(message), false);
});

test('mentionsWeather detects the word weather', () => {
  assert.equal(mentionsWeather('what is the weather like?'), true);
  assert.equal(mentionsWeather('what is 2+2?'), false);
});
