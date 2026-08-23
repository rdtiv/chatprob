// Shared shape for an assistant turn that ends in an abort — used by both the
// streaming path (which merges these fields into a partially-flushed message)
// and the non-streaming/tools JSON path (which has no partial message to
// merge into, so it builds a whole message from scratch). Kept in one place
// so the two paths can't quietly drift on what "aborted" means to Message.js
// (`message-aborted-note`, `.aborted`, `.abortReason`) or to persistence
// (`error: true` keeps the turn out of the pruning budget's keep count).

// The fields that mark a message as an aborted turn, regardless of whether it
// carries partial streamed text.
export function abortedFields(reason) {
  return {
    error: true,
    aborted: true,
    usage: null,
    timing: null,
    ...(reason ? { abortReason: reason } : {}),
  };
}

// A full assistant message for an abort that has no partial content at all —
// the JSON/tools path, where the fetch was cut off before any response body
// existed. Message.js reads completions[0], so this carries one empty
// completion rather than an empty array.
export function abortedTurn({ timestamp, reason } = {}) {
  return {
    role: 'assistant',
    content: '',
    completions: [{ text: '', tokenProbabilities: [] }],
    activeIndex: 0,
    timestamp: timestamp ?? new Date().toISOString(),
    ...abortedFields(reason),
  };
}
