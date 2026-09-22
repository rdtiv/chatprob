import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { TRIAGE_SCENARIO, SEVERITY_MAX } from '../lib/triageFixture';
import {
  THRESHOLD_DEFAULTS,
  THRESHOLD_BOUNDS,
  clampThresholds,
  decideTriage,
  answerRows,
  scoreCaption,
  formatPercent,
  formatElapsed,
  speedVersusLlm,
} from '../lib/decisionPlayground';
import { resolveTicketState } from '../lib/evaluateTriage';
import { DECISION_COACH } from '../lib/coachCopy';
import { formatUsd } from '../lib/openaiRates';

const ACTION_LABEL = {
  auto: 'Auto',
  escalate: 'Escalate',
  reject: 'Reject',
};

function PercentBar({ probability, selected }) {
  const width = Number.isFinite(probability) ? Math.max(0, Math.min(1, probability)) * 100 : 0;
  return (
    <span className={`decision-bar${selected ? ' is-selected' : ''}`} aria-hidden="true">
      <span className="decision-bar-fill" style={{ width: `${width}%` }} />
    </span>
  );
}

function BooleanAxis({ probability }) {
  const left = Number.isFinite(probability) ? `${Math.max(0, Math.min(1, probability)) * 100}%` : '50%';
  return (
    <div className="decision-axis" aria-hidden="true">
      <span className="decision-axis-end">no</span>
      <span className="decision-axis-track">
        <span className="decision-axis-mark" style={{ left }} />
      </span>
      <span className="decision-axis-end">yes</span>
    </div>
  );
}

function QuestionCard({ id, question, answer, confidence }) {
  const rows = answerRows(question, answer);
  const scoreNote = answer?.type === 'score'
    ? scoreCaption(answer.score, question.criteria)
    : null;

  return (
    <article className="decision-card">
      <header className="decision-card-head">
        <h3>{question.label}</h3>
        <span className="decision-type">{question.type === 'boolean' ? 'boolean · noul' : question.type}</span>
      </header>
      <p className="decision-instructions">{question.instructions}</p>
      {answer?.type === 'choice' && (
        <p className="decision-reading">
          Picked <strong>{answer.choice}</strong>
          {' · '}
          {formatPercent(answer.probabilities?.[answer.choice])}
          {Number.isFinite(confidence) && (
            <span className="decision-confidence"> · confidence {formatPercent(confidence)}</span>
          )}
        </p>
      )}
      {answer?.type === 'score' && Number.isFinite(answer.score) && (
        <p className="decision-reading">
          Score <strong>{answer.score.toFixed(2)}</strong> of {SEVERITY_MAX}
          {scoreNote ? ` · ${scoreNote}` : ''}
          {Number.isFinite(confidence) && (
            <span className="decision-confidence"> · confidence {formatPercent(confidence)}</span>
          )}
        </p>
      )}
      {answer?.type === 'boolean' && (
        <>
          <p className="decision-reading">
            P(true) <strong>{formatPercent(answer.probability)}</strong>
          </p>
          <BooleanAxis probability={answer.probability} />
          <p className="decision-note">
            P(true) only — 0.02 is a strong no, not a shy yes.
          </p>
        </>
      )}
      {rows.length > 0 && (
        <ul className="decision-rows">
          {rows.map((row) => (
            <li key={row.key} className={row.selected ? 'is-selected' : undefined}>
              <span className="decision-row-label">{row.key}</span>
              <PercentBar probability={row.probability} selected={row.selected} />
              <span className="decision-row-pct">{formatPercent(row.probability)}</span>
              <span className="decision-row-hint">{row.label}</span>
            </li>
          ))}
        </ul>
      )}
      {!answer && question.type !== 'boolean' && Array.isArray(question.criteria) && (
        <ol className="decision-criteria">
          {question.criteria.map((level) => <li key={level}>{level}</li>)}
        </ol>
      )}
      {!answer && question.type === 'choice' && (
        <ul className="decision-criteria">
          {Object.entries(question.criteria).map(([key, label]) => (
            <li key={key}><span className="decision-row-label">{key}</span> {label}</li>
          ))}
        </ul>
      )}
      {!answer && question.type === 'boolean' && (
        <p className="decision-note">
          P(true) only — 0.02 is a strong no, not a shy yes.
        </p>
      )}
      {id === 'department' && Number.isFinite(confidence) && (
        <p className="decision-note">
          Confidence = how peaked the bar is — not the same as the pick %. These lines ignore it.
        </p>
      )}
    </article>
  );
}

function ThresholdField({ id, label, hint, min, max, step, value, disabled, onChange, formatValue }) {
  const shown = formatValue ? formatValue(value) : Number(value).toFixed(step < 0.1 ? 2 : 1);
  return (
    <label className="decision-field" htmlFor={id}>
      <span className="decision-field-label">
        {label}
        <span className="decision-field-value">{shown}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <span className="decision-field-hint">{hint}</span>}
    </label>
  );
}

function cannedTicket() {
  return {
    subject: TRIAGE_SCENARIO.state.subject,
    message: TRIAGE_SCENARIO.state.message,
    plan: TRIAGE_SCENARIO.state.plan,
    previousTickets: TRIAGE_SCENARIO.state.previousTickets,
  };
}

const DecisionWorkbench = forwardRef(function DecisionWorkbench({ hidden = false }, ref) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [thresholds, setThresholds] = useState(THRESHOLD_DEFAULTS);
  const [ticket, setTicket] = useState(cannedTicket);
  const requestRef = useRef(0);

  const decision = result ? decideTriage(result.answers, thresholds) : null;
  const elapsed = formatElapsed(result?.timing?.elapsedMs);
  const speedLine = speedVersusLlm(result?.timing?.elapsedMs);
  const costLabel = result?.cost?.usd > 0 ? formatUsd(result.cost.usd) : null;

  const setThreshold = (key, value) => {
    setThresholds((prev) => clampThresholds({ ...prev, [key]: value }));
  };

  const setTicketField = (key, value) => {
    setTicket((prev) => ({ ...prev, [key]: value }));
  };

  const resetToCanned = useCallback(() => {
    requestRef.current += 1;
    setTicket(cannedTicket());
    setThresholds(THRESHOLD_DEFAULTS);
    setResult(null);
    setError(null);
    setStatus('idle');
  }, []);

  useImperativeHandle(ref, () => ({ reset: resetToCanned }), [resetToCanned]);

  const run = async () => {
    const resolved = resolveTicketState(ticket, false);
    if (!resolved.ok) {
      setResult(null);
      setStatus('error');
      setError(resolved.error);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setStatus('loading');
    setError(null);
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: resolved.state }),
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!response.ok) {
        setResult(null);
        setStatus('error');
        setError(data.error || 'Judgment failed. Try again.');
        return;
      }
      setResult(data);
      setStatus('ready');
    } catch {
      if (requestId !== requestRef.current) return;
      setResult(null);
      setStatus('error');
      setError('The judgment request did not complete.');
    }
  };

  return (
    <div
      className="decision-workbench"
      id="mode-panel-decision"
      role="tabpanel"
      aria-labelledby="mode-tab-decision"
      hidden={hidden}
      aria-busy={status === 'loading'}
    >
      <ul className="decision-coach">
        {DECISION_COACH.map((line) => <li key={line}>{line}</li>)}
      </ul>

      <section className="decision-card" aria-label="Support ticket">
        <header className="decision-card-head">
          <h2>{TRIAGE_SCENARIO.title}</h2>
        </header>
        <div className="decision-ticket-fields">
          <label htmlFor="ticket-subject">
            Subject
            <input
              id="ticket-subject"
              type="text"
              value={ticket.subject}
              maxLength={240}
              onChange={(event) => setTicketField('subject', event.target.value)}
            />
          </label>
          <label htmlFor="ticket-message">
            Message
            <textarea
              id="ticket-message"
              value={ticket.message}
              maxLength={4000}
              rows={3}
              onChange={(event) => setTicketField('message', event.target.value)}
            />
          </label>
          <div className="decision-ticket-meta">
            <label htmlFor="ticket-plan">
              Plan
              <input
                id="ticket-plan"
                type="text"
                value={ticket.plan}
                maxLength={64}
                onChange={(event) => setTicketField('plan', event.target.value)}
              />
            </label>
            <label htmlFor="ticket-previous">
              Earlier tickets
              <input
                id="ticket-previous"
                type="number"
                min={0}
                max={9999}
                step={1}
                value={ticket.previousTickets}
                onChange={(event) => setTicketField('previousTickets', event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <div className="decision-run">
        <button
          type="button"
          className="decision-run-button glass-chip"
          onClick={run}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Judging…' : result ? 'Run it again' : 'Run this judgment'}
        </button>
      </div>

      {error && (
        <p className="decision-error" role="alert">{error}</p>
      )}

      {result && (
        <p className="decision-meta-line decision-result-meta">
          <span>{result.model}</span>
          {elapsed && <span>{elapsed}</span>}
            {Number.isFinite(result.usage?.inputTokens) && (
            <span>
              {result.usage.inputTokens} in
              {Number.isFinite(result.usage.outputTokens) ? ` · ${result.usage.outputTokens} out` : ''}
            </span>
          )}
          {costLabel && (
            <span>
              {result.cost.source === 'reported' ? 'gateway ' : 'input list price '}
              {costLabel}
            </span>
          )}
        </p>
      )}

      {speedLine && (
        <p className="decision-note decision-speed">{speedLine}</p>
      )}

      <div className="decision-questions">
        {Object.entries(TRIAGE_SCENARIO.questions).map(([id, question]) => (
          <QuestionCard
            key={id}
            id={id}
            question={question}
            answer={result?.answers?.[id]}
            confidence={result?.confidence?.[id]}
          />
        ))}
      </div>

      <section className="decision-card decision-playground" aria-label="Threshold playground">
        <header className="decision-card-head">
          <h2>Where you would draw the line</h2>
          {decision && (
            <span className={`decision-action is-${decision.action}`} aria-live="polite">
              {ACTION_LABEL[decision.action]}
            </span>
          )}
        </header>
        <p className="decision-note">Drag the lines over this result. No new model call. Not a policy.</p>
        {decision && (
          <p className="decision-note">{decision.reasons.join(' ')}</p>
        )}
        <ThresholdField
          id="threshold-reject"
          label="Reject a queue below"
          min={THRESHOLD_BOUNDS.departmentReject[0]}
          max={THRESHOLD_BOUNDS.departmentReject[1]}
          step={0.01}
          value={thresholds.departmentReject}
          disabled={!result}
          onChange={(value) => setThreshold('departmentReject', value)}
        />
        <ThresholdField
          id="threshold-auto"
          label="Auto-route a queue at"
          hint="Checked after reject. A picked queue under this line is named, then escalated."
          min={THRESHOLD_BOUNDS.departmentAuto[0]}
          max={THRESHOLD_BOUNDS.departmentAuto[1]}
          step={0.01}
          value={thresholds.departmentAuto}
          disabled={!result}
          onChange={(value) => setThreshold('departmentAuto', value)}
        />
        <ThresholdField
          id="threshold-severity"
          label="Escalate when severity reaches"
          hint="3 is the top of the rubric. Past 3, severity stops forcing an escalate."
          min={THRESHOLD_BOUNDS.severityEscalate[0]}
          max={THRESHOLD_BOUNDS.severityEscalate[1]}
          step={0.1}
          value={thresholds.severityEscalate}
          formatValue={(value) => (value > SEVERITY_MAX ? 'off' : value.toFixed(1))}
          disabled={!result}
          onChange={(value) => setThreshold('severityEscalate', value)}
        />
        <ThresholdField
          id="threshold-refund"
          label="Call a refund a clear yes at"
          hint={`A clear no is the mirror, at or below ${(1 - thresholds.refundYes).toFixed(2)}. Between them, escalate.`}
          min={THRESHOLD_BOUNDS.refundYes[0]}
          max={THRESHOLD_BOUNDS.refundYes[1]}
          step={0.01}
          value={thresholds.refundYes}
          disabled={!result}
          onChange={(value) => setThreshold('refundYes', value)}
        />
      </section>
    </div>
  );
});

export default DecisionWorkbench;
