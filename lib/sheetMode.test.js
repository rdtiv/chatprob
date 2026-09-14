import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseSheet } from './sheetMode.js';

test('a coarse pointer on a wide desktop does not get a sheet', () => {
  assert.equal(shouldUseSheet({ coarse: true, narrow: false }), false);
});

test('a mouse on a wide desktop does not get a sheet', () => {
  assert.equal(shouldUseSheet({ coarse: false, narrow: false }), false);
});

test('a phone-width touch surface gets a sheet', () => {
  assert.equal(shouldUseSheet({ coarse: true, narrow: true }), true);
});

test('a narrow mouse window stays a popover', () => {
  assert.equal(shouldUseSheet({ coarse: false, narrow: true }), false);
});
