// Temperature re-softmax for the token card. Raw logprobs in, two quantities out.
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

  const rowCount = candidates.length + (sampledOutside ? 1 : 0);

  return { candidates, sampledOutside, rowCount };
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

export function formatPercent(probability) {
  const percentage = probability * 100;
  if (percentage >= 10) return percentage.toFixed(1) + '%';
  if (percentage >= 1) return percentage.toFixed(2) + '%';
  if (percentage >= 0.1) return percentage.toFixed(2) + '%';
  if (percentage >= 0.01) return percentage.toFixed(3) + '%';
  if (percentage >= 0.001) return percentage.toFixed(4) + '%';
  return '<0.001%';
}
