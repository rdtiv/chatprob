import { useState, useRef, useEffect, useMemo, useId, memo } from 'react';
import TokenProbabilities from './TokenProbabilities';
import { tokenizeForDisplay, isPartialChunk } from '../lib/tokenizer';
import { sampledLogprob, findForkIndex, completionStats, formatPerplexity, confidenceColor, confidenceBand } from '../lib/completionStats';
import { rateFor, turnCost, formatUsd } from '../lib/openaiRates';
import { knowledgeCutoff } from '../lib/modelFacts';
import { mentionsWeather } from '../lib/cutoffRelevance';

const EMPTY_TOP_LOGPROBS = {};

function sampledPercentage(tokenData) {
  const logprob = sampledLogprob(tokenData);
  if (logprob == null) return null;
  return Math.exp(logprob) * 100;
}

// The model emits arguments as a string, token by token. It can be malformed —
// pretty-print when it parses, show the raw bytes when it does not, and never throw.
function formatToolArguments(raw) {
  if (typeof raw !== 'string' || raw === '') return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function pickHintTokenIndex(tokenProbabilities) {
  if (!Array.isArray(tokenProbabilities) || tokenProbabilities.length === 0) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;
  tokenProbabilities.forEach((tokenData, index) => {
    if (!(tokenData.token || '').trim()) return;
    const percentage = sampledPercentage(tokenData);
    if (percentage == null) return;
    const distance = Math.abs(percentage - 55);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  if (bestIndex >= 0) return bestIndex;
  return tokenProbabilities.findIndex((tokenData) => (tokenData.token || '').trim());
}

const getBackgroundColor = (tokenData) => {
  const percentage = sampledPercentage(tokenData);
  if (percentage == null) return 'transparent';
  return confidenceColor(percentage, 0.15 + (percentage / 100) * 0.35);
};

function Message({ message, onSelect, messageIndex, showHoverHint = false, onHoverUsed, sessionBilled, replayedIn, addedIn, tabsLocked = false, tokenizer, forgotten = false, showCutoffDetail = false, cutoffPrompt = null }) {
  const { role, completions, activeIndex = 0, content } = message;
  const isStreaming = !!message.isStreaming;
  const [hoveredToken, setHoveredToken] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [lockNoteOpen, setLockNoteOpen] = useState(false);
  const lockNoteId = useId();
  const [usageOpen, setUsageOpen] = useState(false);
  const usageId = useId();
  // null = follow showCutoffNote (auto-shown on the first relevant reply);
  // true/false = the user overrode it with the pill's "?" button.
  const [cutoffOverride, setCutoffOverride] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const hoverGenerationRef = useRef(0);
  const activeTokenElRef = useRef(null);
  const rootRef = useRef(null);
  const completionCount = Array.isArray(completions) ? completions.length : 0;
  const safeIndex = completionCount
    ? Math.min(Math.max(activeIndex, 0), completionCount - 1)
    : 0;

  const userChunks = useMemo(() => {
    if (role !== 'user' || !tokenizer || typeof content !== 'string' || content.length === 0) return null;
    return tokenizeForDisplay(tokenizer, content).chunks;
  }, [role, tokenizer, content]);

  // Both memos short-circuit while streaming: completions gets a fresh identity
  // every rAF flush, and neither result is consumed until the reply settles.
  const forkIndexMemo = useMemo(
    () => (role === 'assistant' && !isStreaming ? findForkIndex(completions) : -1),
    [role, isStreaming, completions]
  );
  // Force no-fork while streaming: every span keys as a stable p{idx} so no
  // is-after-fork crossfade fires mid-stream.
  const forkIndex = isStreaming ? -1 : forkIndexMemo;
  const tabStats = useMemo(
    () => (Array.isArray(completions) && !isStreaming ? completions.map(completionStats) : []),
    [isStreaming, completions]
  );
  const comparedCount = useMemo(
    () => (Array.isArray(completions)
      ? completions.filter((c) => Array.isArray(c?.tokenProbabilities) && c.tokenProbabilities.length > 0).length
      : 0),
    [completions]
  );

  const markHoverUsed = () => {
    if (showHoverHint) onHoverUsed?.();
  };

  const clearHoverTimer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const invalidateHoverTimer = () => {
    hoverGenerationRef.current += 1;
    clearHoverTimer();
  };

  useEffect(() => () => clearHoverTimer(), []);

  const closeCard = () => {
    invalidateHoverTimer();
    setPinned(false);
    setHoveredToken(null);
  };

  useEffect(() => {
    if (!hoveredToken) return undefined;
    const onDocPointerDown = (event) => {
      // Interacting with the sampling surfaces must not dismiss a pinned card:
      // adjusting temperature while watching the card's what-if IS the lesson.
      if (event.target.closest('.sampling-panel, .sampling-button')) {
        return;
      }
      const hit = event.target.closest('.token, .token-probabilities-card');
      if (hit && rootRef.current?.contains(hit)) {
        return;
      }
      closeCard();
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [hoveredToken]);

  useEffect(() => {
    if (!hoveredToken) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      closeCard();
      if (activeTokenElRef.current?.isConnected) activeTokenElRef.current.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hoveredToken]);

  const handleTokenMouseEnter = (token, index, event) => {
    if (pinned) return;
    clearHoverTimer();
    markHoverUsed();
    const el = event.currentTarget;
    const generation = hoverGenerationRef.current + 1;
    hoverGenerationRef.current = generation;
    hoverTimeoutRef.current = setTimeout(() => {
      if (generation !== hoverGenerationRef.current) return;
      activeTokenElRef.current = el;
      setHoveredToken({ token, index });
      setMousePosition({ x: event.clientX, y: event.clientY });
    }, 100);
  };

  const handleTokenClick = (token, index, event) => {
    event.preventDefault();
    activeTokenElRef.current = event.currentTarget;
    markHoverUsed();
    invalidateHoverTimer();
    if (pinned && hoveredToken?.index === index) {
      closeCard();
      return;
    }
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const point = Number.isFinite(event.clientX) && event.clientX !== 0
      ? { x: event.clientX, y: event.clientY }
      : { x: rect ? rect.left + rect.width / 2 : 0, y: rect ? rect.bottom : 0 };
    setPinned(true);
    setHoveredToken({ token, index });
    setMousePosition(point);
  };
  
  const handleTokenMouseLeave = () => {
    invalidateHoverTimer();
    if (pinned) return;
    setHoveredToken(null);
  };

  const handleSelect = (index) => {
    if (tabsLocked || index === safeIndex) return;
    invalidateHoverTimer();
    setPinned(false);
    setHoveredToken(null);
    onSelect?.(messageIndex, index);
  };

  const activeStats = tabStats[safeIndex];
  const statsLine = activeStats
    ? [formatPerplexity(activeStats.perplexity)].filter(Boolean).join(' · ')
    : '';
  const baseForkCopy = forkIndex === 0
    ? 'The replies split right here, at the very first word — they had nothing in common to begin with.'
    : `Identical until here. All ${comparedCount} replies produced exactly the same tokens up to this point, then chose differently.`;
  const forkNoteCopy = [baseForkCopy, statsLine && `This reply: ${statsLine}.`].filter(Boolean).join(' ');

  const cutoff = (role === 'assistant' && !message.toolCall && !message.error && message.usage?.model)
    ? knowledgeCutoff(message.usage.model)
    : null;
  const showCutoffPill = !!cutoff && !isStreaming;
  const showCutoffNote = showCutoffDetail && showCutoffPill;
  const cutoffNoteVisible = cutoffOverride ?? showCutoffNote;
  const toolCall = message.toolCall || null;
  const toolResult = message.toolResult || null;
  const calls = Array.isArray(message.toolCalls) && message.toolCalls.length ? message.toolCalls : (toolCall ? [toolCall] : []);
  const results = Array.isArray(message.toolResults) && message.toolResults.length ? message.toolResults : (toolResult ? [toolResult] : []);
  const rounds = Array.isArray(message.usage?.rounds) ? message.usage.rounds : null;
  const spend = message.usage?.prompt_tokens != null
    ? turnCost(message.usage, rateFor(message.usage.model))
    : null;

  const renderContent = () => {
    // Handle non-assistant messages or messages without completions
    if (!completions || role !== 'assistant') {
      if (userChunks) {
        return (
          <div className="message-text">
            {userChunks.map((chunk, index) => (
              <span
                key={index}
                className={`user-token-chunk${index % 2 ? ' is-alt' : ''}${isPartialChunk(chunk) ? ' is-partial' : ''}`}
                aria-hidden={isPartialChunk(chunk) || undefined}
                title={isPartialChunk(chunk) ? 'Part of a character — this token is only a fragment of bytes' : undefined}
              >
                {isPartialChunk(chunk) ? '·' : chunk}
              </span>
            ))}
          </div>
        );
      }
      return <div className="message-text">{content}</div>;
    }

    // Add safety checks for completions array
    if (!Array.isArray(completions) || completions.length === 0) {
      return <div className="message-text">{content || 'No response available'}</div>;
    }

    const activeCompletion = completions[safeIndex];
    
    if (!activeCompletion) {
      return <div className="message-text">{content || 'No response available'}</div>;
    }

    const { text, tokenProbabilities } = activeCompletion;
    
    if (!tokenProbabilities || tokenProbabilities.length === 0) {
      if (isStreaming) return <div className="message-text" />;
      return <div className="message-text">{text || content || 'No response available'}</div>;
    }
    
    const hintIndex = showHoverHint ? pickHintTokenIndex(tokenProbabilities) : -1;

    return (
      <div className="message-text">
        {tokenProbabilities.map((tp, idx) => {
          const backgroundColor = getBackgroundColor(tp);
          const percentage = sampledPercentage(tp);
          const band = confidenceBand(percentage);
          const interactiveProps = isStreaming ? {} : {
            role: 'button',
            tabIndex: 0,
            'aria-expanded': hoveredToken?.index === idx,
            onMouseEnter: (e) => handleTokenMouseEnter(tp.token, idx, e),
            onClick: (e) => handleTokenClick(tp.token, idx, e),
            onMouseLeave: handleTokenMouseLeave,
            onKeyDown: (e) => {
              if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
              e.preventDefault(); // before the repeat check: held Space must never scroll the page
              if (e.repeat) return;
              handleTokenClick(tp.token, idx, e);
            },
          };
          return (
            <span
              key={forkIndex < 0 || idx < forkIndex ? `p${idx}` : `t${safeIndex}:${idx}`}
              className={`token${idx === hintIndex ? ' token-hint' : ''}${forkIndex >= 0 && idx === forkIndex ? ' token-fork' : ''}${forkIndex >= 0 && idx >= forkIndex ? ' is-after-fork' : ''}${band === 'unsure' ? ' is-unsure' : band === 'very-unsure' ? ' is-very-unsure' : ''}`}
              aria-label={forkIndex >= 0 && idx === forkIndex ? `${tp.token} — the first word where the ${completionCount} replies differ` : undefined}
              style={{ backgroundColor }}
              {...interactiveProps}
            >
              {tp.token}
            </span>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className={`message ${role}-message${forgotten ? ' is-forgotten' : ''}`} ref={rootRef} aria-busy={isStreaming ? 'true' : undefined}>
      <div className="message-inner">
        <div className="message-front">
          <div className="message-header">
            {completionCount > 1 && (
              <div className={`completion-tabs-wrap${tabsLocked ? ' is-locked' : ''}`}>
                <div
                  className={`completion-tabs${tabsLocked ? ' is-locked' : ''}`}
                  role="tablist"
                  aria-label={tabsLocked ? 'Locked into the conversation' : 'Alternative responses'}
                  title={tabsLocked ? 'This reply is locked into the conversation' : undefined}
                >
                  {completions.map((_, index) => {
                    const stats = tabStats[index];
                    const parts = [
                      `Response ${index + 1}`,
                      stats && formatPerplexity(stats.perplexity),
                    ].filter(Boolean);
                    return (
                      <button
                        key={index}
                        type="button"
                        role="tab"
                        aria-selected={index === safeIndex}
                        disabled={tabsLocked || isStreaming}
                        className={`completion-tab${index === safeIndex ? ' is-active' : ''}`}
                        title={tabsLocked ? 'This reply is locked into the conversation' : isStreaming ? undefined : parts.join(' · ')}
                        onClick={(e) => {
                          e.currentTarget.focus();
                          handleSelect(index);
                        }}
                      >
                        <span className="completion-tab-number">{index + 1}</span>
                        {!isStreaming && stats?.confidence != null && (
                          <span
                            className="completion-tab-dot"
                            aria-hidden="true"
                            style={{ backgroundColor: confidenceColor(stats.confidence, 0.9) }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                {tabsLocked && (
                  <>
                    <button
                      type="button"
                      className="completion-lock"
                      aria-expanded={lockNoteOpen}
                      aria-controls={lockNoteOpen ? lockNoteId : undefined}
                      aria-label="Why can't I switch replies?"
                      title="This reply is part of the conversation's history now"
                      onClick={() => setLockNoteOpen((open) => !open)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </button>
                    {lockNoteOpen && (
                      <span id={lockNoteId} className="completion-lock-note">
                        This reply is part of the conversation&rsquo;s history now — the next turn was built on it.
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {calls.length > 0 && (
            <div className="tool-round">
              {calls.map((call, i) => {
                const result = results[i];
                return (
                  <div key={call.id ?? i}>
                    <div className="tool-card is-call">
                      <div className="tool-card-head">
                        <span className="tool-card-badge">the model asked for a tool</span>
                        <span className="tool-card-name">{call.name}</span>
                      </div>
                      <pre className="tool-code">{formatToolArguments(call.arguments)}</pre>
                      {i === 0 && call.samples?.total > 1 && (
                        <p className="tool-card-samples">
                          {calls.length > 1
                            ? (call.samples.agreed === call.samples.total
                              ? `All ${call.samples.total} samples asked for these same calls.`
                              : `${call.samples.agreed} of ${call.samples.total} samples asked for these calls.`)
                            : (call.samples.agreed === call.samples.total
                              ? `All ${call.samples.total} samples asked for this same call.`
                              : `${call.samples.agreed} of ${call.samples.total} samples asked for this call.`)}
                        </p>
                      )}
                      {i === 0 && (
                        <p className="tool-card-note">
                          It did not run anything. It wrote this request &mdash; a function name and a JSON argument &mdash; one token at a time, the same way it writes words. Our server read it and made the HTTP call. The API returns no probabilities for these tokens, so there is nothing to shade here.
                        </p>
                      )}
                    </div>
                    {result && (
                      <div className={`tool-card is-result${result.ok ? '' : ' is-error'}`}>
                        <div className="tool-card-head">
                          <span className="tool-card-badge">our server called the weather API</span>
                          <span className="tool-card-status">
                            {result.ok ? (result.status ?? 'ok') : 'failed'}
                            {Number.isFinite(result.durationMs) ? ` · ${(result.durationMs / 1000).toFixed(1)}s` : ''}
                          </span>
                        </div>
                        <pre className="tool-code">{result.content}</pre>
                        {i === 0 && (
                          <p className="tool-card-note">
                            {result.ok
                              ? 'Unedited, exactly as it came back. This text goes to the model as a new message — it is everything the model knows about the weather right now.'
                              : 'The call failed. We hand the model the error, unedited, and let it answer from that.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {renderContent()}
          {cutoffNoteVisible && (
            <p className="cutoff-note">
              This model was trained on text that stops around {cutoff.label}. Nothing after that is in there{mentionsWeather(cutoffPrompt?.content) ? <> &mdash; today&rsquo;s weather included</> : null}. However sure it sounds, the colors only tell you the wording was expected, not that the facts are current.
            </p>
          )}
          {message.aborted && (
            <div className="message-aborted-note">
              {(message.abortReason ? message.abortReason.replace(/\.*$/, '.') : 'The connection dropped partway.')}
              {' '}
              {content ? 'This partial reply is not part of the conversation.' : 'No reply arrived.'}
            </div>
          )}
          {(message.timing || message.usage || (role === 'user' && userChunks)) && (
            <div className="message-meta">
              {message.timing && (
                <span
                  className="token-usage message-timing"
                  title={message.timing.streamed ? undefined : 'Nothing renders until the whole reply arrives, so the first token and the last arrive together.'}
                >
                  {(() => {
                    const b = (message.timing.totalMs / 1000).toFixed(1);
                    if (!message.timing.streamed) return `reply ${b}s`;
                    // A stream can reach done with zero deltas (e.g. a content
                    // filter) — no first token existed, so don't invent "0.0s".
                    if (message.timing.ttftMs == null) return `reply ${b}s · streamed`;
                    const a = (message.timing.ttftMs / 1000).toFixed(1);
                    return a === b ? `reply ${b}s · streamed` : `first token ${a}s · all replies ${b}s`;
                  })()}
                </span>
              )}
              {showCutoffPill && (
                <span className="cutoff-pill" title="Training data ends here; it cannot know anything after that.">
                  <span>knowledge ends ~{cutoff.label}</span>
                  <button
                    type="button"
                    className="cutoff-pill-why"
                    aria-label="What does the cutoff mean?"
                    aria-expanded={cutoffNoteVisible}
                    onClick={() => setCutoffOverride(!cutoffNoteVisible)}
                  >
                    ?
                  </button>
                </span>
              )}
              {role === 'user' && userChunks && (
                <span
                  className="token-usage"
                  title="Counted with the same tokenizer the model family uses. The reply's 'new' number runs a little higher — the chat wrapper rides along with every turn."
                >
                  ≈ {userChunks.length} tokens
                </span>
              )}
              {message.usage?.prompt_tokens != null && (() => {
                const summary = rounds && rounds.length > 1
                  ? `${rounds.map((r) => r.prompt_tokens).join(' + ')} in · ${message.usage.completion_tokens} out · ${rounds.length} requests`
                  : `${message.usage.prompt_tokens} in · ${message.usage.completion_tokens} out`;
                return (
                  <span className="token-usage token-usage-summary">
                    {summary}
                    <button
                      type="button"
                      className="token-usage-toggle"
                      aria-expanded={usageOpen}
                      aria-controls={usageOpen ? usageId : undefined}
                      aria-label={usageOpen ? 'Hide the token breakdown' : 'Show the token breakdown'}
                      onClick={() => setUsageOpen((open) => !open)}
                    >
                      {usageOpen ? '▴' : '▾'}
                    </button>
                  </span>
                );
              })()}
            </div>
          )}
          {usageOpen && message.usage?.prompt_tokens != null && (
            <div id={usageId} className="token-usage-details">
              <span>{rounds ? `${message.usage.prompt_tokens} in — everything sent this turn, across two requests` : `${message.usage.prompt_tokens} in — everything sent this request`}</span>
              {rounds && rounds.length > 1 && rounds.map((r, i) => (
                <span key={i}>
                  {r.prompt_tokens} in · {r.completion_tokens} out — {i === 0 ? 'first request, the one that ended in a tool call' : 'next request, the same prompt plus the tool call and its result'}
                </span>
              ))}
              {replayedIn != null && <span>{replayedIn} replayed — last turn&rsquo;s prompt, sent again</span>}
              {addedIn != null && <span>{addedIn} new — last reply plus your latest message</span>}
              {Number.isFinite(message.usage.cached_tokens) && message.usage.cached_tokens > 0 && (
                <span>{Math.min(message.usage.cached_tokens, message.usage.prompt_tokens)} from cache — billed at the discounted rate</span>
              )}
              {completions?.[safeIndex]?.tokenProbabilities?.length ? (
                <span>{completions[safeIndex].tokenProbabilities.length} out this tab — the reply you are looking at</span>
              ) : null}
              {message.usage.completion_tokens != null && (
                <span>{message.usage.completion_tokens} total out this turn — all samples</span>
              )}
              <span>{formatUsd(spend.total)} — this turn at list price</span>
              {sessionBilled ? <span>{sessionBilled} conversation total — billed so far</span> : null}
            </div>
          )}
          {showHoverHint && (
            <div className="hover-hint">Tap or hover a highlighted word to see what else the model considered</div>
          )}
        </div>
      </div>
      {hoveredToken && completions && (() => {
        const tokenData = completions[safeIndex]?.tokenProbabilities?.[hoveredToken.index];
        return (
          <TokenProbabilities
            probabilities={tokenData?.top_logprobs || EMPTY_TOP_LOGPROBS}
            position={mousePosition}
            selectedToken={hoveredToken.token}
            selectedLogprob={tokenData?.logprob}
            sampledTemperature={typeof message.sampledTemperature === 'number' ? message.sampledTemperature : null}
            forkNote={forkIndex >= 0 && hoveredToken.index === forkIndex ? forkNoteCopy : null}
            alternativesUnavailable={Boolean(completions?.[safeIndex]?.alternativesPruned)}
            onDismiss={closeCard}
            onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
            onMouseLeave={handleTokenMouseLeave}
          />
        );
      })()}
    </div>
  );
}

export default memo(Message);
