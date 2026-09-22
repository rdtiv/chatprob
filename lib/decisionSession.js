// Picker, run, and reset for the Decision tab. The workbench uses these
// transitions so a reset test can see the same return to the four cards,
// and the same abort, that the button performs.

export const EDIT_BEAT_MS = 800;

export function initialDecisionSession() {
  return {
    phase: 'picker',
    scenarioId: null,
    status: 'idle',
  };
}

export function pickScenario(session, scenarioId) {
  return {
    phase: 'scenario',
    scenarioId,
    status: 'idle',
  };
}

export function markRunStarted(session) {
  if (session?.phase !== 'scenario') return session;
  return { ...session, status: 'loading' };
}

export function markRunFinished(session) {
  if (session?.phase !== 'scenario') return session;
  return { ...session, status: 'ready' };
}

export function markRunFailed(session) {
  if (session?.phase !== 'scenario') return session;
  return { ...session, status: 'error' };
}

export function fieldsLocked({ status, beat }) {
  return status === 'loading' || beat === true;
}

// Abort the in-flight judgment, if any, and hand back a fresh controller
// for the run that is starting.
export function beginRun(session, controller) {
  controller?.abort();
  return {
    session: markRunStarted(session),
    controller: new AbortController(),
  };
}

// Two-click Reset lands here: four cards again, and any fetch still
// running is aborted so its scores cannot fill a picker.
export function resetToPicker(controller) {
  controller?.abort();
  return {
    session: initialDecisionSession(),
    controller: null,
  };
}
