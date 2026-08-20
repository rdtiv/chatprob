import { useState, useRef, useEffect, useMemo, useId } from 'react';
import TokenProbabilities from './TokenProbabilities';
import { tokenizeForDisplay, isPartialChunk } from '../lib/tokenizer';
import { sampledLogprob, findForkIndex, completionStats, formatPerplexity, formatJointOdds, confidenceColor } from '../lib/completionStats';

const EMPTY_TOP_LOGPROBS = {};

function sampledPercentage(tokenData) {
  const logprob = sampledLogprob(tokenData);
  if (logprob == null) return null;
  return Math.exp(logprob) * 100;
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

export default function Message({ message, onSelect, showHoverHint = false, onHoverUsed, sessionBilled, replayedIn, addedIn, tabsLocked = false, temperature, onTemperatureChange, tokenizer }) {
  const { role, completions, activeIndex = 0, content } = message;
  const [hoveredToken, setHoveredToken] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [lockNoteOpen, setLockNoteOpen] = useState(false);
  const lockNoteId = useId();
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

  const forkIndex = useMemo(
    () => (role === 'assistant' ? findForkIndex(completions) : -1),
    [role, completions]
  );
  const tabStats = useMemo(
    () => (Array.isArray(completions) ? completions.map(completionStats) : []),
    [completions]
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
    onSelect?.(index);
  };

  const activeStats = tabStats[safeIndex];
  const statsLine = activeStats
    ? [formatPerplexity(activeStats.perplexity), formatJointOdds(activeStats.jointLog10)].filter(Boolean).join(' · ')
    : '';
  const baseForkCopy = forkIndex === 0
    ? 'The replies split right here, at the very first word — they had nothing in common to begin with.'
    : `Identical until here. All ${comparedCount} replies produced exactly the same tokens up to this point, then chose differently.`;
  const forkNoteCopy = [baseForkCopy, statsLine && `This reply: ${statsLine}.`].filter(Boolean).join(' ');

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
      return <div className="message-text">{text || content || 'No response available'}</div>;
    }
    
    const hintIndex = showHoverHint ? pickHintTokenIndex(tokenProbabilities) : -1;

    return (
      <div className="message-text">
        {tokenProbabilities.map((tp, idx) => {
          const backgroundColor = getBackgroundColor(tp);
          return (
            <span
              key={forkIndex < 0 || idx < forkIndex ? `p${idx}` : `t${safeIndex}:${idx}`}
              className={`token${idx === hintIndex ? ' token-hint' : ''}${forkIndex >= 0 && idx === forkIndex ? ' token-fork' : ''}${forkIndex >= 0 && idx >= forkIndex ? ' is-after-fork' : ''}`}
              aria-label={forkIndex >= 0 && idx === forkIndex ? `${tp.token} — the first word where the ${completionCount} replies differ` : undefined}
              style={{ backgroundColor }}
              role="button"
              tabIndex={0}
              aria-expanded={hoveredToken?.index === idx}
              onMouseEnter={(e) => handleTokenMouseEnter(tp.token, idx, e)}
              onClick={(e) => handleTokenClick(tp.token, idx, e)}
              onMouseLeave={handleTokenMouseLeave}
              onKeyDown={(e) => {
                if (e.repeat) return;
                if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
                e.preventDefault();
                handleTokenClick(tp.token, idx, e);
              }}
            >
              {tp.token}
            </span>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className={`message ${role}-message`} ref={rootRef}>
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
                      stats && formatJointOdds(stats.jointLog10),
                    ].filter(Boolean);
                    return (
                      <button
                        key={index}
                        type="button"
                        role="tab"
                        aria-selected={index === safeIndex}
                        disabled={tabsLocked}
                        className={`completion-tab${index === safeIndex ? ' is-active' : ''}`}
                        title={tabsLocked ? 'This reply is locked into the conversation' : parts.join(' · ')}
                        onClick={(e) => {
                          e.currentTarget.focus();
                          handleSelect(index);
                        }}
                      >
                        <span className="completion-tab-number">{index + 1}</span>
                        {stats?.confidence != null && (
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
          {renderContent()}
          {(message.timestamp || message.usage) && (
            <div className="message-meta">
              {message.timestamp && (
                <span className="message-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString()}
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
              {message.usage?.prompt_tokens != null && (
                <span
                  className="token-usage"
                  title="in = everything sent this request. replayed = last turn's prompt, sent again. new = last reply + your latest message. out this tab = the reply you are looking at. total out this turn = all samples. conversation total = billed so far."
                >
                  {message.usage.prompt_tokens} in
                  {replayedIn != null
                    ? ` · ${replayedIn} replayed`
                    : ''}
                  {addedIn != null
                    ? ` · ${addedIn} new`
                    : ''}
                  {completions?.[safeIndex]?.tokenProbabilities?.length
                    ? ` · ${completions[safeIndex].tokenProbabilities.length} out this tab`
                    : ''}
                  {message.usage.completion_tokens != null
                    ? ` · ${message.usage.completion_tokens} total out this turn`
                    : ''}
                  {sessionBilled
                    ? ` | ${sessionBilled} conversation total`
                    : ''}
                </span>
              )}
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
            temperature={temperature}
            onTemperatureChange={onTemperatureChange}
            sampledTemperature={typeof message.sampledTemperature === 'number' ? message.sampledTemperature : null}
            forkNote={forkIndex >= 0 && hoveredToken.index === forkIndex ? forkNoteCopy : null}
            onDismiss={closeCard}
            onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
            onMouseLeave={handleTokenMouseLeave}
          />
        );
      })()}
    </div>
  );
} 