// Single source of truth for what gets sent to the API and where the
// "forgotten" divider sits in the transcript UI. Both come from one call so
// the outbound request, the staircase, and the divider can never disagree.

export const KEEP_ALL = null; // sentinel: replay the whole transcript
export const KEEP_TURNS_MIN = 0;
export const KEEP_TURNS_MAX = 6;
export const KEEP_TURNS_STEP = 1;
export const KEEP_TURNS_DEFAULT = 2; // slider position used when the switch flips on

export function buildOutboundMessages(conversation, keepTurns) {
  const eligible = [];
  (Array.isArray(conversation) ? conversation : []).forEach((message, index) => {
    if (message?.error !== true) eligible.push({ message, index });
  });

  // Old saved state may carry a stale/garbage keepTurns (NaN, a string, a
  // fractional slider value); treat anything that isn't a non-negative
  // integer as KEEP_ALL rather than throwing or truncating unpredictably.
  const keep = Number.isInteger(keepTurns) && keepTurns >= 0 ? keepTurns : null;
  const userPositions = eligible.reduce((positions, entry, position) => {
    if (entry.message?.role === 'user') positions.push(position);
    return positions;
  }, []);

  // The cut always lands on a user message so the outbound request never
  // starts with an orphaned assistant reply. An in-flight streaming
  // placeholder (assistant, no user role) is never counted here, so it can
  // never move the cut.
  const keepUsers = keep == null ? Infinity : keep + 1;
  const cutPosition = userPositions.length > keepUsers
    ? userPositions[userPositions.length - keepUsers]
    : 0;

  const kept = eligible.slice(cutPosition);
  return {
    messages: kept.map((entry) => entry.message),
    cutoffIndex: cutPosition === 0 ? 0 : kept[0].index,
    droppedCount: cutPosition,
    truncated: cutPosition > 0,
  };
}
