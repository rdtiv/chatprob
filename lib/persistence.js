// Keeps saved conversations inside localStorage quotas: old turns lose their
// top_logprobs (the card's alternatives) but keep token + logprob, so the
// heatmap, underline channel, stats, and fork detection all survive a reload.

export const KEEP_FULL_TURNS = 20;

export function pruneForStorage(messages, keepFullTurns = KEEP_FULL_TURNS) {
  const withCompletions = (messages || []).reduce((indices, message, index) => {
    if (message?.role === 'assistant' && Array.isArray(message.completions) && message.completions.length > 0) {
      indices.push(index);
    }
    return indices;
  }, []);

  // Errored/aborted turns carry completions from partial streams but must not
  // occupy a keep slot: the budget is decided over successful turns only, while
  // pruning (stripping top_logprobs) still applies to every completions-bearing
  // assistant message that falls outside the kept set.
  const countedIndices = withCompletions.filter((index) => (messages[index] || {}).error !== true);

  if (countedIndices.length <= keepFullTurns) return messages;

  const keepFrom = countedIndices.length - keepFullTurns;
  const keptCountedIndices = new Set(countedIndices.slice(keepFrom));

  const pruneIndices = new Set(withCompletions.filter((index) => !keptCountedIndices.has(index)));

  return messages.map((message, index) => {
    if (!pruneIndices.has(index)) return message;
    return {
      ...message,
      completions: message.completions.map((completion) => ({
        ...completion,
        alternativesPruned: true,
        tokenProbabilities: (completion.tokenProbabilities || []).map(({ token, logprob }) => ({
          token,
          logprob,
        })),
      })),
    };
  });
}
