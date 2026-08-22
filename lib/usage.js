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

export { sumNullable, roundUsage, buildUsage };
