// Lazy o200k_base tokenizer for the composer. The encoding table is ~1 MB gzipped,
// so it is dynamically imported on first use and never enters the initial bundle.

let loadPromise = null;

export function loadTokenizer() {
  if (!loadPromise) {
    loadPromise = import('gpt-tokenizer/encoding/o200k_base')
      .then((mod) => ({ encode: mod.encode, decode: mod.decode }))
      .catch((error) => {
        console.error('Could not load the tokenizer:', error);
        loadPromise = null; // transient failure must not be cached for the session
        return null;
      });
  }
  return loadPromise;
}

export function tokenizeForDisplay(tokenizer, text) {
  if (!tokenizer || typeof text !== 'string' || text.length === 0) {
    return { count: 0, chunks: [] };
  }
  const ids = tokenizer.encode(text);
  return { count: ids.length, chunks: ids.map((id) => tokenizer.decode([id])) };
}

export function isPartialChunk(chunk) {
  return chunk === '';
}
