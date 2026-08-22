// Decides whether a user message deserves the long knowledge-cutoff note on its reply.
export const RECENCY_RE = /\b(today|right now|currently|current|latest|this week|weather)\b/i;

export function needsCutoffNote(userMessage) {
  if (userMessage?.source === 'chip-fool') return true;
  return RECENCY_RE.test(String(userMessage?.content ?? ''));
}

export function mentionsWeather(content) {
  return /\bweather\b/i.test(String(content ?? ''));
}
