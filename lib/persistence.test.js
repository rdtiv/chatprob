import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneForStorage, KEEP_FULL_TURNS } from './persistence.js';
import { sampledLogprob, confidenceBand, completionStats, findForkIndex } from './completionStats.js';

function makeCompletion(text, { withTopLogprobs = true } = {}) {
  return {
    text,
    tokenProbabilities: [
      {
        token: 'Hello',
        logprob: -0.1,
        ...(withTopLogprobs ? { top_logprobs: { Hello: -0.1, Hi: -1.2 } } : {}),
      },
      {
        token: ' world',
        logprob: -0.2,
        ...(withTopLogprobs ? { top_logprobs: { ' world': -0.2, ' there': -1.5 } } : {}),
      },
    ],
  };
}

function makeAssistantMessage(id, { withCompletions = true } = {}) {
  return {
    role: 'assistant',
    id,
    content: `reply ${id}`,
    completions: withCompletions ? [makeCompletion(`reply ${id}`)] : [],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
    echoedMessages: [{ role: 'user', content: `prompt ${id}` }],
  };
}

function makeUserMessage(id) {
  return { role: 'user', id, content: `prompt ${id}` };
}

function buildConversation(assistantCount) {
  const messages = [];
  for (let i = 0; i < assistantCount; i++) {
    messages.push(makeUserMessage(i));
    messages.push(makeAssistantMessage(i));
  }
  return messages;
}

test('pruneForStorage returns the input unchanged below the threshold', () => {
  const messages = buildConversation(KEEP_FULL_TURNS);
  const result = pruneForStorage(messages);
  assert.equal(result, messages);
});

test('pruneForStorage never mutates its input', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const snapshot = JSON.parse(JSON.stringify(messages));
  pruneForStorage(messages);
  assert.deepEqual(messages, snapshot);
});

test('pruneForStorage keeps the most recent turns intact', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  const assistantIndices = messages.reduce((indices, message, index) => {
    if (message.role === 'assistant' && message.completions.length > 0) indices.push(index);
    return indices;
  }, []);
  const recentIndices = assistantIndices.slice(-KEEP_FULL_TURNS);

  for (const index of recentIndices) {
    assert.equal(result[index], messages[index]);
    for (const completion of result[index].completions) {
      assert.equal(completion.alternativesPruned, undefined);
      for (const tokenData of completion.tokenProbabilities) {
        assert.ok('top_logprobs' in tokenData);
      }
    }
  }
});

test('pruneForStorage strips top_logprobs from older turns', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  const oldestAssistant = result.find(
    (message) => message.role === 'assistant' && message.id === 0
  );
  for (const completion of oldestAssistant.completions) {
    for (const tokenData of completion.tokenProbabilities) {
      assert.equal('top_logprobs' in tokenData, false);
    }
  }
});

test('pruneForStorage keeps token and logprob on pruned turns', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  const oldestAssistant = result.find(
    (message) => message.role === 'assistant' && message.id === 0
  );
  const original = messages.find((message) => message.role === 'assistant' && message.id === 0);

  oldestAssistant.completions[0].tokenProbabilities.forEach((tokenData, i) => {
    assert.equal(tokenData.token, original.completions[0].tokenProbabilities[i].token);
    assert.equal(tokenData.logprob, original.completions[0].tokenProbabilities[i].logprob);
  });
});

test('pruneForStorage marks pruned completions', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  const oldestAssistant = result.find(
    (message) => message.role === 'assistant' && message.id === 0
  );
  for (const completion of oldestAssistant.completions) {
    assert.equal(completion.alternativesPruned, true);
  }

  const recentAssistant = result.find(
    (message) => message.role === 'assistant' && message.id === KEEP_FULL_TURNS + 4
  );
  for (const completion of recentAssistant.completions) {
    assert.equal(completion.alternativesPruned, undefined);
  }
});

test('pruneForStorage leaves user messages untouched', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      assert.equal(result[i], messages[i]);
    }
  }
});

test('pruneForStorage ignores assistant messages without completions', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const errorPlaceholder = { role: 'assistant', id: 'error', content: 'Something went wrong', completions: [] };
  messages.splice(1, 0, errorPlaceholder);

  const result = pruneForStorage(messages);
  const index = messages.indexOf(errorPlaceholder);
  assert.equal(result[index], errorPlaceholder);
});

test('pruneForStorage preserves message order', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  assert.equal(result.length, messages.length);
  result.forEach((message, i) => {
    assert.equal(message.role, messages[i].role);
    assert.equal(message.id, messages[i].id);
  });
});

test('pruneForStorage preserves usage and echoedMessages on pruned turns', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 5);
  const result = pruneForStorage(messages);

  const oldestAssistant = result.find(
    (message) => message.role === 'assistant' && message.id === 0
  );
  const original = messages.find((message) => message.role === 'assistant' && message.id === 0);

  assert.deepEqual(oldestAssistant.usage, original.usage);
  assert.deepEqual(oldestAssistant.echoedMessages, original.echoedMessages);
});

test('pruneForStorage excludes errored turns from the keep budget', () => {
  // 21 successful turns (one over the 20-turn budget) with 2 errored turns
  // interleaved. The errored turns must not consume a keep slot: only the
  // oldest successful turn should be pruned, and every errored turn is
  // pruned too (it never occupies a keep slot in the first place).
  const messages = [];
  for (let i = 0; i < 21; i++) {
    messages.push(makeUserMessage(i));
    messages.push(makeAssistantMessage(i));
    if (i === 5 || i === 12) {
      messages.push({
        role: 'assistant',
        id: `error-${i}`,
        content: 'partial',
        completions: [makeCompletion('partial')],
        error: true,
        aborted: true,
      });
    }
  }

  const result = pruneForStorage(messages, 20);

  const successfulAssistants = result.filter(
    (message) => message.role === 'assistant' && !message.error
  );
  assert.equal(successfulAssistants.length, 21);

  const prunedSuccessful = successfulAssistants.filter(
    (message) => message.completions[0].alternativesPruned === true
  );
  const keptSuccessful = successfulAssistants.filter(
    (message) => message.completions[0].alternativesPruned === undefined
  );
  assert.equal(prunedSuccessful.length, 1);
  assert.equal(prunedSuccessful[0].id, 0);
  assert.equal(keptSuccessful.length, 20);

  const erroredAssistants = result.filter(
    (message) => message.role === 'assistant' && message.error === true
  );
  assert.equal(erroredAssistants.length, 2);
  for (const message of erroredAssistants) {
    assert.equal(message.completions[0].alternativesPruned, true);
  }
});

test('pruned turns still satisfy the heatmap and fork inputs', () => {
  const messages = buildConversation(KEEP_FULL_TURNS + 1);
  // give the oldest turn two completions so fork detection has something to compare
  messages[1] = {
    ...messages[1],
    completions: [makeCompletion('reply A'), { ...makeCompletion('reply A'), text: 'reply B' }],
  };
  messages[1].completions[1].tokenProbabilities = [
    { token: 'Hello', logprob: -0.1, top_logprobs: { Hello: -0.1 } },
    { token: ' there', logprob: -0.3, top_logprobs: { ' there': -0.3 } },
  ];

  const result = pruneForStorage(messages);
  const prunedTurn = result[1];
  assert.equal(prunedTurn.completions[0].alternativesPruned, true);

  for (const completion of prunedTurn.completions) {
    for (const tokenData of completion.tokenProbabilities) {
      assert.notEqual(sampledLogprob(tokenData), null);
    }
  }

  const stats = completionStats(prunedTurn.completions[0]);
  assert.notEqual(stats, null);
  assert.notEqual(stats.confidence, null);

  const band = confidenceBand(stats.confidence);
  assert.notEqual(band, null);

  const forkIndex = findForkIndex(prunedTurn.completions);
  assert.equal(forkIndex, 1);
});
