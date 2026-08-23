// Whole-completion statistics for the response tabs: fork detection, perplexity, joint odds, and the shared confidence palette.

export const SENTINEL_LOGPROB_FLOOR = -100;

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
    const token = usable[0].tokenProbabilities[i]?.token;
    if (usable.some((c) => c.tokenProbabilities[i]?.token !== token)) return i;
  }

  if (usable.every((c) => c.tokenProbabilities.length === minLen)) return -1;
  return minLen;
}

export function completionStats(completion) {
  const tokenProbabilities = completion?.tokenProbabilities;
  if (!Array.isArray(tokenProbabilities) || tokenProbabilities.length === 0) return null;

  const tokenCount = tokenProbabilities.length;
  // OpenAI occasionally reports a sentinel logprob near -9999 meaning "unavailable",
  // not a real measurement; one of those would poison the mean, so exclude anything
  // below SENTINEL_LOGPROB_FLOOR (a genuinely sampled token never lands that low).
  const usable = tokenProbabilities
    .map(sampledLogprob)
    .filter((lp) => Number.isFinite(lp) && lp > SENTINEL_LOGPROB_FLOOR);

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
  if (!Number.isFinite(perplexity) || perplexity <= 0 || perplexity > 1_000_000) return null;
  const n = Math.max(1, Math.round(perplexity));
  return `picking from ~${n} plausible ${n === 1 ? 'word' : 'words'}`;
}

export function formatJointOdds(jointLog10) {
  if (!Number.isFinite(jointLog10)) return null;
  const k = Math.round(-jointLog10);
  if (k > 2000) return null; // beyond any real reply's odds — upstream data was bad
  return k >= 1 ? `~1 in 10^${k}` : 'better than 1 in 10';
}

export function confidenceRgb(percentage) {
  if (!Number.isFinite(percentage)) return null;
  const p = Math.min(100, Math.max(0, percentage));

  const colors = {
    high: { r: 34, g: 197, b: 94 },
    mid: { r: 234, g: 179, b: 8 },
    low: { r: 139, g: 0, b: 0 },
  };

  if (p >= 50) {
    const ratio = (p - 50) / 50;
    return {
      r: Math.round(colors.mid.r + (colors.high.r - colors.mid.r) * ratio),
      g: Math.round(colors.mid.g + (colors.high.g - colors.mid.g) * ratio),
      b: Math.round(colors.mid.b + (colors.high.b - colors.mid.b) * ratio),
    };
  }

  const ratio = p / 50;
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

/**
 * The same ramp shape as confidenceRgb(), with a low stop that survives a dark
 * ground. Only `low` moves: {139,0,0} at the alphas Message.js produces is
 * invisible over --surface #151a26 (1.01:1 against the bubble at p=0), while
 * the mid and high stops already read there — and a brighter green would push
 * body text on a p=100 token below 4.5:1.
 * Light output is untouched: confidenceRgb() is the only source for --conf-rgb.
 */
export function confidenceRgbDark(percentage) {
  if (!Number.isFinite(percentage)) return null;
  const p = Math.min(100, Math.max(0, percentage));

  const colors = {
    high: { r: 34, g: 197, b: 94 },
    mid: { r: 234, g: 179, b: 8 },
    low: { r: 248, g: 113, b: 113 },
  };

  if (p >= 50) {
    const ratio = (p - 50) / 50;
    return {
      r: Math.round(colors.mid.r + (colors.high.r - colors.mid.r) * ratio),
      g: Math.round(colors.mid.g + (colors.high.g - colors.mid.g) * ratio),
      b: Math.round(colors.mid.b + (colors.high.b - colors.mid.b) * ratio),
    };
  }

  const ratio = p / 50;
  return {
    r: Math.round(colors.low.r + (colors.mid.r - colors.low.r) * ratio),
    g: Math.round(colors.low.g + (colors.mid.g - colors.low.g) * ratio),
    b: Math.round(colors.low.b + (colors.mid.b - colors.low.b) * ratio),
  };
}

/**
 * The same colour confidenceColor() renders, split so CSS can re-gain the alpha
 * per colour scheme: rgba(var(--conf-rgb), calc(var(--conf-a) * var(--heat-gain) + var(--heat-lift) * var(--conf-on))).
 * `rgbDark` is the same token's colour on a dark ground; CSS picks it under
 * prefers-color-scheme: dark.
 * @returns {{ rgb: string, rgbDark: string, alpha: number }|null} null where confidenceColor() returns 'transparent'.
 */
export function confidenceParts(percentage, alpha) {
  const rgb = confidenceRgb(percentage);
  if (!rgb) return null;
  const dark = confidenceRgbDark(percentage);
  return { rgb: `${rgb.r}, ${rgb.g}, ${rgb.b}`, rgbDark: `${dark.r}, ${dark.g}, ${dark.b}`, alpha };
}

export const UNSURE_THRESHOLD = 65;
export const VERY_UNSURE_THRESHOLD = 35;

/** @returns {'sure'|'unsure'|'very-unsure'|null} */
export function confidenceBand(percentage) {
  if (!Number.isFinite(percentage)) return null;
  if (percentage >= UNSURE_THRESHOLD) return 'sure';
  if (percentage >= VERY_UNSURE_THRESHOLD) return 'unsure';
  return 'very-unsure';
}
