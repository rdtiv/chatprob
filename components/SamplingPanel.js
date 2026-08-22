import { useEffect, useRef } from 'react';
import { useSheetMode, useAnchoredSurface } from './useAnchoredSurface';
import { useSampling } from './SamplingContext';
import {
  TEMP_MIN,
  TEMP_MAX,
  TEMP_STEP,
  TOP_P_MIN,
  TOP_P_MAX,
  TOP_P_STEP,
  PENALTY_MIN,
  PENALTY_MAX,
  PENALTY_STEP,
} from '../lib/sampling';

export default function SamplingPanel({ id, anchor, onClose }) {
  const panelRef = useRef(null);
  const isSheet = useSheetMode();
  useAnchoredSurface({ ref: panelRef, isSheet, anchor, remeasureKey: isSheet });
  const { temperature, topP, presencePenalty, boring, stream, setSampling } = useSampling();

  useEffect(() => {
    const onPointerDown = (event) => {
      if (event.target.closest('.sampling-panel, .sampling-button')) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      id={id}
      tabIndex={-1}
      className={`sampling-panel ${isSheet ? 'is-sheet' : 'is-popover'}`}
      role="dialog"
      aria-label="Sampling controls"
    >
      <div className="sampling-panel-header">
        <h3 className="sampling-panel-title">Sampling</h3>
        {isSheet && (
          <button type="button" className="sampling-panel-close" aria-label="Close" onClick={onClose}>×</button>
        )}
      </div>
      <div className={`sampling-row${boring ? ' is-disabled' : ''}`}>
        <div className="sampling-row-head">
          <label className="sampling-row-label" htmlFor={`${id}-temp`}>Temperature</label>
          <span className="sampling-row-value">{temperature.toFixed(1)}</span>
        </div>
        <input
          id={`${id}-temp`}
          className="sampling-range"
          type="range"
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={TEMP_STEP}
          value={temperature}
          disabled={boring}
          aria-disabled={boring}
          onChange={(e) => setSampling((s) => ({ ...s, temperature: Number(e.target.value) }))}
        />
        <p className="sampling-row-note">Flattens or sharpens the odds before sampling. 0 always takes the most likely token.</p>
      </div>
      <div className="sampling-row">
        <div className="sampling-row-head">
          <label className="sampling-row-label" htmlFor={`${id}-topp`}>Top-p</label>
          <span className="sampling-row-value">{topP.toFixed(2)}</span>
        </div>
        <input
          id={`${id}-topp`}
          className="sampling-range"
          type="range"
          min={TOP_P_MIN}
          max={TOP_P_MAX}
          step={TOP_P_STEP}
          value={topP}
          onChange={(e) => setSampling((s) => ({ ...s, topP: Number(e.target.value) }))}
        />
        <p className="sampling-row-note">Only considers the most likely tokens whose odds add up to this much. 1 considers everything.</p>
      </div>
      <div className="sampling-row">
        <div className="sampling-row-head">
          <label className="sampling-row-label" htmlFor={`${id}-pen`}>Presence penalty</label>
          <span className="sampling-row-value">{presencePenalty.toFixed(2)}</span>
        </div>
        <input
          id={`${id}-pen`}
          className="sampling-range"
          type="range"
          min={PENALTY_MIN}
          max={PENALTY_MAX}
          step={PENALTY_STEP}
          value={presencePenalty}
          onChange={(e) => setSampling((s) => ({ ...s, presencePenalty: Number(e.target.value) }))}
        />
        <p className="sampling-row-note">Pushes the model away from words it has already used. Higher means more wandering.</p>
      </div>
      <div className="sampling-row">
        <div className="sampling-row-head">
          <label className="sampling-row-label" htmlFor={`${id}-boring`}>Make it boring</label>
          <input
            id={`${id}-boring`}
            className="sampling-switch"
            type="checkbox"
            checked={boring}
            onChange={(e) => {
              const on = e.target.checked;
              setSampling((s) => (on
                ? { ...s, boring: true, restoreTemperature: s.temperature, temperature: 0 }
                : { ...s, boring: false, temperature: s.restoreTemperature }));
            }}
          />
        </div>
        <p className="sampling-row-note">Sets temperature to 0 and pins a seed. Repeat a message and the replies should come back nearly identical — the seed is best-effort, so not guaranteed.</p>
      </div>
      <div className="sampling-section">
        <h4 className="sampling-section-title">Delivery</h4>
        <div className="sampling-row">
          <div className="sampling-row-head">
            <label className="sampling-row-label" htmlFor={`${id}-stream`}>Stream the reply</label>
            <input
              id={`${id}-stream`}
              className="sampling-switch"
              type="checkbox"
              checked={stream}
              onChange={() => setSampling((s) => ({ ...s, stream: !s.stream }))}
            />
          </div>
          <p className="sampling-row-note">The reply is built one token at a time either way — streaming just lets you watch.</p>
        </div>
      </div>
    </div>
  );
}
