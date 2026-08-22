// Single source of truth for what gets sent to the API and where the
// "forgotten" divider sits in the transcript UI. Both come from one call, so
// the divider's claim about the next request always matches what will be
// sent. (Past requests are recorded by the server echo and per-turn usage,
// which deliberately do not move when the control does.)

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

  // Defensive coercion: nothing persists keepTurns today, but a hand-crafted
  // or future-persisted value could be garbage (NaN, a string, a fractional
  // number); treat anything that isn't a non-negative integer as KEEP_ALL
  // rather than throwing or truncating unpredictably.
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
  // Two coordinate systems, deliberately: cutoffIndex is an index into the
  // ORIGINAL conversation array (so it also counts error bubbles above the
  // line — use it for anything on-screen, like the divider's message count),
  // while droppedCount counts only eligible messages removed from the
  // outbound payload.
  return {
    messages: kept.map((entry) => entry.message),
    cutoffIndex: cutPosition === 0 ? 0 : kept[0].index,
    droppedCount: cutPosition,
    truncated: cutPosition > 0,
  };
}
