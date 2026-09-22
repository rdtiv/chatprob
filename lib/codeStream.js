// Events the Analyze client reads from POST /api/code.
// code     — a piece of the TypeScript, in order
// running  — the fence is complete and the sandbox is starting
// result   — the sandbox JSON, or a teaching error
// markdown — a piece of the write-up; replace:true swaps the whole note
// done     — the turn is finished; markdownSource is "model" or "run"
// error    — the model call failed

export function visibleTypeScript(raw) {
  const source = String(raw ?? '');
  const closed = source.match(/```(?:ts|typescript|js|javascript)?\s*([\s\S]*?)```/i);
  if (closed) return closed[1].replace(/^\n/, '').replace(/\s+$/, '');
  return source.replace(/^```(?:ts|typescript|js|javascript)?[^\n]*\n?/, '').replace(/```\s*$/, '');
}

export function applyCodeEvent(turn, event) {
  if (!turn || !event || typeof event !== 'object') return turn;
  if (event.type === 'code') {
    return { ...turn, typescript: `${turn.typescript || ''}${event.text || ''}`, livePhase: 'code' };
  }
  if (event.type === 'running') return { ...turn, livePhase: 'running' };
  if (event.type === 'result') {
    if (event.ok) return { ...turn, output: event.output, error: '', livePhase: 'result' };
    return { ...turn, output: null, error: event.error || 'The code did not finish.', livePhase: 'result' };
  }
  if (event.type === 'markdown') {
    const markdown = event.replace ? String(event.text || '') : `${turn.markdown || ''}${event.text || ''}`;
    return { ...turn, markdown, livePhase: 'markdown' };
  }
  if (event.type === 'done') {
    return { ...turn, live: false, livePhase: 'done', markdownSource: event.markdownSource || null };
  }
  if (event.type === 'error') {
    return { ...turn, error: event.message || 'The model did not answer. Try again.', live: false, livePhase: 'done' };
  }
  return turn;
}

export function reduceCodeEvents(turn, events) {
  return (events || []).reduce((current, event) => applyCodeEvent(current, event), turn);
}

// Reads an NDJSON body. A line may arrive split across chunks.
export async function readCodeStream(body, onEvent, signal) {
  const reader = body.getReader();
  const onAbort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (signal?.aborted) return;
        if (line.trim()) onEvent(JSON.parse(line));
      }
    }
    const tail = buffer.trim();
    if (tail && !signal?.aborted) onEvent(JSON.parse(tail));
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') return;
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
