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
import { KEEP_TURNS_MIN, KEEP_TURNS_MAX, KEEP_TURNS_STEP, KEEP_TURNS_DEFAULT } from '../lib/contextWindow';
import { WEATHER_TOOL } from '../lib/weatherTool';

export default function SamplingPanel({ id, anchor, onClose }) {
  const panelRef = useRef(null);
  const isSheet = useSheetMode();
  useAnchoredSurface({ ref: panelRef, isSheet, anchor, remeasureKey: isSheet });
  const { temperature, topP, presencePenalty, boring, stream, tools, keepTurns, restoreKeepTurns, setSampling } = useSampling();

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

  const forgetting = keepTurns != null;
  const keepValue = keepTurns ?? restoreKeepTurns ?? KEEP_TURNS_DEFAULT;

  return (
    <div
      ref={panelRef}
      id={id}
      tabIndex={-1}
      className={`sampling-panel ${isSheet ? 'is-sheet' : 'is-popover'}`}
      role="dialog"
      aria-label="Controls"
    >
      <div className="sampling-panel-header">
        <h3 className="sampling-panel-title">Controls</h3>
        {isSheet && (
          <button type="button" className="sampling-panel-close" aria-label="Close" onClick={onClose}>×</button>
        )}
      </div>
      <div className="sampling-section">
      <h4 className="sampling-section-title">Sampling</h4>
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
          <label className="sampling-row-label" htmlFor={`${id}-boring`}>Make it repeatable</label>
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
        <p className="sampling-row-note">Send the same message twice and the replies should come back nearly identical. Sets temperature to 0 and pins a seed — best-effort, not guaranteed.</p>
      </div>
      </div>
      <div className="sampling-section">
        <h4 className="sampling-section-title">Memory</h4>
        <div className="sampling-row">
          <div className="sampling-row-head">
            <label className="sampling-row-label" htmlFor={`${id}-forget`}>Forget older turns</label>
            <input
              id={`${id}-forget`}
              className="sampling-switch"
              type="checkbox"
              checked={forgetting}
              onChange={(e) => {
                const on = e.target.checked;
                setSampling((s) => (on
                  ? { ...s, keepTurns: s.restoreKeepTurns ?? KEEP_TURNS_DEFAULT }
                  : { ...s, keepTurns: null, restoreKeepTurns: s.keepTurns ?? s.restoreKeepTurns ?? KEEP_TURNS_DEFAULT }));
              }}
            />
          </div>
          <p className="sampling-row-note">Your transcript keeps everything; the request stops carrying the older turns. Seed a fact, flip this on, then ask about that fact — the model cannot see what fell off the top.</p>
        </div>
        <div className={`sampling-row${forgetting ? '' : ' is-disabled'}`}>
          <div className="sampling-row-head">
            <label className="sampling-row-label" htmlFor={`${id}-keep`}>Exchanges replayed</label>
            <span className="sampling-row-value">{keepValue === 0 ? 'none' : `last ${keepValue}`}</span>
          </div>
          <input
            id={`${id}-keep`}
            className="sampling-range"
            type="range"
            min={KEEP_TURNS_MIN}
            max={KEEP_TURNS_MAX}
            step={KEEP_TURNS_STEP}
            value={keepValue}
            disabled={!forgetting}
            aria-disabled={!forgetting}
            onChange={(e) => setSampling((s) => ({ ...s, keepTurns: Number(e.target.value) }))}
          />
          <p className="sampling-row-note">0 replays nothing but the message you just typed; each step adds one earlier exchange back. The system prompt never falls off — the server adds it to every request.</p>
        </div>
      </div>
      <div className="sampling-section">
        <h4 className="sampling-section-title">Delivery</h4>
        <div className={`sampling-row${tools ? ' is-disabled' : ''}`}>
          <div className="sampling-row-head">
            <label className="sampling-row-label" htmlFor={`${id}-stream`}>Stream the reply</label>
            <input
              id={`${id}-stream`}
              className="sampling-switch"
              type="checkbox"
              checked={stream}
              disabled={tools}
              aria-disabled={tools || undefined}
              onChange={() => setSampling((s) => ({ ...s, stream: !s.stream }))}
            />
          </div>
          <p className="sampling-row-note">The reply is built one token at a time either way — streaming just lets you watch.</p>
          {tools && (
            <p className="sampling-row-note">Tools are on, so this turn arrives whole. The first request ends in a tool call rather than in words — there is nothing to watch appear.</p>
          )}
        </div>
      </div>
      <div className="sampling-section">
        <h4 className="sampling-section-title">Tools</h4>
        <div className="sampling-row">
          <div className="sampling-row-head">
            <label className="sampling-row-label" htmlFor={`${id}-tools`}>Let it call a weather tool</label>
            <input
              id={`${id}-tools`}
              className="sampling-switch"
              type="checkbox"
              checked={tools}
              onChange={() => setSampling((s) => ({ ...s, tools: !s.tools }))}
            />
          </div>
          <p className="sampling-row-note">Off, the model answers from training alone, and its training stopped years ago. On, we offer it one function it can ask for &mdash; it still cannot run anything itself.</p>
        </div>
        <div className="tool-description">
          <p className="tool-description-name">{WEATHER_TOOL.function.name}</p>
          <p>{WEATHER_TOOL.function.description}</p>
          <p className="tool-description-param">
            location <span>(string, required)</span>
          </p>
          <p>{WEATHER_TOOL.function.parameters.properties.location.description}</p>
        </div>
        <p className="sampling-row-note">This is the whole briefing. The description is the only documentation the model gets: it reads this, decides whether your question needs it, and writes the arguments itself.</p>
      </div>
    </div>
  );
}
