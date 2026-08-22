import { useMemo, memo } from 'react';

function PromptStaircase({ messages }) {
  const rows = useMemo(() => {
    // Baseline for each turn's FIRST row: the previous TURN's first-round
    // prompt — what actually gets replayed (the tool exchange itself never
    // is; later turns resend only the model's final text).
    let prevTurnFirstPrompt = null;
    let turnNumber = 0;
    const built = [];

    // A tool turn is two requests, not one — expand its usage.rounds into two
    // rows (round 1, round 2) so each bar is really one request, and each
    // round's own prompt/cached tokens drive its bar instead of the two-round
    // sum. A message without rounds still contributes exactly one row.
    (messages || []).forEach((item) => {
      if (item.role !== 'assistant' || item.usage?.prompt_tokens == null) return;
      const rounds = Array.isArray(item.usage.rounds) && item.usage.rounds.length > 1 ? item.usage.rounds : null;
      const entries = rounds
        ? rounds.map((round) => ({ prompt: round.prompt_tokens, cached: round.cached_tokens }))
        : [{ prompt: item.usage.prompt_tokens, cached: item.usage.cached_tokens }];

      turnNumber += 1;
      let turnFirstPrompt = null;

      entries.forEach((entry, roundIndex) => {
        const prompt = entry.prompt;
        // A tool turn's SECOND row compares against its own first row — the
        // tool call and its result are the new tokens for that request, not
        // anything carried over from an earlier turn.
        const replayed = roundIndex === 0 ? (prevTurnFirstPrompt ?? 0) : (turnFirstPrompt ?? 0);
        const rawCached = Number.isFinite(entry.cached) ? entry.cached : 0;
        const cached = Math.min(Math.max(rawCached, 0), prompt);
        // Clamped to [0, prompt - cached] so a bar never overflows when the
        // prompt shrinks between requests (tools toggled off, truncation).
        const replayedUncached = Math.max(0, Math.min(replayed - cached, prompt - cached));
        const added = Math.max(0, prompt - cached - replayedUncached);

        built.push({
          key: `${item.timestamp ?? turnNumber}:${roundIndex}`,
          turn: turnNumber,
          roundIndex,
          roundsCount: entries.length,
          prompt,
          replayed,
          replayedUncached,
          cached,
          added,
        });

        if (roundIndex === 0) turnFirstPrompt = prompt;
      });

      prevTurnFirstPrompt = turnFirstPrompt;
    });

    return built;
  }, [messages]);

  if (!rows.length) return null;

  const maxPrompt = Math.max(...rows.map((row) => row.prompt), 1);
  const anyCached = rows.some((row) => row.cached > 0);

  const finalRows = rows.map((row, index) => {
    const widthPct = (row.prompt / maxPrompt) * 100;
    const cachedPct = row.prompt > 0 ? (row.cached / row.prompt) * 100 : 0;
    const replayedPct = row.prompt > 0 ? (row.replayedUncached / row.prompt) * 100 : 0;
    const newPct = row.prompt > 0 ? (row.added / row.prompt) * 100 : 0;
    const ariaParts = [];
    if (row.cached > 0) ariaParts.push(`${row.cached} from cache`);
    if (row.replayedUncached > 0) ariaParts.push(`${row.replayedUncached} resent`);
    if (row.added > 0) ariaParts.push(`${row.added} new`);
    const detail = ariaParts.length ? ` — ${ariaParts.join(', ')}` : '';
    // A multi-round turn (tool loop) numbers its rows with a letter suffix
    // (2a, 2b) and its aria label calls out which request of how many this
    // is; a single-round turn keeps the plain number and existing aria.
    const isMultiRound = row.roundsCount > 1;
    const turnLabel = isMultiRound ? `${row.turn}${String.fromCharCode(97 + row.roundIndex)}` : `${row.turn}`;
    const ariaLabel = isMultiRound
      ? `Turn ${row.turn}, request ${row.roundIndex + 1} of ${row.roundsCount}: ${row.prompt} tokens in${detail}`
      : `Turn ${row.turn}: ${row.prompt} tokens in${detail}`;

    return {
      ...row,
      widthPct,
      cachedPct,
      replayedPct,
      newPct,
      ariaLabel,
      turnLabel,
      label: `${row.prompt} tokens${row.added > 0 && index > 0 ? ` · ${row.added} new` : ''}`,
    };
  });

  let note = "Each bar is one request. The pale part was already sent before — the API has no memory, so you pay to resend it every turn.";
  if (anyCached) {
    note += " The medium-violet part was served from OpenAI's prompt cache at a discount.";
  }

  return (
    <div className="prompt-staircase">
      <div className="prompt-staircase-legend">
        <span className="prompt-staircase-key"><span className="prompt-staircase-swatch is-replayed" />replayed</span>
        {anyCached && <span className="prompt-staircase-key"><span className="prompt-staircase-swatch is-cached" />cached</span>}
        <span className="prompt-staircase-key"><span className="prompt-staircase-swatch is-new" />new</span>
      </div>
      <ol className="prompt-staircase-rows">
        {finalRows.map((row) => (
          <li key={row.key} className="prompt-staircase-row" aria-label={row.ariaLabel}>
            <span className="prompt-staircase-turn">{row.turnLabel}</span>
            <span className="prompt-staircase-bar" style={{ width: `${row.widthPct}%` }} aria-hidden="true">
              {row.cached > 0 && <span className="prompt-staircase-seg is-cached" style={{ width: `${row.cachedPct}%` }} />}
              {row.replayedUncached > 0 && <span className="prompt-staircase-seg is-replayed" style={{ width: `${row.replayedPct}%` }} />}
              {row.added > 0 && <span className="prompt-staircase-seg is-new" style={{ width: `${row.newPct}%` }} />}
            </span>
            <span className="prompt-staircase-label">{row.label}</span>
          </li>
        ))}
      </ol>
      <p className="prompt-staircase-note">{note}</p>
    </div>
  );
}

export default memo(PromptStaircase);
