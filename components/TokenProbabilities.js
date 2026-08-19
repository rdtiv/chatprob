import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFrozenSet, frozenRows, rawOdds, oddsAmongCandidates, formatPercent } from '../lib/resoftmax';

function useSheetMode() {
  const [isSheet, setIsSheet] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse), (hover: none)');
    const sync = () => setIsSheet(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return isSheet;
}

export default function TokenProbabilities({
  probabilities,
  position,
  selectedToken,
  selectedLogprob,
  temperature,
  onTemperatureChange,
  sampledTemperature,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}) {
  const cardRef = useRef(null);
  const isSheet = useSheetMode();

  useEffect(() => {
    if (!cardRef.current) return;

    const card = cardRef.current;
    if (isSheet) {
      card.style.top = '';
      card.style.left = '';
      return;
    }
    const rect = card.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const padding = 12;
    const header = document.querySelector('.chat-header');
    const legend = document.querySelector('.confidence-legend');
    const form = document.querySelector('.message-form');
    const chromeBottom = (legend || header)?.getBoundingClientRect().bottom ?? 0;
    const topSafe = Math.max(padding, chromeBottom + 8);
    const bottomSafe = form
      ? form.getBoundingClientRect().top - 8
      : window.innerHeight - 80;

    // Prefer below the token so the card does not cover the header/legend.
    let top = position.y + 20;
    let left = position.x - (rect.width / 2);

    if (top + rect.height > bottomSafe) {
      top = position.y - rect.height - 8;
    }
    if (top < topSafe) {
      top = topSafe;
    }
    if (top + rect.height > bottomSafe) {
      top = Math.max(topSafe, bottomSafe - rect.height);
    }

    left = Math.max(padding, Math.min(left, viewportWidth - rect.width - padding));

    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }, [position, probabilities, isSheet]);

  // Frozen at open. temperature MUST NOT be a dependency here: invariant 1 says rows
  // never appear or disappear while the slider moves.
  const frozenSet = useMemo(
    () => buildFrozenSet({ topLogprobs: probabilities, sampledToken: selectedToken, sampledLogprob: selectedLogprob }),
    [probabilities, selectedToken, selectedLogprob]
  );
  const rows = useMemo(() => frozenRows(frozenSet), [frozenSet]);

  // `bottom` on a fixed element is measured from the layout viewport, which iOS does
  // not shrink for the keyboard; `visualViewport.offsetTop + height` is the bottom of
  // what is actually visible; `min(formTop, viewportBottom)` docks above the composer
  // when visible, above the keyboard when not.
  useEffect(() => {
    if (!isSheet) {
      const card = cardRef.current;
      if (card) { card.style.bottom = ''; card.style.maxHeight = ''; }
      return undefined;
    }
    const vv = window.visualViewport;
    const apply = () => {
      const card = cardRef.current;
      if (!card) return;
      const vvTop = vv ? vv.offsetTop : 0;
      const vvHeight = vv ? vv.height : window.innerHeight;
      const viewportBottom = vvTop + vvHeight;
      const form = document.querySelector('.message-form');
      const formTop = form ? form.getBoundingClientRect().top : viewportBottom;
      const dockTop = Math.min(formTop, viewportBottom) - 8;
      card.style.bottom = `${window.innerHeight - dockTop}px`;
      card.style.maxHeight = `${Math.max(160, Math.min(dockTop - vvTop - 12, Math.round(vvHeight * 0.55)))}px`;
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
    };
  }, [isSheet, frozenSet]);

  const [mode, setMode] = useState('among');

  if (rows.length === 0) return null;

  const t = typeof temperature === 'number' ? temperature : 1;
  const values = mode === 'among' ? oddsAmongCandidates(rows, t) : rawOdds(rows);

  const formatToken = (token) => {
    if (token === ' ') return '␣';
    if (token === '\n') return '↵';
    if (token === '\t') return '→';
    return token;
  };

  const candidateWord = rows.length === 1 ? 'candidate' : 'candidates';
  const noteCopy = mode === 'among'
    ? `Odds among these ${rows.length} ${candidateWord} at temp ${t.toFixed(1)} — rescaled to add up to 100%.`
    : `Raw model odds across the whole vocabulary. These are a different quantity, and they do not add up to 100%.`;
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
            min="0.2"
            max="1.8"
            step="0.1"
            value={t}
            onChange={(e) => onTemperatureChange?.(Number(e.target.value))}
            aria-label="Sampling temperature"
          />
        </div>
      )}
    </div>
  );
}
