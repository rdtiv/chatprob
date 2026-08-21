// Sampling bounds shared by the client controls and the API route.
// lib/resoftmax.js treats T <= WINNER_TAKE_ALL_EPSILON as winner-take-all, which is
// what makes TEMP_MIN = 0 safe for the card's what-if view.

export const TEMP_MIN = 0;
export const TEMP_MAX = 1.8;
export const TEMP_STEP = 0.1;
export const TEMP_DEFAULT = 1.0;

export const TOP_P_MIN = 0.05;       // lowest value the slider can reach
export const TOP_P_HARD_MIN = 0.01;  // server-side floor; top_p = 0 is degenerate
export const TOP_P_MAX = 1;
export const TOP_P_STEP = 0.05;
export const TOP_P_DEFAULT = 1;

export const PENALTY_MIN = -2;
export const PENALTY_MAX = 2;
export const PENALTY_STEP = 0.05;
export const PENALTY_DEFAULT = 0.45;

export const BORING_SEED = 7;

export function clampTemperature(value) {
  if (!Number.isFinite(value)) return TEMP_DEFAULT;
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, value));
}

export function clampTopP(value) {
  if (!Number.isFinite(value)) return TOP_P_DEFAULT;
  return Math.min(TOP_P_MAX, Math.max(TOP_P_HARD_MIN, value));
}

export function clampPresencePenalty(value) {
  if (!Number.isFinite(value)) return PENALTY_DEFAULT;
  return Math.min(PENALTY_MAX, Math.max(PENALTY_MIN, value));
}

// null means "omit the seed parameter" — "no seed" and "seed 0" are different
// requests, so 0 passes through as a valid seed.
export function clampSeed(value) {
  if (!Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  const INT32_MAX = 2 ** 31 - 1;
  if (value < -INT32_MAX || value > INT32_MAX) return null;
  return value;
}
