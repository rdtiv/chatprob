// Temperature re-softmax and nucleus (top-p) for the token card.
// Raw logprobs in, two quantities out.
// Invariant-4 gate (2026-08-19): max |delta logprob| across shared position-0 top-5
// tokens at temp 0.2 vs 1.8 = 0.0000, constrained and open prompts -> logprobs are
// temperature-invariant, A1 premise HOLDS.

export const WINNER_TAKE_ALL_EPSILON = 1e-6;

export function buildFrozenSet({ topLogprobs, sampledToken, sampledLogprob, cutoffPercent = 0.5, maxRows = 5 }) {
  let entries = Object.entries(topLogprobs || {}).filter(([, lp]) => Number.isFinite(lp));

  if (sampledToken != null && Number.isFinite(sampledLogprob) && !entries.some(([t]) => t === sampledToken)) {
    entries = [...entries, [sampledToken, sampledLogprob]];
  }

  const ranked = entries.sort((a, b) => b[1] - a[1]);

  const sampledRank = sampledToken == null ? -1 : ranked.findIndex(([t]) => t === sampledToken);
  const inTopRows = sampledRank >= 0 && sampledRank < maxRows;

  const eligible = ranked.filter(([token, logprob]) =>
    token === sampledToken ? inTopRows : Math.exp(logprob) * 100 >= cutoffPercent
  );
  const candidates = eligible
    .slice(0, maxRows)
    .map(([token, logprob]) => ({ token, logprob, isSampled: token === sampledToken }));

  const sampledOutside = sampledRank >= 0 && !inTopRows
    ? { token: sampledToken, logprob: ranked[sampledRank][1], isSampled: true }
    : null;

  return { candidates, sampledOutside };
}

export function frozenRows(frozenSet) {
  return [...frozenSet.candidates, ...(frozenSet.sampledOutside ? [frozenSet.sampledOutside] : [])];
}

export function rawOdds(rows) {
  return rows.map((r) => (Number.isFinite(r.logprob) ? Math.exp(r.logprob) : 0));
}

export function oddsAmongCandidates(rows, temperature) {
  if (rows.length === 0) return [];

  const t = Number.isFinite(temperature) ? temperature : 1;

  if (t <= WINNER_TAKE_ALL_EPSILON) {
    let maxIndex = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].logprob > rows[maxIndex].logprob) maxIndex = i;
    }
    return rows.map((_, i) => (i === maxIndex ? 1 : 0));
  }

  const scaled = rows.map((r) => r.logprob / t);
  const m = Math.max(...scaled);
  const exps = scaled.map((s) => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// Nucleus (top-p) over a shown candidate list. Sort by probability, keep the
// smallest prefix whose mass reaches p. A false is definite: higher-ranked
// shown mass already covers p, so the token is outside any full-vocab nucleus
// that starts with this same ranking. A true is not: tokens we do not have
// could fill p first. Zero-probability rows are never kept unless every row
// is zero, in which case the first frozen row stays so the set is non-empty.
export function nucleusMembership(probabilities, topP) {
  const n = probabilities?.length ?? 0;
  if (n === 0) return [];

  const p = Number.isFinite(topP) ? topP : 1;
  const probs = Array.from({ length: n }, (_, i) => {
    const value = probabilities[i];
    return Number.isFinite(value) && value > 0 ? value : 0;
  });

  const order = probs.map((_, i) => i).sort((a, b) => {
    const delta = probs[b] - probs[a];
    return delta !== 0 ? delta : a - b;
  });

  const inNucleus = Array(n).fill(false);
  if (p <= 0) {
    inNucleus[order[0]] = true;
    return inNucleus;
  }

  let cumsum = 0;
  for (const i of order) {
    inNucleus[i] = true;
    cumsum += probs[i];
    if (cumsum >= p) break;
  }

  for (let i = 0; i < n; i++) {
    if (probs[i] <= 0) inNucleus[i] = false;
  }
  if (!inNucleus.some(Boolean)) inNucleus[order[0]] = true;
  return inNucleus;
}

// in/tail labels and the nucleus note are a top-p lesson. At the default of 1
// they stay off even when membership drops zero-mass rows (What-if at temp 0,
// or Make it repeatable). Temperature what-if still reshapes the percentages.
export function nucleusUiVisible(topP) {
  return Number.isFinite(topP) && topP < 1;
}

export function formatPercent(probability) {
  const percentage = probability * 100;
  if (percentage >= 10) return percentage.toFixed(1) + '%';
  if (percentage >= 1) return percentage.toFixed(2) + '%';
  if (percentage >= 0.1) return percentage.toFixed(2) + '%';
  if (percentage >= 0.01) return percentage.toFixed(3) + '%';
  if (percentage >= 0.001) return percentage.toFixed(4) + '%';
  return '<0.001%';
}
