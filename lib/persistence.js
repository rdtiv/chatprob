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

  if (withCompletions.length <= keepFullTurns) return messages;

  const keepFrom = withCompletions.length - keepFullTurns;
  const pruneIndices = new Set(withCompletions.slice(0, keepFrom));

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
