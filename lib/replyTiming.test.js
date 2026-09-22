import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDurationMs, formatReplyTiming } from './replyTiming.js';

test('duration is whole milliseconds', () => {
  assert.equal(formatDurationMs(400), '400 ms');
  assert.equal(formatDurationMs(2100.4), '2100 ms');
  assert.equal(formatDurationMs(null), null);
  assert.equal(formatDurationMs(-1), null);
});

test('reply timing stays in milliseconds', () => {
  assert.equal(
    formatReplyTiming({ ttftMs: 400, totalMs: 2100, streamed: true }),
    'first token 400 ms · all replies 2100 ms',
  );
  assert.equal(
    formatReplyTiming({ ttftMs: 800, totalMs: 800.4, streamed: true }),
    'reply 800 ms · streamed',
  );
  assert.equal(
    formatReplyTiming({ ttftMs: null, totalMs: 2100, streamed: true }),
    'reply 2100 ms · streamed',
  );
  assert.equal(
    formatReplyTiming({ totalMs: 2100, streamed: false }),
    'reply 2100 ms',
  );
  assert.equal(formatReplyTiming(null), null);
});
