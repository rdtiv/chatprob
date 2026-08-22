import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutboundMessages, KEEP_ALL } from './contextWindow.js';

function makeUserMessage(id) {
  return { role: 'user', id, content: `prompt ${id}` };
}

function makeAssistantMessage(id) {
  return { role: 'assistant', id, content: `reply ${id}` };
}

function makeErrorMessage(id) {
  return { role: 'assistant', id, content: 'Something went wrong', error: true };
}

// pairCount user/assistant pairs, ids 0..pairCount-1, user then assistant per pair.
function buildConversation(pairCount) {
  const messages = [];
  for (let i = 0; i < pairCount; i++) {
    messages.push(makeUserMessage(i));
    messages.push(makeAssistantMessage(i));
  }
  return messages;
}

test('keepTurns null sends every non-error message and reports nothing dropped', () => {
  const conversation = buildConversation(4);
  const result = buildOutboundMessages(conversation, KEEP_ALL);

  assert.deepEqual(result.messages, conversation);
  assert.equal(result.cutoffIndex, 0);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.truncated, false);
});

test('garbage keepTurns values are treated as KEEP_ALL', () => {
  const conversation = buildConversation(4);
  const garbageValues = [undefined, NaN, -1, 2.5, '2', Infinity];

  for (const value of garbageValues) {
    const result = buildOutboundMessages(conversation, value);
    assert.deepEqual(result.messages, conversation, `value ${String(value)} should behave like KEEP_ALL`);
    assert.equal(result.cutoffIndex, 0);
    assert.equal(result.droppedCount, 0);
    assert.equal(result.truncated, false);
  }
});

test('keepTurns at or above the number of earlier turns drops nothing', () => {
  const conversation = buildConversation(3);
  // 3 user messages; keepTurns=2 -> keepUsers=3, which equals the user count.
  const result = buildOutboundMessages(conversation, 2);

  assert.deepEqual(result.messages, conversation);
  assert.equal(result.cutoffIndex, 0);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.truncated, false);
});

test('keepTurns=0 on a multi-turn conversation keeps only the last user message onward', () => {
  const conversation = buildConversation(4);
  const result = buildOutboundMessages(conversation, 0);

  const lastUser = conversation[6]; // 4th pair's user message
  const lastAssistant = conversation[7];
  assert.deepEqual(result.messages, [lastUser, lastAssistant]);
  assert.equal(result.cutoffIndex, 6);
  assert.equal(result.droppedCount, 6);
  assert.equal(result.truncated, true);
});

test('keepTurns=0 when the last message is the user turn keeps a single message', () => {
  const conversation = buildConversation(3);
  conversation.push(makeUserMessage('pending')); // tail is a user message, no reply yet
  const result = buildOutboundMessages(conversation, 0);

  assert.deepEqual(result.messages, [conversation[6]]);
  assert.equal(result.messages.length, 1);
  assert.equal(result.cutoffIndex, 6);
  assert.equal(result.truncated, true);
});

test('keepTurns=2 on a four-pair conversation cuts at the third-from-last user message', () => {
  const conversation = buildConversation(4);
  const result = buildOutboundMessages(conversation, 2);

  // userPositions (eligible, 0-indexed messages) are at 0, 2, 4, 6.
  // keepUsers = 3, so cut lands at userPositions[4-3] = userPositions[1] = index 2.
  const expected = conversation.slice(2);
  assert.deepEqual(result.messages, expected);
  assert.equal(result.cutoffIndex, 2);
  assert.equal(result.droppedCount, 2);
  assert.equal(result.truncated, true);
});

test('the kept slice always starts on a user message for keepTurns 0..5', () => {
  const conversation = buildConversation(7);
  for (let keepTurns = 0; keepTurns <= 5; keepTurns++) {
    const result = buildOutboundMessages(conversation, keepTurns);
    if (result.messages.length > 0) {
      assert.equal(result.messages[0].role, 'user', `keepTurns=${keepTurns}`);
    }
  }
});

test('error placeholders are excluded from output and never act as cut boundaries', () => {
  const withoutErrors = buildConversation(4);
  const baseline = buildOutboundMessages(withoutErrors, 1);

  const withErrors = buildConversation(4);
  withErrors.splice(3, 0, makeErrorMessage('error-a'));
  withErrors.splice(6, 0, makeErrorMessage('error-b'));
  const result = buildOutboundMessages(withErrors, 1);

  assert.deepEqual(result.messages, baseline.messages);
  assert.equal(result.droppedCount, baseline.droppedCount);
  for (const message of result.messages) {
    assert.notEqual(message.error, true);
  }
});

test('a conversation whose only messages above the cut are error placeholders is not truncated', () => {
  const conversation = [makeErrorMessage('error-a'), makeErrorMessage('error-b'), ...buildConversation(2)];
  const result = buildOutboundMessages(conversation, 5);

  assert.equal(result.truncated, false);
  assert.equal(result.droppedCount, 0);
  assert.deepEqual(result.messages, buildConversation(2));
});

test('cutoffIndex points to the same object as messages[0]', () => {
  const conversation = buildConversation(4);
  const result = buildOutboundMessages(conversation, 1);

  assert.ok(result.truncated);
  assert.ok(result.messages.length > 0);
  assert.equal(conversation[result.cutoffIndex], result.messages[0]);
});

test('buildOutboundMessages does not mutate its input and returns a fresh array', () => {
  const conversation = buildConversation(5);
  const snapshot = JSON.parse(JSON.stringify(conversation));

  const result = buildOutboundMessages(conversation, 1);

  assert.deepEqual(conversation, snapshot);
  assert.notEqual(result.messages, conversation);
});

test('an in-flight streaming placeholder does not move the cut', () => {
  const conversation = buildConversation(4);
  const baseline = buildOutboundMessages(conversation, 1);

  const withStreaming = [...conversation, { role: 'assistant', usage: null, isStreaming: true }];
  const result = buildOutboundMessages(withStreaming, 1);

  assert.equal(result.cutoffIndex, baseline.cutoffIndex);
  assert.equal(result.droppedCount, baseline.droppedCount);
});

test('empty conversation returns an all-empty result for both null and 0 keepTurns', () => {
  for (const keepTurns of [KEEP_ALL, 0]) {
    const result = buildOutboundMessages([], keepTurns);
    assert.deepEqual(result, { messages: [], cutoffIndex: 0, droppedCount: 0, truncated: false });
  }
});

test('non-array conversation is treated as empty', () => {
  const result = buildOutboundMessages(undefined, 0);
  assert.deepEqual(result, { messages: [], cutoffIndex: 0, droppedCount: 0, truncated: false });
});

test('an assistant-only conversation (no user messages) is never truncated', () => {
  const conversation = [makeAssistantMessage(0), makeAssistantMessage(1), makeAssistantMessage(2)];
  const result = buildOutboundMessages(conversation, 0);

  assert.equal(result.truncated, false);
  assert.equal(result.droppedCount, 0);
  assert.deepEqual(result.messages, conversation);
});

test('a large integer keepTurns beyond the slider range still means keep everything', () => {
  const conversation = buildConversation(4);
  const result = buildOutboundMessages(conversation, 100);

  assert.deepEqual(result.messages, conversation);
  assert.equal(result.truncated, false);
});

test('droppedCount counts eligible messages while cutoffIndex also counts error bubbles above the cut', () => {
  const conversation = buildConversation(4);
  conversation.splice(1, 0, makeErrorMessage('error-a')); // error bubble near the top
  const result = buildOutboundMessages(conversation, 1);

  // Eligible user positions are unchanged by the error, so the cut keeps the
  // last two user messages: original index 5 (user 2 shifted by the splice).
  assert.equal(result.truncated, true);
  assert.equal(result.cutoffIndex, 5); // raw messages above the line, incl. the error bubble
  assert.equal(result.droppedCount, 4); // only eligible (non-error) messages left out of the payload
  assert.equal(result.cutoffIndex - result.droppedCount, 1); // exactly the one error bubble
});
