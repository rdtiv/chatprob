// Picker, run, and reset for the Code tab. The workbench uses these
// transitions so a reset test can see the same return to the four cards,
// and the same abort, that the button performs.

export function initialCodeSession() {
  return {
    phase: 'picker',
    datasetId: null,
    status: 'idle',
  };
}

export function pickDataset(session, datasetId) {
  return {
    phase: 'dataset',
    datasetId,
    status: 'idle',
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

export function beginRun(session, controller) {
  controller?.abort();
  return {
    session: markRunStarted(session),
    controller: new AbortController(),
  };
}

// Two-click Reset lands here: four cards again, and any check still
// running is aborted so its counts cannot fill a picker.
export function resetToPicker(controller) {
  controller?.abort();
  return {
    session: initialCodeSession(),
    controller: null,
  };
}
