// Decides whether a user message deserves the long knowledge-cutoff note on its reply.
export const RECENCY_RE = /\b(today|right now|currently|current|latest|this week|weather)\b/i;

export function needsCutoffNote(userMessage) {
  return RECENCY_RE.test(String(userMessage?.content ?? ''));
}

export function mentionsWeather(content) {
  return /\bweather\b/i.test(String(content ?? ''));
}
