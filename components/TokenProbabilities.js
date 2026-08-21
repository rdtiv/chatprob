import { useMemo, useRef, useState } from 'react';
import { buildFrozenSet, frozenRows, rawOdds, oddsAmongCandidates, formatPercent } from '../lib/resoftmax';
import { TEMP_MIN, TEMP_MAX, TEMP_STEP } from '../lib/sampling';
import { useSheetMode, useAnchoredSurface } from './useAnchoredSurface';

export default function TokenProbabilities({
  probabilities,
  position,
  selectedToken,
  selectedLogprob,
  temperature,
  onTemperatureChange,
  sampledTemperature,
  forkNote,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}) {
  const cardRef = useRef(null);
  const isSheet = useSheetMode();
  const [mode, setMode] = useState('among');

  useAnchoredSurface({ ref: cardRef, isSheet, anchor: position, remeasureKey: mode });

  // Frozen at open. temperature MUST NOT be a dependency here: invariant 1 says rows
  // never appear or disappear while the slider moves.
  const frozenSet = useMemo(
    () => buildFrozenSet({ topLogprobs: probabilities, sampledToken: selectedToken, sampledLogprob: selectedLogprob }),
    [probabilities, selectedToken, selectedLogprob]
  );
  const rows = useMemo(() => frozenRows(frozenSet), [frozenSet]);

  if (rows.length === 0) return null;

  const t = typeof temperature === 'number' ? temperature : 1;
  const values = mode === 'among' ? oddsAmongCandidates(rows, t) : rawOdds(rows);

  const formatToken = (token) => {
    if (token === ' ') return '␣';
    if (token === '\n') return '↵';
    if (token === '\t') return '→';
    return token;
  };

  const noteCopy = mode !== 'among'
    ? `Raw model odds across the whole vocabulary. These are a different quantity, and they do not add up to 100%.`
    : rows.length === 1
      ? `Only one token is shown here, so it takes the whole 100% no matter the temperature. Switch to Raw odds for the model's actual confidence.`
      : `Odds among the ${rows.length} tokens shown at temp ${t.toFixed(1)} — rescaled to add up to 100%.`;
  const sampledLine = sampledTemperature == null
    ? null
    : (mode === 'among' && t !== sampledTemperature
        ? `Sampled at ${sampledTemperature.toFixed(1)} · showing what-if at ${t.toFixed(1)}`
        : `Sampled at ${sampledTemperature.toFixed(1)}`);

  return (
    <div
      ref={cardRef}
      className={`token-probabilities-card ${isSheet ? 'is-sheet' : 'is-popover'}`}
      role="dialog"
      aria-label="What else the model considered"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="token-probabilities-header">
        <h3 className="token-probabilities-title">Most likely</h3>
        <div className="token-probabilities-toggle" role="group" aria-label="Probability view">
          <button type="button" className={`token-probabilities-toggle-button${mode === 'among' ? ' is-active' : ''}`} aria-pressed={mode === 'among'} onClick={() => setMode('among')}>Among these</button>
          <button type="button" className={`token-probabilities-toggle-button${mode === 'raw' ? ' is-active' : ''}`} aria-pressed={mode === 'raw'} onClick={() => setMode('raw')}>Raw odds</button>
        </div>
        {isSheet && (
          <button type="button" className="token-probabilities-sheet-close" aria-label="Close" onClick={onDismiss}>×</button>
        )}
      </div>
      <ul className="token-probabilities-list">
        {frozenSet.candidates.map((row, index) => (
          <li key={row.token} className={`token-probabilities-row${row.isSampled ? ' is-sampled' : ''}`}>
            <span className="token-probabilities-bar" aria-hidden="true">
              <span className="token-probabilities-bar-fill" style={{ width: `${Math.min(100, values[index] * 100)}%` }} />
            </span>
            <span className="token-probabilities-token">{formatToken(row.token)}</span>
            <span className="token-probabilities-pct">{formatPercent(values[index])}</span>
          </li>
        ))}
      </ul>
      {frozenSet.sampledOutside && (
        <div className="sampled-outside-top">
          <div className="sampled-outside-top-row">
            <span className="sampled-outside-top-bar" aria-hidden="true">
              <span className="sampled-outside-top-bar-fill" style={{ width: `${Math.min(100, values[values.length - 1] * 100)}%` }} />
            </span>
            <span className="sampled-outside-top-token">{formatToken(frozenSet.sampledOutside.token)}</span>
            <span className="sampled-outside-top-pct">{formatPercent(values[values.length - 1])}</span>
          </div>
          <p className="sampled-outside-top-note">Sampled, but not in the top 5</p>
        </div>
      )}
      {forkNote && <p className="token-probabilities-fork-note">{forkNote}</p>}
      <p className="token-probabilities-note">{noteCopy}</p>
      {sampledLine && <p className="token-probabilities-sampled-line">{sampledLine}</p>}
      {isSheet && (
        <div className="token-probabilities-sheet-temp">
          <label className="token-probabilities-sheet-temp-label" htmlFor="token-card-temperature">
            Temp {t.toFixed(1)}
          </label>
          <input
            id="token-card-temperature"
            className="token-probabilities-sheet-temp-range"
            type="range"
            min={TEMP_MIN}
            max={TEMP_MAX}
            step={TEMP_STEP}
            value={t}
            onChange={(e) => onTemperatureChange?.(Number(e.target.value))}
            aria-label="Sampling temperature"
          />
        </div>
      )}
    </div>
  );
}
