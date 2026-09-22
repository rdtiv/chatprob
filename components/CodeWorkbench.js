import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CODE_DATASETS, getDataset } from '../lib/codeDatasets';
import {
  beginRun,
  historyFromTurns,
  initialCodeSession,
  markRunFailed,
  noteFollowUp,
  pickDataset,
  resetToPicker,
} from '../lib/codeSession';
import { CODE_COACH } from '../lib/coachCopy';
import { applyCodeEvent, readCodeStream, visibleTypeScript } from '../lib/codeStream';
import CodeMarkdown from './CodeMarkdown';

function askLabel(turn, loading) {
  if (!loading) return 'Ask';
  if (turn?.livePhase === 'running') return 'Running it…';
  if (turn?.livePhase === 'markdown' || turn?.livePhase === 'result') return 'Writing it up…';
  return 'Writing the code…';
}

const CodeWorkbench = forwardRef(function CodeWorkbench({ hidden = false }, ref) {
  const [session, setSession] = useState(initialCodeSession);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const requestRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    requestRef.current += 1;
  }, []);

  const dataset = session.datasetId ? getDataset(session.datasetId) : null;

  const reset = useCallback(() => {
    const next = resetToPicker(abortRef.current);
    abortRef.current = next.controller;
    requestRef.current += 1;
    setSession(next.session);
    setDraft('');
    setError(null);
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  const pick = (id) => {
    const card = getDataset(id);
    if (!card || session.status === 'loading') return;
    abortRef.current?.abort();
    abortRef.current = null;
    requestRef.current += 1;
    setError(null);
    setDraft(card.question);
    setSession(pickDataset(initialCodeSession(), id));
  };

  const ask = async () => {
    if (!dataset) return;
    const message = draft.trim();
    if (!message || session.status === 'loading') return;
    if (session.turns.length) {
      const follow = noteFollowUp(session, dataset.id);
      if (!follow.ok) {
        setError(follow.error);
        return;
      }
    }
    const started = beginRun(session, abortRef.current);
    abortRef.current = started.controller;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const history = historyFromTurns(session.turns);
    const live = {
      user: message,
      typescript: '',
      markdown: '',
      error: '',
      output: null,
      live: true,
      livePhase: 'code',
    };
    setSession({
      ...started.session,
      turns: [...started.session.turns, live],
    });
    setDraft('');
    setError(null);
    let sawDone = false;
    try {
      const response = await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: dataset.id,
          message,
          history,
        }),
        signal: started.controller.signal,
      });
      if (requestId !== requestRef.current) return;
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        setSession(markRunFailed({
          ...started.session,
          turns: started.session.turns,
        }));
        setDraft(message);
        setError(data.error || 'The model did not answer. Try again.');
        return;
      }
      await readCodeStream(response.body, (event) => {
        if (requestId !== requestRef.current) return;
        if (event.type === 'done') sawDone = true;
        setSession((current) => {
          if (current.phase !== 'dataset') return current;
          const turns = current.turns.slice();
          const last = turns[turns.length - 1];
          if (!last) return current;
          turns[turns.length - 1] = applyCodeEvent(last, event);
          let status = current.status;
          if (event.type === 'done') status = 'ready';
          if (event.type === 'error') status = 'error';
          return { ...current, status, turns };
        });
      }, started.controller.signal);
      if (requestId !== requestRef.current) return;
      if (!sawDone) {
        setSession((current) => markRunFailed(current));
        setError('The model did not answer. Try again.');
      }
    } catch (fetchError) {
      if (requestId !== requestRef.current) return;
      if (fetchError?.name === 'AbortError') return;
      setSession(markRunFailed(started.session));
      setDraft(message);
      setError('The model did not answer. Try again.');
    }
  };

  return (
    <div
      className="decision-workbench code-workbench"
      id="mode-panel-code"
      role="tabpanel"
      aria-labelledby="mode-tab-code"
      hidden={hidden}
      aria-busy={session.status === 'loading'}
    >
      <ul className="decision-coach">
        {CODE_COACH.map((line) => <li key={line}>{line}</li>)}
      </ul>

      {session.phase === 'picker' || !dataset ? (
        <section className="decision-picker" aria-label="Pick a table">
          {CODE_DATASETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="decision-card decision-pick code-pick"
              onClick={() => pick(item.id)}
            >
              <span className="decision-pick-title">{item.title}</span>
              <span className="decision-pick-blurb">{item.blurb}</span>
              <span className="code-pick-coach">{item.coach}</span>
            </button>
          ))}
        </section>
      ) : (
        <div className="decision-expand" key={dataset.id}>
          <section className="decision-card" aria-label={dataset.title}>
            <header className="decision-card-head">
              <h2>{dataset.title}</h2>
            </header>
            <p className="decision-pick-blurb">{dataset.blurb}</p>
            <p className="code-pick-coach">{dataset.coach}</p>
            <p className="decision-note">
              {dataset.tableLine} The code already has it as <code>{dataset.constant}</code>. You do not upload it.
            </p>
          </section>

          {session.turns.map((turn, index) => {
            const code = visibleTypeScript(turn.typescript);
            return (
            <article className="code-turn" key={`${turn.user}-${index}`}>
              <h3 className="code-ask-label">You asked</h3>
              <p className="code-question">{turn.user}</p>
              {code && (
                <>
                  <h3 className="code-ask-label">The code it wrote</h3>
                  <pre className={`code-ts${turn.live && turn.livePhase === 'code' ? ' is-live' : ''}`}><code>{code}</code></pre>
                </>
              )}
              {turn.live && turn.livePhase === 'running' && (
                <p className="code-running">Running that count on the saved table.</p>
              )}
              {turn.error && (
                <section className="code-teaching" aria-label="What the code did">
                  <h2>What the code did</h2>
                  <p>{turn.error}</p>
                </section>
              )}
              {turn.markdown && (
                <section className="decision-card" aria-label="What the run showed">
                  <header className="decision-card-head">
                    <h2>What the run showed</h2>
                  </header>
                  <CodeMarkdown markdown={turn.markdown} />
                </section>
              )}
            </article>
            );
          })}

          <form
            className="code-ask"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <label htmlFor="code-ask">
              {session.turns.length ? 'Ask a follow-up about this same table' : 'The question'}
              <textarea
                id="code-ask"
                rows={3}
                value={draft}
                maxLength={2000}
                disabled={session.status === 'loading'}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="decision-run-button glass-chip"
              disabled={session.status === 'loading' || !draft.trim()}
            >
              {askLabel(session.turns[session.turns.length - 1], session.status === 'loading')}
            </button>
          </form>

          {error && (
            <p className="decision-error" role="alert">{error}</p>
          )}
        </div>
      )}
    </div>
  );
});

export default CodeWorkbench;
