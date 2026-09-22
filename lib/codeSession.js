// Picker, ask, follow-up, and reset for the Code tab. A follow-up cannot
// change the table. Reset drops the thread and returns to the four cards.

export function initialCodeSession() {
  return {
    phase: 'picker',
    datasetId: null,
    status: 'idle',
    turns: [],
  };
}

export function pickDataset(session, datasetId) {
  return {
    phase: 'dataset',
    datasetId,
    status: 'idle',
    turns: [],
  };
}

export function markRunStarted(session) {
  if (session?.phase !== 'dataset') return session;
  return { ...session, status: 'loading' };
}

export function markRunFinished(session) {
  if (session?.phase !== 'dataset') return session;
  return { ...session, status: 'ready' };
}

export function markRunFailed(session) {
  if (session?.phase !== 'dataset') return session;
  return { ...session, status: 'error' };
}

export function noteFollowUp(session, datasetId) {
  if (session?.phase !== 'dataset' || !session.datasetId) {
    return { ok: false, error: 'Pick a table first.' };
  }
  if (session.datasetId !== datasetId) {
    return { ok: false, error: 'A follow-up stays on this table. Reset to pick another.', session };
  }
  return { ok: true, session: { ...session, status: 'loading' } };
}

export function recordTurn(session, turn) {
  if (session?.phase !== 'dataset') return session;
  return {
    ...session,
    status: 'ready',
    turns: [...(session.turns || []), turn],
  };
}

export function historyFromTurns(turns) {
  const history = [];
  for (const turn of turns || []) {
    if (!turn?.user) continue;
    history.push({ role: 'user', content: String(turn.user) });
    const note = turn.output != null
      ? `The sandbox returned ${JSON.stringify(turn.output)}`
      : String(turn.error || 'The code did not finish.');
    history.push({ role: 'assistant', content: note });
  }
  return history;
}

export function beginRun(session, controller) {
  controller?.abort();
  return {
    session: markRunStarted(session),
    controller: new AbortController(),
  };
}

// Two-click Reset lands here: four cards again, empty thread, and any
// request still running is aborted.
export function resetToPicker(controller) {
  controller?.abort();
  return {
    session: initialCodeSession(),
    controller: null,
  };
}
