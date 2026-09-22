// LLM reply clock. Always milliseconds, so it shares a unit with a Decision
// call that came back in under a second.

export function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  return `${Math.round(ms)} ms`;
}

export function formatReplyTiming(timing) {
  if (!timing || !Number.isFinite(timing.totalMs) || timing.totalMs < 0) return null;
  const total = formatDurationMs(timing.totalMs);
  if (!timing.streamed) return `reply ${total}`;
  if (!Number.isFinite(timing.ttftMs) || timing.ttftMs < 0) return `reply ${total} · streamed`;
  const first = formatDurationMs(timing.ttftMs);
  if (Math.round(timing.ttftMs) === Math.round(timing.totalMs)) return `reply ${total} · streamed`;
  return `first token ${first} · all replies ${total}`;
}
