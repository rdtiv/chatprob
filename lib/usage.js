function sumNullable(values) {
  const present = values.filter((v) => Number.isFinite(v));
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function roundUsage(raw) {
  return {
    prompt_tokens: raw?.prompt_tokens ?? null,
    completion_tokens: raw?.completion_tokens ?? null,
    cached_tokens: raw?.prompt_tokens_details?.cached_tokens ?? null,
  };
}

// One turn can cost more than one request. The totals are what you paid;
// `rounds` is the itemised receipt, and only appears when there is more
// than one line on it.
function buildUsage(rawUsages, model, sampling) {
  const rounds = rawUsages.map(roundUsage);
  return {
    prompt_tokens: sumNullable(rounds.map((r) => r.prompt_tokens)),
    completion_tokens: sumNullable(rounds.map((r) => r.completion_tokens)),
    cached_tokens: sumNullable(rounds.map((r) => r.cached_tokens)),
    model,
    sampling,
    ...(rounds.length > 1 ? { rounds } : {}),
  };
}

// The one-line receipt shown on a reply and in the cost summary:
// "143 in · 13 out", or for a tool turn "270 + 341 in · 49 out · 2 requests".
// A missing completion count omits the "out" segment rather than printing null.
function formatTokenSummary(usage) {
  if (!usage || !Number.isFinite(usage.prompt_tokens)) return null;
  const rounds = Array.isArray(usage.rounds) && usage.rounds.length > 1 ? usage.rounds : null;
  const inPart = rounds
    ? `${rounds.map((r) => r.prompt_tokens ?? '—').join(' + ')} in`
    : `${usage.prompt_tokens} in`;
  const parts = [inPart];
  if (Number.isFinite(usage.completion_tokens)) parts.push(`${usage.completion_tokens} out`);
  if (rounds) parts.push(`${rounds.length} requests`);
  return parts.join(' · ');
}

export { sumNullable, roundUsage, buildUsage, formatTokenSummary };
