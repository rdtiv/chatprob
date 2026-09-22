import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CODE_DATASETS, PHASE_2_NOTE, getDataset } from '../lib/codeAnalysis/datasets';
import {
  beginRun,
  initialCodeSession,
  markRunFailed,
  markRunFinished,
  pickDataset,
  resetToPicker,
} from '../lib/codeSession';
import { CODE_COACH } from '../lib/coachCopy';

const CodeWorkbench = forwardRef(function CodeWorkbench({ hidden = false }, ref) {
  const [session, setSession] = useState(initialCodeSession);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
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
    setResult(null);
    setError(null);
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  const pick = (id) => {
    if (!getDataset(id) || session.status === 'loading') return;
    abortRef.current?.abort();
    abortRef.current = null;
    requestRef.current += 1;
    setResult(null);
    setError(null);
    setSession(pickDataset(initialCodeSession(), id));
  };

  const run = async () => {
    if (!dataset) return;
    const started = beginRun(session, abortRef.current);
    abortRef.current = started.controller;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setSession(started.session);
    setError(null);
    try {
      const response = await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: dataset.id }),
        signal: started.controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!response.ok) {
        setResult(null);
        setSession(markRunFailed(started.session));
        setError(data.error || 'The check did not finish.');
        return;
      }
      setResult(data);
      setSession((prev) => (
        prev.phase === 'dataset' && prev.datasetId === dataset.id
          ? markRunFinished(prev)
          : prev
      ));
    } catch (fetchError) {
      if (requestId !== requestRef.current) return;
      if (fetchError?.name === 'AbortError') return;
      setResult(null);
      setSession(markRunFailed(started.session));
      setError('The check did not finish.');
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
            <p className="code-question">{dataset.question}</p>
            <p className="decision-note">{dataset.tableLine}</p>
          </section>

          <div className="decision-run">
            <button
              type="button"
              className="decision-run-button glass-chip"
              onClick={run}
              disabled={session.status === 'loading'}
            >
              {session.status === 'loading' ? 'Checking the table…' : result ? 'Run it again' : 'Run this check'}
            </button>
          </div>

          {error && (
            <p className="decision-error" role="alert">{error}</p>
          )}

          {result && (
            <>
              <p className="decision-meta-line decision-result-meta">
                <span>Saved table</span>
                <span>No model call</span>
              </p>
              <section className="decision-card" aria-label="What the check counted">
                <header className="decision-card-head">
                  <h2>What the check counted</h2>
                </header>
                <dl className="code-lines">
                  {result.lines.map((line) => (
                    <div key={line.label} className="code-line">
                      <dt>{line.label}</dt>
                      <dd>{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="code-teaching" aria-label="What this table is teaching">
                <h2>What this table is teaching</h2>
                <p>{result.punchline}</p>
              </section>
              <p className="decision-note code-phase2">{PHASE_2_NOTE}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default CodeWorkbench;
