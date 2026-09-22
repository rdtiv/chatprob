import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { SEVERITY_MAX } from '../lib/triageFixture';
import { DECISION_SCENARIOS, getScenario, resolveScenarioState } from '../lib/decisionScenarios';
import {
  EDIT_BEAT_MS,
  initialDecisionSession,
  pickScenario,
  markRunFinished,
  markRunFailed,
  fieldsLocked,
  beginRun,
  resetToPicker,
} from '../lib/decisionSession';
import {
  THRESHOLD_DEFAULTS,
  THRESHOLD_BOUNDS,
  clampThresholds,
  decideForScenario,
  answerRows,
  scoreCaption,
  formatPercent,
  formatElapsed,
  speedVersusLlm,
} from '../lib/decisionPlayground';
import { DECISION_BOOLEAN_NOTE, DECISION_COACH } from '../lib/coachCopy';
import { formatUsd } from '../lib/openaiRates';

const ACTION_LABEL = {
  auto: 'Auto',
  escalate: 'Escalate',
  reject: 'Reject',
};

const SURFACE_LABEL = {
  ticket: 'Support ticket',
  email: 'Inbound mail',
  ask: 'What they asked',
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

function QuestionCard({ question, answer, confidence }) {
  const rows = answerRows(question, answer);
  const scoreMax = Array.isArray(question.criteria) ? question.criteria.length - 1 : 0;
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
          Score <strong>{answer.score.toFixed(2)}</strong> of {scoreMax}
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
          <p className="decision-note">{DECISION_BOOLEAN_NOTE}</p>
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
        <p className="decision-note">{DECISION_BOOLEAN_NOTE}</p>
      )}
      {question.type === 'choice' && Number.isFinite(confidence) && (
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

function scoreQuestionFor(scenario) {
  if (!scenario) return null;
  if (scenario.judge === 'shaped') {
    if (!scenario.playground.scoreId) return null;
    return scenario.questions[scenario.playground.scoreId] ?? null;
  }
  return scenario.questions.severity ?? null;
}

function ScenarioFields({ scenario, ticket, locked, readOnly, onChange }) {
  const fieldProps = { disabled: locked, readOnly };
  if (scenario.surface === 'email') {
    return (
      <div className="decision-ticket-fields">
        <label htmlFor="ticket-from">
          From
          <input
            id="ticket-from"
            type="text"
            value={ticket.from}
            maxLength={120}
            {...fieldProps}
            onChange={(event) => onChange('from', event.target.value)}
          />
        </label>
        <label htmlFor="ticket-subject">
          Subject
          <input
            id="ticket-subject"
            type="text"
            value={ticket.subject}
            maxLength={240}
            {...fieldProps}
            onChange={(event) => onChange('subject', event.target.value)}
          />
        </label>
        <label htmlFor="ticket-body">
          Body
          <textarea
            id="ticket-body"
            value={ticket.body}
            maxLength={4000}
            rows={4}
            {...fieldProps}
            onChange={(event) => onChange('body', event.target.value)}
          />
        </label>
      </div>
    );
  }

  if (scenario.surface === 'ask') {
    return (
      <div className="decision-ticket-fields">
        <label htmlFor="ticket-ask">
          What they asked
          <textarea
            id="ticket-ask"
            value={ticket.ask}
            maxLength={4000}
            rows={3}
            {...fieldProps}
            onChange={(event) => onChange('ask', event.target.value)}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="decision-ticket-fields">
      <label htmlFor="ticket-subject">
        Subject
        <input
          id="ticket-subject"
          type="text"
          value={ticket.subject}
          maxLength={240}
          {...fieldProps}
          onChange={(event) => onChange('subject', event.target.value)}
        />
      </label>
      <label htmlFor="ticket-message">
        Message
        <textarea
          id="ticket-message"
          value={ticket.message}
          maxLength={4000}
          rows={3}
          {...fieldProps}
          onChange={(event) => onChange('message', event.target.value)}
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
            {...fieldProps}
            onChange={(event) => onChange('plan', event.target.value)}
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
            {...fieldProps}
            onChange={(event) => onChange('previousTickets', event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

const DecisionWorkbench = forwardRef(function DecisionWorkbench({ hidden = false }, ref) {
  const [session, setSession] = useState(initialDecisionSession);
  const [beat, setBeat] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [thresholds, setThresholds] = useState(THRESHOLD_DEFAULTS);
  const [ticket, setTicket] = useState(null);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const beatTimerRef = useRef(null);

  const clearBeat = useCallback(() => {
    if (beatTimerRef.current) {
      clearTimeout(beatTimerRef.current);
      beatTimerRef.current = null;
    }
    setBeat(false);
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    requestRef.current += 1;
    if (beatTimerRef.current) clearTimeout(beatTimerRef.current);
  }, []);

  const scenario = session.scenarioId ? getScenario(session.scenarioId) : null;
  const locked = fieldsLocked({ status: session.status, beat });
  const decision = result && scenario ? decideForScenario(scenario, result.answers, thresholds) : null;
  const elapsed = formatElapsed(result?.timing?.elapsedMs);
  const speedLine = speedVersusLlm(result?.timing?.elapsedMs);
  const costLabel = result?.cost?.usd > 0 ? formatUsd(result.cost.usd) : null;
  const scoreQuestion = scoreQuestionFor(scenario);
  const scoreMax = Array.isArray(scoreQuestion?.criteria) ? scoreQuestion.criteria.length - 1 : SEVERITY_MAX;

  const setThreshold = (key, value) => {
    setThresholds((prev) => clampThresholds({ ...prev, [key]: value }));
  };

  const setTicketField = (key, value) => {
    setTicket((prev) => ({ ...prev, [key]: value }));
  };

  const reset = useCallback(() => {
    const next = resetToPicker(abortRef.current);
    abortRef.current = next.controller;
    requestRef.current += 1;
    if (beatTimerRef.current) {
      clearTimeout(beatTimerRef.current);
      beatTimerRef.current = null;
    }
    setBeat(false);
    setSession(next.session);
    setTicket(null);
    setThresholds(THRESHOLD_DEFAULTS);
    setResult(null);
    setError(null);
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  const pick = (id) => {
    const nextScenario = getScenario(id);
    if (!nextScenario || session.status === 'loading') return;
    clearBeat();
    setSession(pickScenario(session, id));
    setTicket({ ...nextScenario.state });
    setThresholds(THRESHOLD_DEFAULTS);
    setResult(null);
    setError(null);
  };

  const startBeat = () => {
    clearBeat();
    setBeat(true);
    beatTimerRef.current = setTimeout(() => {
      beatTimerRef.current = null;
      setBeat(false);
    }, EDIT_BEAT_MS);
  };

  const run = async () => {
    if (!scenario || !ticket) return;
    const resolved = resolveScenarioState(scenario, ticket, false);
    if (!resolved.ok) {
      abortRef.current?.abort();
      abortRef.current = null;
      requestRef.current += 1;
      clearBeat();
      setResult(null);
      setSession(markRunFailed(session));
      setError(resolved.error);
      return;
    }

    const started = beginRun(session, abortRef.current);
    abortRef.current = started.controller;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    clearBeat();
    setSession(started.session);
    setError(null);
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: scenario.id, state: resolved.state }),
        signal: started.controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!response.ok) {
        setResult(null);
        setSession(markRunFailed(started.session));
        setError(data.error || 'Judgment failed. Try again.');
        return;
      }
      setResult(data);
      setSession((prev) => (
        prev.phase === 'scenario' && prev.scenarioId === scenario.id
          ? markRunFinished(prev)
          : prev
      ));
      startBeat();
    } catch (fetchError) {
      if (requestId !== requestRef.current) return;
      if (fetchError?.name === 'AbortError') return;
      setResult(null);
      setSession(markRunFailed(started.session));
      setError('The judgment request did not complete.');
    }
  };

  const showHint = session.status === 'ready' && result && scenario;

  return (
    <div
      className="decision-workbench"
      id="mode-panel-decision"
      role="tabpanel"
      aria-labelledby="mode-tab-decision"
      hidden={hidden}
      aria-busy={session.status === 'loading'}
    >
      <ul className="decision-coach">
        {DECISION_COACH.map((line) => <li key={line}>{line}</li>)}
      </ul>

      {session.phase === 'picker' || !scenario || !ticket ? (
        <section className="decision-picker" aria-label="Pick a situation">
          {DECISION_SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="decision-card decision-pick"
              onClick={() => pick(item.id)}
            >
              <span className="decision-pick-title">{item.cardTitle}</span>
              <span className="decision-pick-blurb">{item.blurb}</span>
            </button>
          ))}
        </section>
      ) : (
        <div className="decision-expand" key={scenario.id}>
          <section className="decision-card" aria-label={SURFACE_LABEL[scenario.surface] || 'Situation'}>
            <header className="decision-card-head decision-ticket-head">
              <h2>{scenario.cardTitle}</h2>
              {showHint && (
                <p className="decision-ticket-hint">{scenario.editHint}</p>
              )}
            </header>
            <ScenarioFields
              scenario={scenario}
              ticket={ticket}
              locked={session.status === 'loading'}
              readOnly={locked && session.status !== 'loading'}
              onChange={setTicketField}
            />
          </section>

          <div className="decision-run">
            <button
              type="button"
              className="decision-run-button glass-chip"
              onClick={run}
              disabled={session.status === 'loading'}
            >
              {session.status === 'loading' ? 'Judging…' : result ? 'Run it again' : 'Run this judgment'}
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
            {Object.entries(scenario.questions).map(([id, question]) => (
              <QuestionCard
                key={id}
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
              label={scenario.lines.choiceReject}
              min={THRESHOLD_BOUNDS.departmentReject[0]}
              max={THRESHOLD_BOUNDS.departmentReject[1]}
              step={0.01}
              value={thresholds.departmentReject}
              disabled={!result || session.status === 'loading'}
              onChange={(value) => setThreshold('departmentReject', value)}
            />
            <ThresholdField
              id="threshold-auto"
              label={scenario.lines.choiceAuto}
              hint={scenario.lines.choiceAutoHint}
              min={THRESHOLD_BOUNDS.departmentAuto[0]}
              max={THRESHOLD_BOUNDS.departmentAuto[1]}
              step={0.01}
              value={thresholds.departmentAuto}
              disabled={!result || session.status === 'loading'}
              onChange={(value) => setThreshold('departmentAuto', value)}
            />
            {scenario.lines.score && (
              <ThresholdField
                id="threshold-severity"
                label={scenario.lines.score}
                hint={scenario.lines.scoreHint}
                min={THRESHOLD_BOUNDS.severityEscalate[0]}
                max={THRESHOLD_BOUNDS.severityEscalate[1]}
                step={0.1}
                value={thresholds.severityEscalate}
                formatValue={(value) => (value > scoreMax ? 'off' : value.toFixed(1))}
                disabled={!result || session.status === 'loading'}
                onChange={(value) => setThreshold('severityEscalate', value)}
              />
            )}
            <ThresholdField
              id="threshold-refund"
              label={scenario.lines.booleanYes}
              hint={`A clear no is the mirror, at or below ${(1 - thresholds.refundYes).toFixed(2)}. Between them, escalate.`}
              min={THRESHOLD_BOUNDS.refundYes[0]}
              max={THRESHOLD_BOUNDS.refundYes[1]}
              step={0.01}
              value={thresholds.refundYes}
              disabled={!result || session.status === 'loading'}
              onChange={(value) => setThreshold('refundYes', value)}
            />
          </section>
        </div>
      )}
    </div>
  );
});

export default DecisionWorkbench;
