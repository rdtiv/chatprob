// Published training-data knowledge cutoffs, per model family. Re-check these
// against the provider's model page whenever a model is added, exactly like
// the rate card in lib/openaiRates.js.
const CUTOFFS = {
  'gpt-4o-mini':  'October 2023',
  'gpt-4o':       'October 2023',
  'gpt-4.1-nano': 'June 2024',
  'gpt-4.1-mini': 'June 2024',
  'gpt-4.1':      'June 2024',
};

// Matches the same discipline as rateFor in lib/openaiRates.js: lowercase
// the input, try longest keys first, and match on an exact id or an id that
// starts with "<key>-" so a dated id like 'gpt-4o-mini-2024-07-18' resolves
// to 'gpt-4o-mini' rather than the shorter 'gpt-4o'.
export function knowledgeCutoff(model) {
  if (typeof model !== 'string' || model === '') return null;

  const id = model.toLowerCase();
  const key = Object.keys(CUTOFFS)
    .sort((a, b) => b.length - a.length)
    .find((name) => id === name || id.startsWith(`${name}-`));

  // Unknown or missing models get no fallback: a guessed cutoff would be a
  // false factual claim.
  if (!key) return null;

  return { model: key, label: CUTOFFS[key] };
}
