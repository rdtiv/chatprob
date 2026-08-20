// Whole-completion statistics for the response tabs: fork detection, perplexity, joint odds, and the shared confidence palette.

export function sampledLogprob(tokenData) {
  if (!tokenData) return null;
  if (typeof tokenData.logprob === 'number') return tokenData.logprob;
  if (tokenData.top_logprobs && tokenData.token in tokenData.top_logprobs) {
    return tokenData.top_logprobs[tokenData.token];
  }
  return null;
}

export function findForkIndex(completions) {
  const usable = (completions || []).filter(
    (c) => Array.isArray(c?.tokenProbabilities) && c.tokenProbabilities.length > 0
  );
  if (usable.length < 2) return -1;

  const minLen = Math.min(...usable.map((c) => c.tokenProbabilities.length));

  for (let i = 0; i < minLen; i++) {
    const token = usable[0].tokenProbabilities[i].token;
    if (usable.some((c) => c.tokenProbabilities[i].token !== token)) return i;
  }

  if (usable.every((c) => c.tokenProbabilities.length === minLen)) return -1;
  return minLen;
}

export function completionStats(completion) {
  const tokenProbabilities = completion?.tokenProbabilities;
  if (!Array.isArray(tokenProbabilities) || tokenProbabilities.length === 0) return null;

  const tokenCount = tokenProbabilities.length;
  const usable = tokenProbabilities.map(sampledLogprob).filter(Number.isFinite);

  if (usable.length === 0) {
    return { tokenCount, meanLogprob: null, perplexity: null, jointLog10: null, confidence: null };
  }

  const sumLogprob = usable.reduce((a, b) => a + b, 0);
  const meanLogprob = sumLogprob / usable.length;
  const perplexity = Math.exp(-meanLogprob);
  const jointLog10 = sumLogprob / Math.LN10;
  const confidence = Math.exp(meanLogprob) * 100;

  return { tokenCount, meanLogprob, perplexity, jointLog10, confidence };
}

export function formatPerplexity(perplexity) {
  if (!Number.isFinite(perplexity)) return null;
  const n = Math.max(1, Math.round(perplexity));
  return `picking from ~${n} plausible ${n === 1 ? 'word' : 'words'}`;
}

export function formatJointOdds(jointLog10) {
  if (!Number.isFinite(jointLog10)) return null;
  const k = Math.round(-jointLog10);
  return k >= 1 ? `~1 in 10^${k}` : 'better than 1 in 10';
}

export function confidenceRgb(percentage) {
  if (!Number.isFinite(percentage)) return null;

  const colors = {
    high: { r: 34, g: 197, b: 94 },
    mid: { r: 234, g: 179, b: 8 },
    low: { r: 139, g: 0, b: 0 },
  };

  if (percentage >= 50) {
    const ratio = (percentage - 50) / 50;
    return {
      r: Math.round(colors.mid.r + (colors.high.r - colors.mid.r) * ratio),
      g: Math.round(colors.mid.g + (colors.high.g - colors.mid.g) * ratio),
      b: Math.round(colors.mid.b + (colors.high.b - colors.mid.b) * ratio),
    };
  }

  const ratio = percentage / 50;
  return {
    r: Math.round(colors.low.r + (colors.mid.r - colors.low.r) * ratio),
    g: Math.round(colors.low.g + (colors.mid.g - colors.low.g) * ratio),
    b: Math.round(colors.low.b + (colors.mid.b - colors.low.b) * ratio),
  };
}

export function confidenceColor(percentage, alpha) {
  const rgb = confidenceRgb(percentage);
  if (!rgb) return 'transparent';
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
