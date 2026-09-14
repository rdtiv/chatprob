import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFrozenSet, frozenRows, rawOdds, oddsAmongCandidates, nucleusMembership, formatPercent } from '../lib/resoftmax';
import { TEMP_MIN, TEMP_MAX, TEMP_STEP, TOP_P_MIN, TOP_P_MAX, TOP_P_STEP } from '../lib/sampling';
import { useSheetMode, useAnchoredSurface } from './useAnchoredSurface';
import { useSampling } from './SamplingContext';

export default function TokenProbabilities({
  probabilities,
  position,
  selectedToken,
  selectedLogprob,
  sampledTemperature,
  forkNote,
  alternativesUnavailable,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}) {
  const cardRef = useRef(null);
  const isSheet = useSheetMode();
  const [mode, setMode] = useState('raw');
  const { temperature, setTemperature, topP, setTopP, boring } = useSampling();

  useAnchoredSurface({
    ref: cardRef,
    isSheet,
    anchor: position,
    remeasureKey: `${mode}:${typeof topP === 'number' && topP < 1 ? 'p' : 'f'}`,
  });

  // The entrance animation scales the card. useAnchoredSurface measures
  // getBoundingClientRect() in a PASSIVE effect (after paint), and a scale()
  // in flight would hand it a 4%-small box — the card would land ~4px off
  // vertically and ~4px off horizontally. Gating the animation on a class set
  // one commit later means the measurement happens on the untransformed box,
  // and it also kills the pre-existing one-frame flash of an unpositioned card.
  const [entered, setEntered] = useState(false);
  // One instance stays mounted while the pointer moves between tokens (no key
  // in Message.js), so the entrance plays once per hover session and later
  // tokens reposition instantly — deliberate: re-animating per token flickers.
  useEffect(() => { setEntered(true); }, []);

  // Frozen at open. temperature MUST NOT be a dependency here: invariant 1 says rows
  // never appear or disappear while the slider moves. top-p is the same rule —
  // it dims the tail of this set; it does not add or remove a row.
  const frozenSet = useMemo(
    () => buildFrozenSet({ topLogprobs: probabilities, sampledToken: selectedToken, sampledLogprob: selectedLogprob }),
    [probabilities, selectedToken, selectedLogprob]
  );
  const rows = useMemo(() => frozenRows(frozenSet), [frozenSet]);

  if (rows.length === 0) return null;

  const t = typeof temperature === 'number' ? temperature : 1;
  const p = typeof topP === 'number' && Number.isFinite(topP) ? topP : 1;
  const values = mode === 'among' ? oddsAmongCandidates(rows, t) : rawOdds(rows);
  const inNucleus = nucleusMembership(values, p);
  const nucleusCuts = inNucleus.some((kept) => !kept);
  const showNucleusUi = p < 1 || nucleusCuts;
  const keptCount = inNucleus.filter(Boolean).length;

  const formatToken = (token) => {
    if (token === ' ') return '␣';
    if (token === '\n') return '↵';
    if (token === '\t') return '→';
    return token;
  };

  const noteCopy = alternativesUnavailable
    ? `This reply is old enough that only the chosen token was kept, to stay inside the browser's storage limit. Its alternatives are gone; newer replies still have theirs. Switch to Of all words for the model's actual confidence.`
    : mode !== 'among'
      ? `The model's real odds across its whole vocabulary — they do not add up to 100%.`
      : rows.length === 1
        ? `Only one word is shown, so the what-if gives it 100%. Switch to Of all words for the real odds.`
        : `What-if: rescaled as if only these ${rows.length} words existed, at temp ${t.toFixed(1)}.`;
  const sampledLine = sampledTemperature == null
    ? null
    : (mode === 'among' && t !== sampledTemperature
        ? `Sampled at ${sampledTemperature.toFixed(1)} · showing what-if at ${t.toFixed(1)}`
        : `Sampled at ${sampledTemperature.toFixed(1)}`);
  const nucleusBit = !showNucleusUi
    ? ''
    : ` Nucleus at top-p ${p.toFixed(2)} keeps ${keptCount} of these ${rows.length}. A kept row might still be outside the real full-vocabulary nucleus; a dimmed row is definitely out.`;

  return (
    <div
      ref={cardRef}
      className={`token-probabilities-card glass glass--refract ${isSheet ? 'is-sheet' : 'is-popover'}${entered ? ' is-in' : ''}`}
      role="dialog"
      aria-label="What else the model considered"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="token-probabilities-header">
        <h3 className="token-probabilities-title">What it considered</h3>
        <div className="token-probabilities-toggle" role="group" aria-label="Probability view">
          <button type="button" className={`token-probabilities-toggle-button${mode === 'raw' ? ' is-active' : ''}`} aria-pressed={mode === 'raw'} onClick={() => setMode('raw')}>Of all words</button>
          <button type="button" className={`token-probabilities-toggle-button${mode === 'among' ? ' is-active' : ''}`} aria-pressed={mode === 'among'} onClick={() => setMode('among')}>What-if: only these</button>
        </div>
        {isSheet && (
          <button type="button" className="token-probabilities-sheet-close" aria-label="Close" onClick={onDismiss}>×</button>
        )}
      </div>
      <ul
        className="token-probabilities-list"
        style={isSheet ? { minHeight: `${Math.min(frozenSet.candidates.length, 5) * 34}px` } : undefined} // 34px = sheet row min-height
      >
        {frozenSet.candidates.map((row, index) => (
          <CandidateRow
            key={row.token}
            token={formatToken(row.token)}
            probability={values[index]}
            isSampled={row.isSampled}
            inNucleus={inNucleus[index]}
            showNucleusUi={showNucleusUi}
          />
        ))}
      </ul>
      {frozenSet.sampledOutside && (
        <div className={`sampled-outside-top${showNucleusUi && !inNucleus[inNucleus.length - 1] ? ' is-tail' : ''}`}>
          <div className="sampled-outside-top-row">
            <span className="sampled-outside-top-bar" aria-hidden="true">
              <span className="sampled-outside-top-bar-fill" style={{ width: `${Math.min(100, values[values.length - 1] * 100)}%` }} />
            </span>
            <span className="sampled-outside-top-token">
              {formatToken(frozenSet.sampledOutside.token)}
              {showNucleusUi && (
                <span className="token-probabilities-nucleus">
                  {inNucleus[inNucleus.length - 1] ? 'in' : 'tail'}
                </span>
              )}
            </span>
            <span className="sampled-outside-top-pct">{formatPercent(values[values.length - 1])}</span>
          </div>
          <p className="sampled-outside-top-note">landed — not in the top 5</p>
        </div>
      )}
      {forkNote && <p className="token-probabilities-fork-note">{forkNote}</p>}
      <p className="token-probabilities-note">{noteCopy}{nucleusBit}</p>
      {sampledLine && <p className="token-probabilities-sampled-line">{sampledLine}</p>}
      {isSheet && (
        <div className="token-probabilities-sheet-temp">
          <div className="token-probabilities-sheet-control">
            <label className="token-probabilities-sheet-temp-label" htmlFor="token-card-temperature">
              Temp {t.toFixed(1)}{boring ? ' — locked' : ''}
            </label>
            <input
              id="token-card-temperature"
              className="token-probabilities-sheet-temp-range"
              type="range"
              min={TEMP_MIN}
              max={TEMP_MAX}
              step={TEMP_STEP}
              value={t}
              disabled={boring}
              aria-disabled={boring}
              onChange={(e) => setTemperature(Number(e.target.value))}
              aria-label="Sampling temperature"
            />
          </div>
          <div className="token-probabilities-sheet-control">
            <label className="token-probabilities-sheet-temp-label" htmlFor="token-card-top-p">
              Top-p {p.toFixed(2)}
            </label>
            <input
              id="token-card-top-p"
              className="token-probabilities-sheet-temp-range"
              type="range"
              min={TOP_P_MIN}
              max={TOP_P_MAX}
              step={TOP_P_STEP}
              value={p}
              onChange={(e) => setTopP?.(Number(e.target.value))}
              aria-label="Nucleus top-p"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateRow({ token, probability, isSampled, inNucleus, showNucleusUi }) {
  const tail = showNucleusUi && !inNucleus;
  const nucleusLabel = showNucleusUi ? (inNucleus ? 'in' : 'tail') : null;
  return (
    <li
      className={`token-probabilities-row${isSampled ? ' is-sampled' : ''}${tail ? ' is-tail' : ''}`}
      aria-label={nucleusLabel
        ? `${token} ${formatPercent(probability)}, ${inNucleus ? 'inside the nucleus' : 'outside the nucleus, in the tail'}`
        : undefined}
    >
      <span className="token-probabilities-bar" aria-hidden="true">
        <span className="token-probabilities-bar-fill" style={{ width: `${Math.min(100, probability * 100)}%` }} />
      </span>
      <span className="token-probabilities-token">
        {token}
        {nucleusLabel && <span className="token-probabilities-nucleus">{nucleusLabel}</span>}
      </span>
      <span className="token-probabilities-pct">{formatPercent(probability)}</span>
    </li>
  );
}
